import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { verifyAgentAccessToken } from "./agent-token";
import { exportSecurityEvents, type ExportableEvent } from "./event-export";
import {
	enforceRateLimit,
	hashStable,
	pruneExpiredControlPlaneArtifacts,
	recordControlPlaneAudit,
	reserveIdempotencyKey,
} from "./request-guard";

function getBearerToken(headerValue: string | null) {
	if (!headerValue) return null;
	const value = headerValue.trim();
	if (!value.toLowerCase().startsWith("bearer ")) return null;
	return value.slice("bearer ".length).trim() || null;
}

function getString(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function retentionDaysForEvent(verdict: string, severity: string) {
	if (verdict === "deny" || severity === "critical") return 365;
	if (verdict === "ask" || severity === "warning") return 180;
	return 90;
}

function normalizeEvents(payload: unknown): Record<string, unknown>[] {
	if (!payload) return [];
	if (Array.isArray(payload))
		return payload.filter(
			(e) => e && typeof e === "object" && !Array.isArray(e),
		) as Record<string, unknown>[];
	if (typeof payload === "object") {
		const obj = payload as Record<string, unknown>;
		if (Array.isArray(obj.events)) {
			return obj.events.filter(
				(e) => e && typeof e === "object" && !Array.isArray(e),
			) as Record<string, unknown>[];
		}
	}
	return [];
}

function normalizePolicyCacheMetadata(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const input = value as Record<string, unknown>;
	const source = getString(input.source);
	if (!source) return null;
	return {
		source,
		usable: Boolean(input.usable),
		present: Boolean(input.present),
		policy_version: getString(input.policy_version || input.policyVersion, "unknown"),
		cached_at: getString(input.cached_at || input.cachedAt),
		expires_at: getString(input.expires_at || input.expiresAt),
		age_seconds: typeof input.age_seconds === "number" ? input.age_seconds : input.ageSeconds,
		ttl_seconds: typeof input.ttl_seconds === "number" ? input.ttl_seconds : input.ttlSeconds,
		key_matches: typeof input.key_matches === "boolean" ? input.key_matches : input.keyMatches,
		updated_at: new Date().toISOString(),
	};
}

function getLatestPolicyCacheMetadata(events: Record<string, unknown>[]): Record<string, unknown> | null {
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (!event) continue;
		const direct = normalizePolicyCacheMetadata(event.runtime_policy_cache);
		if (direct) return direct;
		const payload = event.payload;
		if (payload && typeof payload === "object" && !Array.isArray(payload)) {
			const nested = normalizePolicyCacheMetadata(
				(payload as Record<string, unknown>).runtime_policy_cache,
			);
			if (nested) return nested;
		}
	}
	return null;
}

export async function ingestFromRequest(input: {
	authorizationHeader: string | null;
	body: unknown;
	requestId?: string | null;
	ip?: string | null;
	userAgent?: string | null;
}): Promise<{ ok: true; accepted: number; duplicate?: boolean }> {
	const token = getBearerToken(input.authorizationHeader);
	if (!token) throw new Error("missing_agent_token");

	const claims = verifyAgentAccessToken(token);
	const uid = claims.uid;
	const agentId = claims.agent_id;

	const events = normalizeEvents(input.body);
	const requestId =
		(typeof (input.body as Record<string, unknown> | null)?.request_id ===
		"string"
			? String((input.body as Record<string, unknown>).request_id).trim()
			: "") ||
		input.requestId ||
		`req_${hashStable({ uid, agentId, body: input.body }).slice(0, 24)}`;

	const rate = await enforceRateLimit({
		action: "ingest",
		subject: `${uid}:${agentId}`,
		windowSeconds: 60,
		limit: Math.max(180, events.length * 3),
		weight: Math.max(1, events.length),
	});
	if (!rate.ok) {
		throw new Error(`rate_limited:${rate.retryAfterSeconds}`);
	}

	const reservation = await reserveIdempotencyKey({
		namespace: "ingest-request",
		key: requestId,
		fingerprint: hashStable({ uid, agentId, events, body: input.body }),
		ttlSeconds: 60 * 10,
		existingValue: { uid, agentId, accepted: events.length },
	});
	if (reservation.state === "duplicate") {
		await recordControlPlaneAudit({
			action: "ingest",
			outcome: "duplicate",
			uid,
			agent_id: agentId,
			subject: requestId,
			request_id: requestId,
			ip: input.ip ?? null,
			user_agent: input.userAgent ?? null,
			metadata: { accepted: events.length },
		});
		return { ok: true, accepted: 0, duplicate: true };
	}
	if (reservation.state === "conflict") {
		throw new Error("ingest_idempotency_conflict");
	}

	const col = adminDb.collection(`users/${uid}/events`);
	const normalizedEvents: ExportableEvent[] = [];
	const policyCache = getLatestPolicyCacheMetadata(events);

	for (let index = 0; index < events.length; index += 1) {
		const event = events[index];
		if (!event) continue;
		const type = getString(event.type, "event");
		const verdict = getString(event.verdict, "allow");
		const severity = getString(event.severity, "info");
		const eventId =
			typeof event.event_id === "string" && event.event_id.trim()
				? event.event_id.trim()
				: hashStable({
						requestId,
						agentId,
						index,
						type,
						verdict,
						severity,
						payload: event,
					}).slice(0, 32);
		const expiresAt = new Date(
			Date.now() +
				retentionDaysForEvent(verdict, severity) * 24 * 60 * 60 * 1000,
		);
		await col.doc(eventId).set({
			event_id: eventId,
			agent_id: agentId,
			type,
			verdict,
			severity,
			request_id: requestId,
			payload: event,
			expires_at: expiresAt.toISOString(),
			created_at: FieldValue.serverTimestamp(),
			updated_at: FieldValue.serverTimestamp(),
		});
		normalizedEvents.push({
			event_id: eventId,
			agent_id: agentId,
			type,
			verdict,
			severity,
			request_id: requestId,
			payload: event,
		});
	}

	const exportResult = await exportSecurityEvents({
		uid,
		events: normalizedEvents,
		db: adminDb,
	});

	await adminDb.collection(`users/${uid}/agents`).doc(agentId).set(
		{
			last_seen_at: FieldValue.serverTimestamp(),
			status: "connected",
			...(policyCache ? { runtime_policy_cache: policyCache } : {}),
			updated_at: FieldValue.serverTimestamp(),
		},
		{ merge: true },
	);

	await recordControlPlaneAudit({
		action: "ingest",
		outcome: "accepted",
		uid,
		agent_id: agentId,
		subject: requestId,
		request_id: requestId,
		ip: input.ip ?? null,
		user_agent: input.userAgent ?? null,
		metadata: { accepted: events.length, security_export: exportResult },
	});

	void pruneExpiredControlPlaneArtifacts().catch(() => {});

	return { ok: true, accepted: events.length };
}
