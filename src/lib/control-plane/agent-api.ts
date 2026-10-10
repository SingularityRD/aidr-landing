import { NextRequest, NextResponse } from "next/server";
import { adminDb, firebaseAdminEnvError } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";
import { authenticateAgent, ControlPlaneError, getBearerToken } from "./agent-auth";
import { devicePollByDeviceCode, deviceStart, enrollWithEnrollmentToken } from "./device-auth";
import {
  buildTenantEntitlement,
  entitlementResponseFragment,
  getEntitlementSigningConfig,
  getEntitlementTiming,
  signCanonicalEd25519,
} from "./entitlement";
import { ingestFromRequest, MAX_INGEST_BODY_BYTES } from "./ingest";
import { getAgentRuntimePolicy } from "./policy";
import { getRequestIp, getRequestUserAgent } from "./request-guard";

/**
 * HTTP adapters for the connector-facing control-plane API.
 *
 * These are shared by `/v1/*` (the paths the AIDR connector resolves via
 * `controlPlaneUrl(endpoint, op)`) and the `/api/v1/[[...action]]` catch-all, so
 * both mount points speak one wire contract. The contract is pinned by
 * `src/lib/control-plane/__tests__/connector-contract.test.ts`, which drives the
 * real aidr `ControlPlaneClient` against these handlers.
 */

const SMALL_BODY_LIMIT = 16 * 1024;

type Handler = (request: NextRequest) => Promise<NextResponse>;

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ControlPlaneError) {
    const headers: Record<string, string> = {};
    const retry = error.extra.retry_after_seconds;
    if (error.status === 429 && typeof retry === "number") headers["Retry-After"] = String(retry);
    return jsonResponse(error.status, { ...error.extra, error: error.code }, headers);
  }
  // Unexpected failures are logged server-side and reported as a generic,
  // retryable 503: leaking e.message would expose internals, and a 4xx would
  // make the connector drop a durable telemetry batch for a transient fault.
  logger.error({ error: error instanceof Error ? error.message : String(error) }, "control-plane request failed");
  return jsonResponse(503, { error: "control_plane_unavailable" });
}

function guard(handler: Handler): Handler {
  return async (request) => {
    if (firebaseAdminEnvError) {
      logger.error({ error: firebaseAdminEnvError }, "control-plane backend not configured");
      return jsonResponse(503, { error: "control_plane_unconfigured" });
    }
    try {
      return await handler(request);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Read a JSON object body with a hard byte cap; an empty body is `{}` unless `requireBody`. */
async function readJsonObject(request: NextRequest, maxBytes: number, requireBody = false) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new ControlPlaneError("payload_too_large", 413);
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new ControlPlaneError("payload_too_large", 413);
  if (!text.trim()) {
    if (requireBody) throw new ControlPlaneError("invalid_json", 400);
    return {} as Record<string, unknown>;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ControlPlaneError("invalid_json", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ControlPlaneError("invalid_json", 400);
  }
  return parsed as Record<string, unknown>;
}

function configuredOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** Public base used in links returned to the connector; never a request-supplied Host. */
function publicOrigin(request: NextRequest): string {
  return configuredOrigin() ?? new URL(request.url).origin;
}

function nestedMeta(body: Record<string, unknown>): Record<string, unknown> {
  const meta = body.meta;
  return meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
}

export const deviceStartHandler: Handler = guard(async (request) => {
  const body = await readJsonObject(request, SMALL_BODY_LIMIT);
  const legacy = nestedMeta(body);
  const data = await deviceStart({
    origin: publicOrigin(request),
    meta: {
      iid: body.iid ?? legacy.iid,
      agent_runtime: body.agent_runtime ?? legacy.agent_runtime,
      agent_runtime_version: body.agent_runtime_version ?? legacy.agent_runtime_version,
      ip: getRequestIp(request),
      user_agent: getRequestUserAgent(request.headers),
    },
  });
  return jsonResponse(200, { ok: true, ...data });
});

export const devicePollHandler: Handler = guard(async (request) => {
  const body = await readJsonObject(request, SMALL_BODY_LIMIT);
  // The connector sends the device code as a Bearer credential; the JSON-body
  // form is kept for the dashboard-style /api/v1 callers.
  const deviceCode =
    getBearerToken(request.headers.get("authorization")) ??
    (typeof body.device_code === "string" ? body.device_code : "");
  const data = await devicePollByDeviceCode(deviceCode, {
    ip: getRequestIp(request),
    user_agent: getRequestUserAgent(request.headers),
  });
  return jsonResponse(200, data);
});

export const enrollHandler: Handler = guard(async (request) => {
  const body = await readJsonObject(request, SMALL_BODY_LIMIT);
  const enrollmentToken =
    getBearerToken(request.headers.get("authorization")) ??
    (typeof body.enrollment_token === "string" ? body.enrollment_token : "");
  if (!enrollmentToken) throw new ControlPlaneError("missing_enrollment_token", 401);
  // Validate entitlement provisioning BEFORE consuming a one-time token.
  getEntitlementSigningConfig();
  getEntitlementTiming();

  const result = await enrollWithEnrollmentToken({
    enrollment_token: enrollmentToken,
    origin: publicOrigin(request),
    iid: typeof body.iid === "string" ? body.iid : undefined,
    agent_runtime: typeof body.agent_runtime === "string" ? body.agent_runtime : undefined,
    agent_runtime_version:
      typeof body.agent_runtime_version === "string" ? body.agent_runtime_version : undefined,
    request_id: typeof body.request_id === "string" ? body.request_id : undefined,
    ip: getRequestIp(request),
    user_agent: getRequestUserAgent(request.headers),
  });
  const entitlement = entitlementResponseFragment(
    await buildTenantEntitlement({ uid: result.uid, db: adminDb }),
  );
  // `api_key` is the legacy field name the connector reads; the value is the agent access token.
  return jsonResponse(200, {
    ok: true,
    api_key: result.access_token,
    ingest_url: result.ingest_url,
    agent_id: result.agent_id,
    ...entitlement,
  });
});

export const ingestHandler: Handler = guard(async (request) => {
  const body = await readJsonObject(request, MAX_INGEST_BODY_BYTES, true);
  const data = await ingestFromRequest({
    authorizationHeader: request.headers.get("authorization"),
    body,
    requestId: request.headers.get("x-request-id") || request.headers.get("idempotency-key"),
    ip: getRequestIp(request),
    userAgent: getRequestUserAgent(request.headers),
  });
  return jsonResponse(200, data);
});

export const policyHandler: Handler = guard(async (request) => {
  const data = await getAgentRuntimePolicy({
    authorizationHeader: request.headers.get("authorization"),
    db: adminDb,
  });
  return jsonResponse(200, data);
});

/**
 * Identifier grammar the connector accepts for a revocation list's signed
 * `tenant_id` / `agent_id` (`REVOCATION_IDENTIFIER` in aidr core `managed.ts`).
 * A list carrying anything else is rejected outright by the connector.
 */
const REVOCATION_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * Signed revocation list, schema 2 (`parseSignedRevocationsFromControlPlaneBody`
 * in aidr; reference implementation: aidr `supabase/functions/revocations`).
 *
 * The signed payload is bound to the tenant it was issued for (`tenant_id`, the
 * same value as the signed entitlement's `tenant_id`, which is what the connector
 * compares it against) and to the agent that fetched it.
 * The connector no longer accepts unbound schema-1 lists, so none are issued.
 *
 * Fails closed: served only to an authenticated, still-enrolled agent, only when
 * an entitlement signing key is provisioned, and only when the tenant id fits the
 * connector's identifier grammar. An unsigned or unbindable list would be
 * discarded by the connector, so 503 is the honest answer.
 */
export const revocationsHandler: Handler = guard(async (request) => {
  const { uid, agentId } = await authenticateAgent({
    authorizationHeader: request.headers.get("authorization"),
  });
  const signing = getEntitlementSigningConfig();
  if (!signing) throw new ControlPlaneError("revocation_signing_unavailable", 503);
  if (!REVOCATION_IDENTIFIER.test(uid)) {
    logger.error({ reason: "tenant_id_not_bindable" }, "revocation list cannot be bound to tenant");
    throw new ControlPlaneError("revocation_binding_unavailable", 503);
  }
  const entitlement = await buildTenantEntitlement({ uid, db: adminDb });
  const entSnap = await adminDb.collection(`users/${uid}/entitlements`).doc("current").get();
  const serials = entSnap.exists ? (entSnap.data() as Record<string, unknown>).revoked_serials : [];
  const now = new Date();
  const payload = {
    schema_version: 2 as const,
    tenant_id: uid,
    agent_id: REVOCATION_IDENTIFIER.test(agentId) ? agentId : null,
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    revocation_epoch: entitlement.revocation_epoch,
    revocations: {
      artifact_ids: [] as string[],
      pack_ids: [] as string[],
      key_ids: [] as string[],
      entitlement_serials: Array.isArray(serials) ? serials.filter((s): s is string => typeof s === "string") : [],
    },
  };
  return jsonResponse(200, {
    ok: true,
    revocations_signed: {
      alg: "ed25519",
      key_id: signing.keyId,
      sig_b64: signCanonicalEd25519(payload, signing),
      payload,
    },
  });
});

export const CONNECTOR_ACTIONS: Record<string, { method: "GET" | "POST"; handler: Handler }> = {
  "device-start": { method: "POST", handler: deviceStartHandler },
  "device-poll": { method: "POST", handler: devicePollHandler },
  enroll: { method: "POST", handler: enrollHandler },
  ingest: { method: "POST", handler: ingestHandler },
  policy: { method: "GET", handler: policyHandler },
  revocations: { method: "GET", handler: revocationsHandler },
};
