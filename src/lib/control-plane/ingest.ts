import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { authenticateAgent, ControlPlaneError } from "./agent-auth";
import { buildTenantEntitlement, entitlementResponseFragment } from "./entitlement";
import { exportSecurityEvents, type ExportableEvent } from "./event-export";
import { projectIngestEvent } from "./event-projection";
import {
	enforceRateLimit,
	hashStable,
	pruneExpiredControlPlaneArtifacts,
	recordControlPlaneAudit,
	reserveIdempotencyKey,
} from "./request-guard";

/** Limits mirror the aidr Supabase ingest function so both control planes behave alike. */
export const MAX_INGEST_EVENTS = 200;
export const MAX_INGEST_EVENT_BYTES = 256 * 1024;
export const MAX_INGEST_BODY_BYTES = 5 * 1024 * 1024;
const EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IID_MAX_LENGTH = 128;

function getString(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function retentionDaysForEvent(verdict: string, severity: string) {
	if (verdict === "deny" || severity === "critical") return 365;
	if (verdict === "ask" || severity === "warning") return 180;
	return 90;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** The connector sends `{ events: [...] }`; a bare array is accepted for older senders. */
function rawEvents(payload: unknown): unknown[] {
	if (Array.isArray(payload)) return payload;
	if (isPlainObject(payload)) {
		const events = payload.events;
		if (events === undefined || events === null) return [];
		if (Array.isArray(events)) return events;
		throw new ControlPlaneError("invalid_event", 400);
	}
	return [];
}

type ValidatedEvent = { event: Record<string, unknown>; eventId: string };

function validateEvents(raw: unknown[]): ValidatedEvent[] {
	if (raw.length > MAX_INGEST_EVENTS) throw new ControlPlaneError("events_batch_too_large", 413);
	const seen = new Set<string>();
	return raw.map((event) => {
		// Silently dropping a malformed entry would make the connector's
		// acknowledgement check fail forever; reject the batch instead.
		if (!isPlainObject(event)) throw new ControlPlaneError("invalid_event", 400);
		const eventId = typeof event.event_id === "string" ? event.event_id : "";
		if (!eventId) throw new ControlPlaneError("missing_event_id", 400);
		if (!EVENT_ID_PATTERN.test(eventId) || seen.has(eventId)) {
			throw new ControlPlaneError("invalid_event", 400);
		}
		seen.add(eventId);
		if (Buffer.byteLength(JSON.stringify(event), "utf8") > MAX_INGEST_EVENT_BYTES) {
			throw new ControlPlaneError("events_batch_too_large", 413);
		}
		return { event, eventId };
	});
}

function normalizePolicyCacheMetadata(value: unknown): Record<string, unknown> | null {
	if (!isPlainObject(value)) return null;
	const input = value;
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
		if (isPlainObject(payload)) {
			const nested = normalizePolicyCacheMetadata(payload.runtime_policy_cache);
			if (nested) return nested;
		}
	}
	return null;
}

export type IngestResult = {
	ok: true;
	accepted: number;
	duplicate?: boolean;
	acknowledged_event_ids: string[];
	agent_id: string;
	allowed_agents: number;
	entitlement: unknown;
	entitlement_signed?: unknown;
};

export async function ingestFromRequest(input: {
	authorizationHeader: string | null;
	body: unknown;
	requestId?: string | null;
	ip?: string | null;
	userAgent?: string | null;
}): Promise<IngestResult> {
	// Tenant (uid) and agent come ONLY from the verified token; nothing in the
	// request body can redirect a write to another tenant or agent.
	const { uid, agentId, agent } = await authenticateAgent({
		authorizationHeader: input.authorizationHeader,
	});

	if (!isPlainObject(input.body) && !Array.isArray(input.body)) {
		throw new ControlPlaneError("invalid_json", 400);
	}
	const bodyObject: Record<string, unknown> = isPlainObject(input.body) ? input.body : {};
	const iid = typeof bodyObject.iid === "string" ? bodyObject.iid.trim() : "";
	if (iid.length > IID_MAX_LENGTH) throw new ControlPlaneError("invalid_agent_metadata", 400);
	const boundIid =
		getString(agent.iid) || getString(agent.installation_id) || "";
	// A token minted for installation A must not report as installation B.
	if (boundIid && iid && boundIid !== iid) throw new ControlPlaneError("agent_key_mismatch", 403);

	const raw = rawEvents(input.body);
	if (raw.length > 0 && !iid) throw new ControlPlaneError("missing_iid", 400);
	const validated = validateEvents(raw);
	const events = validated.map((entry) => entry.event);
	const acknowledged = validated.map((entry) => entry.eventId);

	const requestId =
		getString(bodyObject.request_id).trim() ||
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
		throw new ControlPlaneError("rate_limited", 429, { retry_after_seconds: rate.retryAfterSeconds });
	}

	// Idempotency is namespaced by tenant AND agent: another tenant must not be
	// able to probe for, collide with or pre-claim this agent's request ids.
	const reservation = await reserveIdempotencyKey({
		namespace: "ingest-request",
		key: `${uid}:${agentId}:${requestId}`,
		fingerprint: hashStable({ uid, agentId, events, body: input.body }),
		ttlSeconds: 60 * 10,
		existingValue: { uid, agentId, accepted: events.length },
	});
	if (reservation.state === "conflict") {
		throw new ControlPlaneError("ingest_idempotency_conflict", 409);
	}
	const entitlement = entitlementResponseFragment(
		await buildTenantEntitlement({ uid, db: adminDb }),
	) as { allowed_agents: number; entitlement: unknown; entitlement_signed?: unknown };

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
		// A replay means the first response was lost. The connector keeps the batch
		// queued until every event id is acknowledged, so acknowledge them again.
		return {
			ok: true,
			accepted: 0,
			duplicate: true,
			acknowledged_event_ids: acknowledged,
			agent_id: agentId,
			...entitlement,
		};
	}

	const col = adminDb.collection(`users/${uid}/events`);
	const normalizedEvents: ExportableEvent[] = [];
	const policyCache = getLatestPolicyCacheMetadata(events);

	// Reject before writing anything if an event id already belongs to another
	// agent of this tenant: an enrolled agent must not overwrite a peer's history.
	const existing = await Promise.all(validated.map(({ eventId }) => col.doc(eventId).get()));
	for (const snap of existing) {
		if (snap.exists && (snap.data() as Record<string, unknown>).agent_id !== agentId) {
			throw new ControlPlaneError("event_id_conflict", 409);
		}
	}

	for (let index = 0; index < validated.length; index += 1) {
		const { event, eventId } = validated[index]!;
		// Store a server-side allow-list projection, never the raw client JSON.
		const stored: Record<string, unknown> = { ...projectIngestEvent(event), event_id: eventId };
		const type = getString(stored.type, "event");
		const verdict = getString(stored.verdict, "allow");
		const severity = getString(stored.severity, "info");
		normalizedEvents.push({
			event_id: eventId,
			agent_id: agentId,
			type,
			verdict,
			severity,
			request_id: requestId,
			payload: stored,
		});
		if (existing[index]!.exists) continue; // idempotent resend by the same agent
		const expiresAt = new Date(
			Date.now() + retentionDaysForEvent(verdict, severity) * 24 * 60 * 60 * 1000,
		);
		await col.doc(eventId).set({
			event_id: eventId,
			agent_id: agentId,
			type,
			verdict,
			severity,
			request_id: requestId,
			payload: stored,
			expires_at: expiresAt.toISOString(),
			// Native timestamp for the Firestore TTL policy (see firebase.json); expires_at stays the ISO string.
			expire_at: expiresAt,
			created_at: FieldValue.serverTimestamp(),
			updated_at: FieldValue.serverTimestamp(),
		});
	}

	// Webhook export is best-effort: events are already durable, and failing the
	// request here would make the connector resend (and re-export) the batch.
	const exportResult = await exportSecurityEvents({
		uid,
		events: normalizedEvents,
		db: adminDb,
	}).catch(() => ({ attempted: 0, delivered: 0, skipped: 0, failed: normalizedEvents.length }));

	// update() (not set-merge): never re-create an agent document that was
	// deleted between authentication and now.
	await adminDb
		.collection(`users/${uid}/agents`)
		.doc(agentId)
		.update({
			last_seen_at: FieldValue.serverTimestamp(),
			status: "connected",
			...(iid && !boundIid ? { iid, installation_id: iid } : {}),
			...(policyCache ? { runtime_policy_cache: policyCache } : {}),
			updated_at: FieldValue.serverTimestamp(),
		});

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

	return {
		ok: true,
		accepted: events.length,
		acknowledged_event_ids: acknowledged,
		agent_id: agentId,
		...entitlement,
	};
}
