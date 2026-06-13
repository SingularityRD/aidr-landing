import { createHash, randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { adminDb, firebaseAdminEnvError } from "@/lib/firebase/admin";
import {
  devicePollByDeviceCode,
  deviceStart,
  deviceVerifyUserCode,
  enrollWithEnrollmentToken,
} from "@/lib/control-plane/device-auth";
import {
  consumeInstallCode,
  createInstallCode,
  generateInstallCode,
  isInstallCodeValid,
} from "@/lib/control-plane/install-code";
import { ingestFromRequest } from "@/lib/control-plane/ingest";
import { exportSecurityEvents } from "@/lib/control-plane/event-export";
import { getAgentRuntimePolicy } from "@/lib/control-plane/policy";
import {
  acknowledgePolicyDrift,
  normalizePolicyDriftAction,
  sanitizePolicyCacheForAcknowledgement,
} from "@/lib/control-plane/policy-drift";
import { deliverPolicyRolloutReminder } from "@/lib/control-plane/policy-rollout-delivery";
import { replayDeliveryFailure } from "@/lib/control-plane/delivery-replay";
import { updateDeliveryFailureCase } from "@/lib/control-plane/delivery-case";
import { updateIncidentCase } from "@/lib/control-plane/incident-case";
import {
  approvePolicyPublishRequest,
  createPolicyPublishRequest,
  publishRuntimePolicy,
} from "@/lib/control-plane/policy-publish";
import {
  enforceRateLimit,
  getRequestIp,
  getRequestUserAgent,
  recordControlPlaneAudit,
} from "@/lib/control-plane/request-guard";
import { demoUser, isDemoMode } from "@/lib/demo";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

// ── Types ───────────────────────────────────────────────────────────────────
type FilterOp = "eq" | "neq" | "gt";
type QueryFilter = { field: string; op: FilterOp; value: unknown };
type QueryPayload = {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert";
  columns?: string;
  values?: Record<string, unknown> | Record<string, unknown>[];
  filters?: QueryFilter[];
  order?: { field: string; ascending?: boolean };
  limit?: number;
  maybeSingle?: boolean;
  single?: boolean;
  head?: boolean;
  count?: "exact";
};

const READ_ONLY_QUERY_TABLES = new Set([
  "agents", "events", "incidents", "entitlements", "seat_usage",
  "subscriptions", "agent_seats", "referral_credits", "credential_shares",
  "agent_sync", "api_keys", "enrollment_tokens", "settings", "team_members",
]);

const MUTABLE_QUERY_TABLES = new Set(["agents", "settings"]);

// ── Helpers ─────────────────────────────────────────────────────────────────
function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function toIso(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toIso);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toIso(v);
    }
    return out;
  }
  return value;
}

async function getUserIdFromRequest(): Promise<string | null> {
  if (isDemoMode()) return demoUser.id;
  // Clerk auth — use the server helper
  const session = await auth();
  return session?.userId ?? null;
}

function userCollectionPath(uid: string, table: string): string | null {
  const map: Record<string, string> = {
    agents: `users/${uid}/agents`,
    events: `users/${uid}/events`,
    incidents: `users/${uid}/incidents`,
    entitlements: `users/${uid}/entitlements`,
    seat_usage: `users/${uid}/seat_usage`,
    subscriptions: `users/${uid}/subscriptions`,
    agent_seats: `users/${uid}/agent_seats`,
    referral_credits: `users/${uid}/referral_credits`,
    credential_shares: `users/${uid}/credential_shares`,
    agent_sync: `users/${uid}/agent_sync`,
    api_keys: `users/${uid}/api_keys`,
    enrollment_tokens: `users/${uid}/enrollment_tokens`,
    settings: `users/${uid}/settings`,
    team_members: `users/${uid}/team_members`,
  };
  return map[table] ?? null;
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function syncTeamMemberSnapshot(input: {
  uid: string;
  userId: string;
  email?: string | null;
  name?: string | null;
}) {
  await adminDb.collection(`users/${input.uid}/team_members`).doc(input.userId).set(
    {
      user_id: input.userId,
      email: input.email ?? null,
      name: input.name ?? null,
      source: "clerk_current_user",
      last_seen_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function resolveIncidentAssignee(input: {
  uid: string;
  actorUserId: string;
  actorEmail?: string | null;
  actorName?: string | null;
  requestedUserId?: string;
}) {
  const requested = input.requestedUserId?.trim();
  if (!requested || requested === input.actorUserId) {
    return {
      ownerUserId: input.actorUserId,
      ownerEmail: input.actorEmail ?? null,
      ownerName: input.actorName ?? null,
    };
  }

  const snap = await adminDb.collection(`users/${input.uid}/team_members`).doc(requested).get();
  if (!snap.exists) throw new Error("assignee_not_found");
  const data = snap.data() as Record<string, unknown>;
  return {
    ownerUserId: requested,
    ownerEmail: getString(data.email) || null,
    ownerName: getString(data.name) || null,
  };
}

// ── Seat / Billing helpers ──────────────────────────────────────────────────
async function ensureSeatUsage(uid: string) {
  const usageRef = adminDb.collection(`users/${uid}/seat_usage`).doc("current");
  const usageSnap = await usageRef.get();
  if (usageSnap.exists) return;

  const entRef = adminDb.collection(`users/${uid}/entitlements`).doc("current");
  const entSnap = await entRef.get();
  const ent = entSnap.exists ? (entSnap.data() as Record<string, unknown>) : {};
  const included = Number(ent.included_agents ?? 1);
  const extra = Number(ent.extra_agents ?? 0);

  await usageRef.set({
    included_agents: included,
    extra_agents: extra,
    allowed_agents: included + extra,
    current_agents: 0,
    updated_at: FieldValue.serverTimestamp(),
  });
}

async function readSeatUsage(uid: string): Promise<{ allowed_agents: number; current_agents: number }> {
  const usageRef = adminDb.collection(`users/${uid}/seat_usage`).doc("current");
  const usageSnap = await usageRef.get();
  const usage = usageSnap.exists ? (usageSnap.data() as Record<string, unknown>) : {};
  const allowed = Number(usage.allowed_agents ?? 1);

  const agentsSnap = await adminDb.collection(`users/${uid}/agents`).get();
  const current = agentsSnap.size;

  return { allowed_agents: allowed, current_agents: current };
}

async function recomputeSeatUsage(uid: string) {
  const agentsSnap = await adminDb.collection(`users/${uid}/agents`).get();
  const current = agentsSnap.docs.filter((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return getString(data.status, "pending") !== "deleted";
  }).length;

  const usageRef = adminDb.collection(`users/${uid}/seat_usage`).doc("current");
  const usageSnap = await usageRef.get();
  const existing = usageSnap.exists ? (usageSnap.data() as Record<string, unknown>) : {};
  const allowed = Number(existing.allowed_agents ?? existing.included_agents ?? 1);
  await usageRef.set(
    { current_agents: current, allowed_agents: allowed, updated_at: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { current_agents: current, allowed_agents: allowed };
}

// ── Device auth (unchanged core) ────────────────────────────────────────────
/**
 * Validate that the device-start origin matches allowed app origins.
 * Prevents attackers from generating verification URLs pointing to phishing domains.
 */
function isAllowedDeviceOrigin(origin: string): boolean {
  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (configured && origin.toLowerCase() === configured.toLowerCase()) return true;
  // Allow localhost for development
  if (process.env.NODE_ENV !== "production" && origin.startsWith("http://localhost")) return true;
  return false;
}

async function handleDeviceStart(request: NextRequest, body: Record<string, unknown>) {
  const origin = normalizeOrigin(getString(body.origin)) ?? new URL(request.url).origin;
  if (!isAllowedDeviceOrigin(origin)) {
    logger.warn({ origin }, "Rejected device-start with disallowed origin");
    throw new Error("Invalid origin");
  }
  const meta = (body.meta ?? {}) as Record<string, unknown>;
  return deviceStart({ origin, meta: { ...meta, ip: getRequestIp(request), user_agent: getRequestUserAgent(request.headers) } });
}

async function handleDeviceVerify(uid: string, body: Record<string, unknown>) {
  return deviceVerifyUserCode({
    uid,
    user_code: getString(body.user_code),
    ip: typeof body.ip === "string" ? body.ip : undefined,
    user_agent: typeof body.user_agent === "string" ? body.user_agent : undefined,
    ensureSeatUsage: async () => {
      await ensureSeatUsage(uid);
      return readSeatUsage(uid);
    },
  });
}

async function handleDevicePoll(request: NextRequest, body: Record<string, unknown>) {
  return devicePollByDeviceCode(getString(body.device_code), {
    ip: getRequestIp(request),
    user_agent: getRequestUserAgent(request.headers),
  });
}

async function handleEnroll(request: NextRequest, body: Record<string, unknown>) {
  const origin = new URL(request.url).origin;
  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request.headers);
  return enrollWithEnrollmentToken({
    enrollment_token: getString(body.enrollment_token),
    origin,
    iid: typeof body.iid === "string" ? body.iid : undefined,
    agent_runtime: typeof body.agent_runtime === "string" ? body.agent_runtime : undefined,
    agent_runtime_version: typeof body.agent_runtime_version === "string" ? body.agent_runtime_version : undefined,
    request_id: typeof body.request_id === "string" ? body.request_id : undefined,
    ip,
    user_agent: userAgent,
  });
}

async function handleIngest(request: NextRequest, body: Record<string, unknown>) {
  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request.headers);
  return ingestFromRequest({
    authorizationHeader: request.headers.get("authorization") || request.headers.get("Authorization"),
    body,
    requestId: request.headers.get("x-request-id") || request.headers.get("idempotency-key"),
    ip,
    userAgent,
  });
}

// ── Query runner ────────────────────────────────────────────────────────────
function applyFilters(
  docs: Array<{ id: string; data: Record<string, unknown> }>,
  filters: QueryFilter[] | undefined,
) {
  if (!filters?.length) return docs;
  return docs.filter((doc) =>
    filters.every((f) => {
      const value = doc.data[f.field];
      if (f.op === "eq") return value === f.value;
      if (f.op === "neq") return value !== f.value;
      if (f.op === "gt") return Number(value ?? 0) > Number(f.value ?? 0);
      return false;
    }),
  );
}

async function runQuery(uid: string, payload: QueryPayload, meta?: { ip?: string; userAgent?: string }) {
  const collectionPath = userCollectionPath(uid, payload.table);
  if (!collectionPath) throw new Error("Unsupported table");

  const col = adminDb.collection(collectionPath);
  const action = payload.action;
  const table = payload.table;

  if (!READ_ONLY_QUERY_TABLES.has(table)) throw new Error("Unsupported table");
  if (action === "insert") throw new Error("Unsupported query mutation");
  if (action === "delete") throw new Error("Unsupported query mutation");

  if (action === "upsert") {
    if (!MUTABLE_QUERY_TABLES.has(table)) throw new Error("Unsupported query mutation");
    const item = (payload.values ?? {}) as Record<string, unknown>;
    const id = getString(item.id) || col.doc().id;
    await col.doc(id).set({ ...item, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    if (table === "agents") await recomputeSeatUsage(uid);
    await recordControlPlaneAudit({ action: "query-upsert", outcome: "ok", uid, subject: table, ip: meta?.ip ?? null, user_agent: meta?.userAgent ?? null, metadata: { table, action: "upsert" } });
    return { data: [{ id, ...item }], error: null };
  }

  if (action === "update") {
    if (!MUTABLE_QUERY_TABLES.has(table)) throw new Error("Unsupported query mutation");
    const snap = await col.get();
    let docs = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }));
    docs = applyFilters(docs, payload.filters);
    for (const doc of docs) {
      await col.doc(doc.id).set({ ...((payload.values as Record<string, unknown>) ?? {}), updated_at: FieldValue.serverTimestamp() }, { merge: true });
    }
    if (table === "agents") await recomputeSeatUsage(uid);
    await recordControlPlaneAudit({ action: "query-update", outcome: "ok", uid, subject: table, ip: meta?.ip ?? null, user_agent: meta?.userAgent ?? null, metadata: { table, action: "update", count: docs.length } });
    return { data: null, error: null };
  }

  const snap = await col.get();
  const docsWithData = snap.docs.map((doc) => ({
    id: doc.id,
    data: { id: doc.id, ...(doc.data() as Record<string, unknown>) } as Record<string, unknown>,
  }));
  let docs = applyFilters(docsWithData, payload.filters).map((doc) => doc.data);

  if (payload.order?.field) {
    const field = payload.order.field;
    const asc = payload.order.ascending !== false;
    docs.sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const diff = String(av).localeCompare(String(bv));
      return asc ? diff : -diff;
    });
  }

  if (typeof payload.limit === "number" && payload.limit >= 0) {
    docs = docs.slice(0, payload.limit);
  }

  const normalized = docs.map((d) => toIso(d));
  if (payload.head && payload.count === "exact") {
    return { data: null, error: null, count: normalized.length };
  }
  if (payload.single || payload.maybeSingle) {
    return { data: normalized[0] ?? null, error: null };
  }
  return { data: normalized, error: null, count: normalized.length };
}

// ── API keys & enrollment tokens ────────────────────────────────────────────
async function handleApiKeys(uid: string, method: string, body: Record<string, unknown>) {
  const collection = adminDb.collection(`users/${uid}/api_keys`);
  if (method === "GET") {
    const snap = await collection.orderBy("created_at", "desc").get();
    const keys = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return { id: doc.id, label: data.label ?? null, revoked: Boolean(data.revoked), created_at: toIso(data.created_at) ?? new Date().toISOString() };
    });
    return { keys };
  }
  const action = getString(body.action);
  if (action === "create") {
    const plain = `aidr_live_${randomBytes(24).toString("hex")}`;
    const now = FieldValue.serverTimestamp();
    const docRef = collection.doc();
    await docRef.set({ label: getString(body.label).trim() || null, revoked: false, key_hash: hashSecret(plain), key_prefix: plain.slice(0, 14), created_at: now, updated_at: now });
    return { api_key: plain };
  }
  if (action === "revoke") {
    const id = getString(body.id);
    if (!id) throw new Error("Missing key id");
    await collection.doc(id).set({ revoked: true, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true };
  }
  throw new Error("Unsupported api-keys action");
}

async function handleEnrollmentTokens(uid: string, method: string, body: Record<string, unknown>) {
  const collection = adminDb.collection(`users/${uid}/enrollment_tokens`);
  if (method === "GET") {
    const snap = await collection.orderBy("created_at", "desc").get();
    const tokens = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return { id: doc.id, label: data.label ?? null, expires_at: toIso(data.expires_at) ?? new Date().toISOString(), consumed_at: toIso(data.consumed_at) ?? null, created_at: toIso(data.created_at) ?? new Date().toISOString() };
    });
    return { tokens };
  }
  const action = getString(body.action);
  if (action === "create") {
    const plain = `aidr_enroll_${randomBytes(20).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const docRef = collection.doc();
    await docRef.set({ label: getString(body.label).trim() || null, token_hash: hashSecret(plain), expires_at: expiresAt.toISOString(), consumed_at: null, created_at: FieldValue.serverTimestamp() });
    return { enrollment_token: plain };
  }
  if (action === "delete") {
    const id = getString(body.id);
    if (!id) throw new Error("Missing enrollment token id");
    await collection.doc(id).delete();
    return { ok: true };
  }
  throw new Error("Unsupported enrollment-tokens action");
}

// ── Waitlist (kept for compatibility, auto-approved) ────────────────────────
async function handleWaitlistSignup(body: Record<string, unknown>, meta?: { ip?: string; userAgent?: string }) {
  const email = getString(body.email).trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Invalid email");
  const rate = await enforceRateLimit({ action: "waitlist-signup", subject: `${meta?.ip ?? "unknown"}:${email}`, windowSeconds: 60 * 60, limit: 3 });
  if (!rate.ok) throw new Error(`rate_limited:${rate.retryAfterSeconds}`);
  await adminDb.collection("waitlist").add({ email, name: getString(body.name).trim() || null, company: getString(body.company).trim() || null, message: getString(body.message).trim() || null, created_at: FieldValue.serverTimestamp() });
  return { ok: true };
}

// ── Agent count ─────────────────────────────────────────────────────────────
async function handleAgentCount(uid: string) {
  const snap = await adminDb.collection(`users/${uid}/agents`).get();
  return { count: snap.size };
}

function normalizeOrigin(value: string | undefined | null): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.origin;
  } catch {
    return null;
  }
}

async function handleRuntimePolicy(request: NextRequest) {
  return getAgentRuntimePolicy({
    authorizationHeader: request.headers.get("authorization") || request.headers.get("Authorization"),
    db: adminDb,
  });
}

function getPublicAppOrigin(requestOrigin: string): string {
  // Prefer configured public base URL for all user-visible links.
  // Fall back to request origin for non-standard deployments / previews.
  return normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ?? requestOrigin;
}

function generateInstallPrompt(input: {
  appOrigin: string;
  code: string;
  email?: string;
}): string {
  const authUrl = `${input.appOrigin}/auth/${input.code}`;
  const billingUrl = `${input.appOrigin}/billing`;

  return `AIDR Security Enrollment

1) Install the AIDR connector:
\`\`\`bash
npx @singularityrd/aidr-setup --code ${input.code}
\`\`\`

2) Verify the device in your browser (must be the same account):
${authUrl}

Security note: If you did not request this enrollment, do not proceed.

Account: ${input.email ?? "your account"}
Manage seats & billing: ${billingUrl}`;
}

async function handleInstallPrompt(request: NextRequest, uid: string, email?: string) {
  const code = generateInstallCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await createInstallCode(adminDb, { code, uid, email, expiresAt });

  const requestOrigin = new URL(request.url).origin;
  const appOrigin = getPublicAppOrigin(requestOrigin);
  const prompt = generateInstallPrompt({ appOrigin, code, email });
  return {
    prompt,
    command: `npx @singularityrd/aidr-setup --code ${code}`,
    auth_url: `${appOrigin}/auth/${code}`,
    code,
    expires_at: expiresAt.toISOString(),
  };
}

async function handleInstallCode(uid: string, body: Record<string, unknown>) {
  const code = getString(body.code).toUpperCase();
  const action = getString(body.action);
  if (!code) throw new Error("Missing code");

  if (action === "validate") {
    const valid = await isInstallCodeValid(adminDb, code, uid);
    return { valid };
  }

  if (action === "consume") {
    return consumeInstallCode(adminDb, code, uid);
  }

  throw new Error("Unsupported install-code action");
}

// ── Billing (Polar) ─────────────────────────────────────────────────────────
import { createPolarCheckout } from "@/lib/billing/polar-client";

async function handleBillingCheckout(uid: string, body: Record<string, unknown>) {
  let email = getString(body.email).trim().toLowerCase();
  const seats = Number(body.seats || 1);
  // SECURITY: Never trust priceId from client. Use server-side env only.
  const priceId = process.env.POLAR_PRICE_MONTHLY_ID || "";

  if (!email) {
    email = isDemoMode()
      ? demoUser.email
      : (await currentUser())?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() ?? "";
  }
  if (!email) throw new Error("Email required for checkout");
  if (!priceId) throw new Error("Polar product price ID not configured");
  // Validate seats to prevent abuse
  if (!Number.isFinite(seats) || seats < 1 || seats > 100) {
    throw new Error("Invalid seat count");
  }

  const result = await createPolarCheckout(uid, email, priceId, Math.floor(seats));
  if (!result) throw new Error("Failed to create Polar checkout");

  return { checkout_url: result.checkoutUrl, checkout_id: result.checkoutId };
}

// ── Dispatch ────────────────────────────────────────────────────────────────
const MAX_BODY_SIZE_BYTES = 1024 * 1024; // 1MB

async function dispatchAction(request: NextRequest, action: string, uid: string | null) {
  const method = request.method.toUpperCase();
  let body: Record<string, unknown> = {};

  if (method !== "GET") {
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_BODY_SIZE_BYTES) {
      throw new Error("payload_too_large");
    }
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new Error("invalid_json");
    }
  }

  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request.headers);
  const requestId = request.headers.get("x-request-id") || request.headers.get("idempotency-key") || undefined;

  // Public endpoints (no auth required)
  if (action === "waitlist-signup") return handleWaitlistSignup(body, { ip, userAgent });
  if (action === "device-start") return handleDeviceStart(request, body);
  if (action === "device-poll") return handleDevicePoll(request, body);
  if (action === "enroll") return handleEnroll(request, body);
  if (action === "ingest") return handleIngest(request, body);
  if (action === "policy") return handleRuntimePolicy(request);

  // Auth required endpoints
  if (!uid) throw new Error("Unauthorized");
  await ensureSeatUsage(uid);

  const userActionLimits: Record<string, { limit: number; windowSeconds: number }> = {
    "api-keys": { limit: 12, windowSeconds: 60 },
    "enrollment-tokens": { limit: 12, windowSeconds: 60 },
    "billing-checkout": { limit: 8, windowSeconds: 60 },
    "device-verify": { limit: 10, windowSeconds: 60 },
    "agent-update": { limit: 20, windowSeconds: 60 },
    "seat-update": { limit: 20, windowSeconds: 60 },
    "install-prompt": { limit: 10, windowSeconds: 60 },
    "install-code": { limit: 12, windowSeconds: 60 },
    "policy-drift-ack": { limit: 30, windowSeconds: 60 },
    "policy-publish-request": { limit: 10, windowSeconds: 60 },
    "policy-publish-approve": { limit: 10, windowSeconds: 60 },
    "policy-publish": { limit: 10, windowSeconds: 60 },
    "policy-rollout-reminder": { limit: 6, windowSeconds: 60 },
    "delivery-failure-replay": { limit: 10, windowSeconds: 60 },
    "delivery-failure-case": { limit: 20, windowSeconds: 60 },
    "incident-case": { limit: 30, windowSeconds: 60 },
    "security-export-test": { limit: 5, windowSeconds: 60 },
    query: { limit: 30, windowSeconds: 60 },
  };

  const limitConfig = userActionLimits[action];
  if (limitConfig) {
    const rate = await enforceRateLimit({ action: `dashboard:${action}`, subject: uid, limit: limitConfig.limit, windowSeconds: limitConfig.windowSeconds });
    if (!rate.ok) throw new Error(`rate_limited:${rate.retryAfterSeconds}`);
  }

  switch (action) {
    case "api-keys":
      return handleApiKeys(uid, method, body);
    case "enrollment-tokens":
      return handleEnrollmentTokens(uid, method, body);
    case "billing-checkout":
      return handleBillingCheckout(uid, body);
    case "device-verify":
      return handleDeviceVerify(uid, { ...body, ip, user_agent: userAgent, request_id: requestId });
    case "agent-update": {
      const agentId = getString(body.id).trim();
      const mutation = body.mutation;
      if (!agentId) throw new Error("Missing agent id");
      if (!mutation || typeof mutation !== "object" || Array.isArray(mutation)) throw new Error("Missing agent mutation");
      const mutationObj = mutation as Record<string, unknown>;
      const allowedStatus = new Set(["pending", "connected", "paused", "deleted", "offline"]);
      const nextStatus = typeof mutationObj.status === "string" ? mutationObj.status.trim() : "";
      if (nextStatus && !allowedStatus.has(nextStatus)) throw new Error("Invalid agent status");
      const agentRef = adminDb.collection(`users/${uid}/agents`).doc(agentId);
      const update: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };
      if (typeof mutationObj.name === "string") update.name = mutationObj.name.trim() || "Unnamed agent";
      if (typeof mutationObj.runtime === "string") update.runtime = mutationObj.runtime.trim() || "unknown";
      if (nextStatus) {
        update.status = nextStatus;
        if (nextStatus === "deleted") update.deleted_at = FieldValue.serverTimestamp();
      }
      await agentRef.set(update, { merge: true });
      const usage = await recomputeSeatUsage(uid);
      await recordControlPlaneAudit({ action: "agent-update", outcome: "updated", uid, agent_id: agentId, subject: agentId, ip, user_agent: userAgent, metadata: { mutation: Object.keys(update), ...usage } });
      return { ok: true, agent_id: agentId, ...usage };
    }
    case "seat-update": {
      const seatId = getString(body.id).trim();
      const mutation = body.mutation;
      if (!seatId) throw new Error("Missing seat id");
      if (!mutation || typeof mutation !== "object" || Array.isArray(mutation)) throw new Error("Missing seat mutation");
      const mutationObj = mutation as Record<string, unknown>;
      const allowedStatus = new Set(["active", "paused", "deleted"]);
      const nextStatus = typeof mutationObj.status === "string" ? mutationObj.status.trim() : "";
      if (nextStatus && !allowedStatus.has(nextStatus)) throw new Error("Invalid seat status");
      const seatRef = adminDb.collection(`users/${uid}/agent_seats`).doc(seatId);
      const update: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };
      if (typeof mutationObj.agent_name === "string") update.agent_name = mutationObj.agent_name.trim() || "Unnamed agent";
      if (typeof mutationObj.agent_type === "string") update.agent_type = mutationObj.agent_type.trim() || "openclaw";
      if (nextStatus) {
        update.status = nextStatus;
        if (nextStatus === "deleted") update.deleted_at = FieldValue.serverTimestamp();
      }
      await seatRef.set(update, { merge: true });
      const agentRef = adminDb.collection(`users/${uid}/agents`).doc(seatId);
      const agentUpdate: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };
      if (typeof mutationObj.agent_name === "string") agentUpdate.name = mutationObj.agent_name.trim() || "Unnamed agent";
      if (nextStatus) {
        agentUpdate.status = nextStatus === "active" ? "connected" : nextStatus;
        if (nextStatus === "deleted") agentUpdate.deleted_at = FieldValue.serverTimestamp();
      }
      await agentRef.set(agentUpdate, { merge: true }).catch(() => {});
      const usage = await recomputeSeatUsage(uid);
      await recordControlPlaneAudit({ action: "seat-update", outcome: "updated", uid, agent_id: seatId, subject: seatId, ip, user_agent: userAgent, metadata: { mutation: Object.keys(update), ...usage } });
      return { ok: true, seat_id: seatId, ...usage };
    }
    case "query":
      return runQuery(uid, body as unknown as QueryPayload, { ip, userAgent });
    case "agents/count":
      return handleAgentCount(uid);
    case "install-prompt":
      return handleInstallPrompt(request, uid, getString(body.email));
    case "install-code":
      return handleInstallCode(uid, body);
    case "policy-drift-ack": {
      const agentId = getString(body.agent_id || body.agentId).trim();
      if (!agentId) throw new Error("missing_agent_id");
      const ack = await acknowledgePolicyDrift({
        db: adminDb,
        uid,
        agentId,
        actorUserId: uid,
        action: normalizePolicyDriftAction(body.action),
        currentPolicyVersion: getString(body.current_policy_version || body.currentPolicyVersion, "default"),
        alertLabel: getString(body.alert_label || body.alertLabel, "unknown"),
        reason: getString(body.reason, "Policy drift reviewed from settings."),
        runtimePolicyCache: sanitizePolicyCacheForAcknowledgement(body.runtime_policy_cache || body.runtimePolicyCache),
        requestId,
      });
      await recordControlPlaneAudit({
        action: "policy-drift-ack",
        outcome: ack.event.payload.action,
        uid,
        agent_id: agentId,
        subject: agentId,
        request_id: requestId,
        ip,
        user_agent: userAgent,
        metadata: {
          current_policy_version: ack.event.payload.current_policy_version,
          alert_label: ack.event.payload.alert_label,
        },
      });
      return { ok: true, agent_id: agentId, acknowledged_at: ack.acknowledged_at };
    }
    case "policy-publish": {
      const publish = await publishRuntimePolicy({
        db: adminDb,
        uid,
        actorUserId: uid,
        policyAsCode: body.policy_as_code || body.policyAsCode,
        approvalNote: body.approval_note || body.approvalNote,
      });
      await recordControlPlaneAudit({
        action: "policy-publish",
        outcome: "published",
        uid,
        subject: publish.policy_version,
        request_id: requestId,
        ip,
        user_agent: userAgent,
        metadata: {
          policy_hash: publish.policy_hash,
          policy_signature: publish.policy_signature,
          diff_count: publish.diff_count,
          event_id: publish.event_id,
        },
      });
      return publish;
    }
    case "policy-publish-request": {
      const request = await createPolicyPublishRequest({
        db: adminDb,
        uid,
        actorUserId: uid,
        policyAsCode: body.policy_as_code || body.policyAsCode,
        approvalNote: body.approval_note || body.approvalNote,
        requiredApprovals: body.required_approvals || body.requiredApprovals,
        reviewerUserIds: body.reviewer_user_ids || body.reviewerUserIds,
      });
      await recordControlPlaneAudit({
        action: "policy-publish-request",
        outcome: request.status,
        uid,
        subject: request.request_id,
        request_id: requestId,
        ip,
        user_agent: userAgent,
        metadata: {
          policy_version: request.policy_version,
          policy_hash: request.policy_hash,
          required_approvals: request.status === "pending_approval" ? request.required_approvals : null,
          approvals: request.approvals,
          event_id: request.event_id,
        },
      });
      return request;
    }
    case "policy-publish-approve": {
      const publishRequestId = getString(body.request_id || body.requestId).trim();
      if (!publishRequestId) throw new Error("missing_policy_publish_request_id");
      const approval = await approvePolicyPublishRequest({
        db: adminDb,
        uid,
        actorUserId: uid,
        requestId: publishRequestId,
      });
      await recordControlPlaneAudit({
        action: "policy-publish-approve",
        outcome: approval.status,
        uid,
        subject: publishRequestId,
        request_id: requestId,
        ip,
        user_agent: userAgent,
        metadata: {
          policy_version: approval.policy_version,
          policy_hash: approval.policy_hash,
          approvals: approval.approvals,
          event_id: approval.event_id,
        },
      });
      return approval;
    }
    case "policy-rollout-reminder": {
      const delivery = await deliverPolicyRolloutReminder({
        db: adminDb,
        uid,
        actorUserId: uid,
        ackFilter: body.ack_filter || body.ackFilter,
      });
      await recordControlPlaneAudit({
        action: "policy-rollout-reminder",
        outcome: delivery.failed > 0 ? "failed" : delivery.delivered > 0 ? "delivered" : "skipped",
        uid,
        subject: delivery.event_id,
        ip,
        user_agent: userAgent,
        metadata: {
          attempted: delivery.attempted,
          delivered: delivery.delivered,
          skipped: delivery.skipped,
          failed: delivery.failed,
          agent_count: delivery.agent_count,
        },
      });
      return delivery;
    }
    case "delivery-failure-replay": {
      const failureId = getString(body.failure_id || body.failureId).trim();
      if (!failureId) throw new Error("missing_delivery_failure_id");
      const replay = await replayDeliveryFailure({
        db: adminDb,
        uid,
        actorUserId: uid,
        failureId,
      });
      await recordControlPlaneAudit({
        action: "delivery-failure-replay",
        outcome: replay.status,
        uid,
        subject: failureId,
        request_id: requestId,
        ip,
        user_agent: userAgent,
        metadata: {
          channel: replay.channel,
          attempted: replay.attempted,
          delivered: replay.delivered,
          skipped: replay.skipped,
          failed: replay.failed,
          replay_event_id: replay.replay_event_id,
        },
      });
      return replay;
    }
    case "delivery-failure-case": {
      const failureId = getString(body.failure_id || body.failureId).trim();
      if (!failureId) throw new Error("missing_delivery_failure_id");
      const update = await updateDeliveryFailureCase({
        db: adminDb,
        uid,
        actorUserId: uid,
        failureId,
        action: body.action,
        reason: body.reason,
        nextStatus: body.next_status || body.nextStatus,
        slaDueAt: body.sla_due_at || body.slaDueAt,
      });
      await recordControlPlaneAudit({
        action: "delivery-failure-case",
        outcome: update.action,
        uid,
        subject: failureId,
        request_id: requestId,
        ip,
        user_agent: userAgent,
        metadata: {
          status: update.status,
          event_id: update.event_id,
        },
      });
      return update;
    }
    case "incident-case": {
      const incidentId = getString(body.incident_id || body.incidentId).trim();
      if (!incidentId) throw new Error("missing_incident_id");
      const agentId = getString(body.agent_id || body.agentId).trim();
      const actor = isDemoMode() ? null : await currentUser();
      const actorEmail = isDemoMode()
        ? demoUser.email
        : actor?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() ?? null;
      const actorName = isDemoMode()
        ? "Demo User"
        : [actor?.firstName, actor?.lastName].filter(Boolean).join(" ").trim() || actor?.username || actorEmail;
      await syncTeamMemberSnapshot({
        uid,
        userId: uid,
        email: actorEmail,
        name: actorName,
      });
      const requestedAssigneeId = getString(body.owner_user_id || body.ownerUserId).trim();
      const assignee = await resolveIncidentAssignee({
        uid,
        actorUserId: uid,
        actorEmail,
        actorName,
        requestedUserId: body.action === "assign" ? requestedAssigneeId : undefined,
      });
      const update = await updateIncidentCase({
        db: adminDb,
        uid,
        actorUserId: uid,
        actorEmail,
        actorName,
        ownerUserId: assignee.ownerUserId,
        ownerEmail: assignee.ownerEmail,
        ownerName: assignee.ownerName,
        incidentId,
        action: body.action,
        agentId,
        rootCause: body.root_cause || body.rootCause,
        reason: body.reason,
      });
      await recordControlPlaneAudit({
        action: "incident-case",
        outcome: update.action,
        uid,
        agent_id: agentId || null,
        subject: incidentId,
        request_id: requestId,
        ip,
        user_agent: userAgent,
        metadata: update,
      });
      return update;
    }
    case "security-export-test": {
      const sentAt = new Date().toISOString();
      const result = await exportSecurityEvents({
        uid,
        db: adminDb,
        recordFailure: false,
        events: [
          {
            event_id: `security_export_test_${Date.now()}`,
            agent_id: "dashboard:test",
            type: "security_export_test",
            verdict: "deny",
            severity: "critical",
            request_id: requestId ?? `req_${Date.now()}`,
            payload: {
              category: "security_export_test",
              artifact: "dashboard_settings",
              sent_at: sentAt,
              summary: "AIDR security export destination test.",
            },
          },
        ],
      });
      await recordControlPlaneAudit({
        action: "security-export-test",
        outcome: result.delivered > 0 ? "delivered" : result.failed > 0 ? "failed" : "skipped",
        uid,
        subject: "security_export",
        request_id: requestId,
        ip,
        user_agent: userAgent,
        metadata: result,
      });
      return { ok: true, sent_at: sentAt, ...result };
    }
    default:
      throw new Error("Unknown action");
  }
}

// ── HTTP handlers ───────────────────────────────────────────────────────────
export async function GET(request: NextRequest, context: { params: Promise<{ action?: string[] }> }) {
  return handleRequest(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ action?: string[] }> }) {
  return handleRequest(request, context);
}

const isProduction = process.env.NODE_ENV === "production";

async function handleRequest(request: NextRequest, context: { params: Promise<{ action?: string[] }> }) {
  const params = await context.params;
  const action = params.action?.join("/") ?? "";
  const uid = await getUserIdFromRequest();

  if (firebaseAdminEnvError) {
    return json(503, { error: firebaseAdminEnvError });
  }

  try {
    const data = await dispatchAction(request, action, uid);
    return json(200, data);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: rawMessage, action, uid }, "API action failed");

    // In production, never leak internal error details to the client.
    const knownSafeErrors = ["Unauthorized", "rate_limited:", "missing_", "invalid_", "expired", "agent_seat_limit", "agent_limit_exceeded"];
    const isKnownSafe = knownSafeErrors.some((prefix) => rawMessage.startsWith(prefix) || rawMessage === prefix);
    const clientMessage = isProduction && !isKnownSafe ? "Request failed" : rawMessage;

    const status = rawMessage === "Unauthorized" ? 401 : rawMessage.startsWith("rate_limited:") ? 429 : 400;
    return json(status, { error: clientMessage });
  }
}
