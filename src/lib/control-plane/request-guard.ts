import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

export type RateLimitResult =
	| { ok: true; remaining: number; resetAt: string }
	| { ok: false; retryAfterSeconds: number };

export type IdempotencyResult<T = Record<string, unknown>> =
	| { state: "fresh" }
	| { state: "duplicate"; existing: T }
	| { state: "conflict"; existing: T };

type RateLimitInput = {
	action: string;
	subject: string;
	windowSeconds: number;
	limit: number;
	weight?: number;
};

type IdempotencyInput = {
	namespace: string;
	key: string;
	fingerprint: string;
	ttlSeconds: number;
	existingValue?: Record<string, unknown>;
};

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value))
		return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
	const entries = Object.entries(value as Record<string, unknown>).sort(
		([a], [b]) => a.localeCompare(b),
	);
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function hashStable(value: unknown): string {
	return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function getRequestIp(request: {
	headers: Headers;
	ip?: string | null;
}): string {
	const direct = request.ip?.trim();
	if (direct) return direct;

	// Trust Cloudflare's connecting IP header (only set by CF)
	const connecting = request.headers.get("cf-connecting-ip")?.trim();
	if (connecting) return connecting;

	// Trust Vercel's forwarded-for header (only set by Vercel edge)
	const vercelIp = request.headers.get("x-vercel-forwarded-for")?.trim();
	if (vercelIp) {
		const first = vercelIp.split(",")[0]?.trim();
		if (first) return first;
	}

	// Fallback to x-real-ip if set by a trusted reverse proxy
	const realIp = request.headers.get("x-real-ip")?.trim();
	if (realIp) return realIp;

	// X-Forwarded-For is UNTRUSTED — it can be spoofed by clients.
	// Only use as a last resort and log a warning.
	const forwardedFor = request.headers.get("x-forwarded-for");
	if (forwardedFor) {
		const first = forwardedFor.split(",")[0]?.trim();
		if (first) return first;
	}

	return "unknown";
}

export function getRequestUserAgent(headers: Headers): string {
	return headers.get("user-agent")?.trim() || "unknown";
}

function rateLimitDocId(
	action: string,
	subject: string,
	windowSeconds: number,
) {
	const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
	return hashStable({ action, subject, bucket, windowSeconds }).slice(0, 32);
}

export async function enforceRateLimit(
	input: RateLimitInput,
): Promise<RateLimitResult> {
	const windowSeconds = Math.max(1, Math.floor(input.windowSeconds));
	const limit = Math.max(1, Math.floor(input.limit));
	const weight = Math.max(1, Math.floor(input.weight ?? 1));
	const docId = rateLimitDocId(input.action, input.subject, windowSeconds);
	const ref = adminDb.collection("control_plane_rate_limits").doc(docId);
	const now = new Date();
	const resetAt = new Date(
		Math.ceil(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000,
	).toISOString();

	const result = await adminDb.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		const existing = snap.exists
			? (snap.data() as Record<string, unknown>)
			: {};
		const count = Number(existing.count ?? 0);
		if (count + weight > limit) {
			return { ok: false as const, retryAfterSeconds: windowSeconds };
		}

		tx.set(
			ref,
			{
				action: input.action,
				subject: input.subject,
				count: count + weight,
				limit,
				window_seconds: windowSeconds,
				reset_at: resetAt,
				created_at: existing.created_at ?? FieldValue.serverTimestamp(),
				updated_at: FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);

		return {
			ok: true as const,
			remaining: Math.max(0, limit - (count + weight)),
			resetAt,
		};
	});

	return result;
}

export async function reserveIdempotencyKey<T = Record<string, unknown>>(
	input: IdempotencyInput,
): Promise<IdempotencyResult<T>> {
	const docId = hashStable({
		namespace: input.namespace,
		key: input.key,
	}).slice(0, 48);
	const ref = adminDb.collection("control_plane_idempotency").doc(docId);
	const expiresAt = new Date(
		Date.now() + Math.max(1, input.ttlSeconds) * 1000,
	).toISOString();
	const fingerprint = input.fingerprint;

	const result = await adminDb.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		if (snap.exists) {
			const data = snap.data() as Record<string, unknown>;
			const existingFingerprint =
				typeof data.fingerprint === "string" ? data.fingerprint : "";
			const existing = (data.result as T) ?? (input.existingValue as T);
			if (existingFingerprint === fingerprint) {
				return { state: "duplicate" as const, existing };
			}
			return { state: "conflict" as const, existing };
		}

		tx.set(ref, {
			namespace: input.namespace,
			key: input.key,
			fingerprint,
			result: input.existingValue ?? null,
			expires_at: expiresAt,
			created_at: FieldValue.serverTimestamp(),
			updated_at: FieldValue.serverTimestamp(),
		});
		return { state: "fresh" as const };
	});

	return result;
}

export async function recordControlPlaneAudit(entry: {
	action: string;
	outcome: string;
	uid?: string | null;
	agent_id?: string | null;
	subject?: string | null;
	request_id?: string | null;
	ip?: string | null;
	user_agent?: string | null;
	metadata?: Record<string, unknown>;
}) {
	const expiresAt = new Date(
		Date.now() + 90 * 24 * 60 * 60 * 1000,
	).toISOString();
	await adminDb.collection("control_plane_audit").add({
		action: entry.action,
		outcome: entry.outcome,
		uid: entry.uid ?? null,
		agent_id: entry.agent_id ?? null,
		subject: entry.subject ?? null,
		request_id: entry.request_id ?? null,
		ip: entry.ip ?? null,
		user_agent: entry.user_agent ?? null,
		metadata: entry.metadata ?? {},
		expires_at: expiresAt,
		created_at: FieldValue.serverTimestamp(),
	});
}

export async function pruneExpiredControlPlaneArtifacts() {
	const nowIso = new Date().toISOString();
	const collections = [
		"control_plane_rate_limits",
		"control_plane_idempotency",
		"control_plane_audit",
		"device_codes",
	] as const;

	await Promise.all(
		collections.map(async (collectionName) => {
			const snap = await adminDb
				.collection(collectionName)
				.where("expires_at", "<=", nowIso)
				.limit(50)
				.get()
				.catch(() => null);
			if (!snap) return;
			await Promise.all(
				snap.docs.map((doc) => doc.ref.delete().catch(() => {})),
			);
		}),
	);

	const collectionGroups = ["events", "incidents"] as const;
	await Promise.all(
		collectionGroups.map(async (collectionGroupName) => {
			const snap = await adminDb
				.collectionGroup(collectionGroupName)
				.where("expires_at", "<=", nowIso)
				.limit(50)
				.get()
				.catch(() => null);
			if (!snap) return;
			await Promise.all(
				snap.docs.map((doc) => doc.ref.delete().catch(() => {})),
			);
		}),
	);
}
