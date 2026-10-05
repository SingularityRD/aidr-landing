import { createHash, randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { ControlPlaneError } from "./agent-auth";
import { mintAgentAccessToken, reissueAgentAccessToken, type AgentTokenClaims } from "./agent-token";
import {
  DEVICE_CODE_SCHEMA_VERSION,
  hashDeviceCode,
  hashEnrollmentSecret,
  mintEnrollmentToken,
  readLegacyAccessClaims,
  safeEqualHex,
} from "./device-secrets";
import {
  enforceRateLimit,
  pruneExpiredControlPlaneArtifacts,
  recordControlPlaneAudit,
} from "./request-guard";

type DeviceCodeStatus = "authorization_pending" | "authorized" | "consumed" | "denied";

function makeUserCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoid confusing chars
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function safeUpperCode(value: string) {
  return value.trim().toUpperCase();
}

const META_MAX_LENGTH = 128;

function boundedMeta(value: unknown): string | null {
  return typeof value === "string" && value.trim() && value.length <= META_MAX_LENGTH ? value.trim() : null;
}

/**
 * device-start is unauthenticated, so persist only the fields the connector is
 * documented to send (aidr `ControlPlaneClient.deviceStart`), each length-bounded,
 * plus server-observed ip/user_agent. Arbitrary client JSON is never stored.
 */
export function sanitizeDeviceStartMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  const input = meta ?? {};
  return {
    iid: boundedMeta(input.iid),
    agent_runtime: boundedMeta(input.agent_runtime),
    agent_runtime_version: boundedMeta(input.agent_runtime_version),
    ip: typeof input.ip === "string" ? input.ip.slice(0, 64) : "unknown",
    user_agent: typeof input.user_agent === "string" ? input.user_agent.slice(0, 256) : "unknown",
  };
}

export type DeviceStartResult = {
  verification_url: string;
  user_code: string;
  device_code: string;
  expires_at: string;
  interval_seconds: number;
};

export async function deviceStart(input: { origin: string; meta?: Record<string, unknown> }): Promise<DeviceStartResult> {
  const meta = sanitizeDeviceStartMeta(input.meta);
  const ip = typeof meta.ip === "string" ? meta.ip.trim() : "unknown";
  const limit = await enforceRateLimit({
    action: "device-start",
    subject: ip || "unknown",
    windowSeconds: 600,
    limit: 6,
  });
  if (!limit.ok) {
    throw new ControlPlaneError("rate_limited", 429, { retry_after_seconds: limit.retryAfterSeconds });
  }

  const deviceCode = randomBytes(24).toString("hex");
  const userCode = makeUserCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  // Hash-only: the device code (a bearer secret) exists in plaintext only in this response.
  await adminDb.collection("device_codes").doc(hashDeviceCode(deviceCode)).set({
    schema: DEVICE_CODE_SCHEMA_VERSION,
    user_code: userCode,
    status: "authorization_pending" satisfies DeviceCodeStatus,
    uid: null,
    agent_id: null,
    enrollment_token_hash: null,
    meta,
    expires_at: expiresAt.toISOString(),
    // Firestore TTL needs a native timestamp; `expires_at` (ISO string) stays the application-level check.
    expire_at: expiresAt,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  await recordControlPlaneAudit({
    action: "device-start",
    outcome: "created",
    ip,
    user_agent: typeof meta.user_agent === "string" ? meta.user_agent : null,
    subject: hashDeviceCode(deviceCode).slice(0, 16),
    metadata: {
      origin: input.origin,
      expires_at: expiresAt.toISOString(),
    },
  });

  void pruneExpiredControlPlaneArtifacts().catch(() => {});

  const verifyBase = `${input.origin.replace(/\/+$/, "")}/verify`;

  return {
    verification_url: `${verifyBase}?code=${encodeURIComponent(userCode)}`,
    user_code: userCode,
    device_code: deviceCode,
    expires_at: expiresAt.toISOString(),
    interval_seconds: 5,
  };
}

type DeviceDocRef = ReturnType<ReturnType<typeof adminDb.collection>["doc"]>;
type LoadedDeviceDoc = { ref: DeviceDocRef; data: Record<string, unknown>; legacyEnrollmentToken: string };

/**
 * Rewrite a pre-hash-only device-code row (document id = plaintext device code,
 * plaintext `enrollment_token` / `access_token`) into the hash-only shape and
 * delete the original. Accept-and-rehash: the row stays usable for the rest of
 * its (15 minute) life, but no credential remains stored after this runs. Any
 * legacy row never touched again is removed by pruning / the TTL policy.
 */
async function migrateLegacyDeviceDoc(legacy: {
  ref: DeviceDocRef;
  data: Record<string, unknown>;
}): Promise<LoadedDeviceDoc> {
  const rest = { ...legacy.data };
  const legacyToken = rest.enrollment_token;
  const legacyAccess = rest.access_token;
  delete rest.enrollment_token;
  delete rest.access_token;
  delete rest.access_token_agent_id;
  const enrollmentToken = typeof legacyToken === "string" ? legacyToken.trim() : "";
  const claims = typeof legacyAccess === "string" ? readLegacyAccessClaims(legacyAccess) : null;
  const expires = Date.parse(getString(rest.expires_at));
  const migrated: Record<string, unknown> = {
    ...rest,
    schema: DEVICE_CODE_SCHEMA_VERSION,
    enrollment_token_hash: enrollmentToken ? hashEnrollmentSecret(enrollmentToken) : null,
    ...(claims && typeof rest.uid === "string" && typeof rest.agent_id === "string"
      ? { access_token_claims: { uid: rest.uid, agent_id: rest.agent_id, ...claims } }
      : {}),
    ...(Number.isFinite(expires) ? { expire_at: new Date(expires) } : {}),
  };
  const newId = hashDeviceCode(legacy.ref.id);
  const ref = adminDb.collection("device_codes").doc(newId);
  await ref.set(migrated);
  await legacy.ref.delete();
  await recordControlPlaneAudit({
    action: "device-code-migrate",
    outcome: "rehashed",
    subject: newId.slice(0, 16),
    metadata: { had_enrollment_token: Boolean(enrollmentToken), had_access_token: Boolean(claims) },
  });
  return { ref, data: migrated, legacyEnrollmentToken: enrollmentToken };
}

async function loadDeviceDocByCode(code: string): Promise<LoadedDeviceDoc | null> {
  const ref = adminDb.collection("device_codes").doc(hashDeviceCode(code));
  const snap = await ref.get();
  if (snap.exists) return { ref, data: snap.data() as Record<string, unknown>, legacyEnrollmentToken: "" };
  // Legacy rows were keyed by the plaintext code. Ids cannot contain "/" and are length-bounded.
  if (code.length > 128 || code.includes("/")) return null;
  const legacyRef = adminDb.collection("device_codes").doc(code);
  const legacy = await legacyRef.get();
  if (!legacy.exists) return null;
  return migrateLegacyDeviceDoc({ ref: legacyRef, data: legacy.data() as Record<string, unknown> });
}

export type DevicePollResult =
  | { ok: true; status: "authorization_pending"; interval_seconds: number }
  | { ok: true; status: "authorized"; enrollment_token: string; agent_id: string };

/**
 * Poll a device-code session. Contract (aidr `ControlPlaneClient.devicePoll`):
 *  - pending:  200 { ok, status: "authorization_pending", interval_seconds }
 *  - approved: 200 { ok, status: "authorized", enrollment_token, agent_id }
 *  - unknown:  401 device_code_invalid
 *  - expired:  401 device_code_expired
 *  - denied:   403 access_denied
 * An approved code keeps returning its enrollment token until it expires, so a
 * connector that lost the enroll response can recover; `enroll` is idempotent
 * for the same token and returns the same credential.
 */
export async function devicePollByDeviceCode(
  deviceCode: string,
  input?: { ip?: string; user_agent?: string },
): Promise<DevicePollResult> {
  const code = deviceCode.trim();
  if (!code) throw new ControlPlaneError("missing_device_code", 401);

  const rate = await enforceRateLimit({
    action: "device-poll",
    subject: `${hashDeviceCode(code).slice(0, 24)}:${input?.ip ?? "unknown"}`,
    windowSeconds: 60,
    limit: 60,
  });
  if (!rate.ok) {
    throw new ControlPlaneError("rate_limited", 429, { retry_after_seconds: rate.retryAfterSeconds });
  }

  const loaded = await loadDeviceDocByCode(code);
  if (!loaded) throw new ControlPlaneError("device_code_invalid", 401);
  const { ref, data } = loaded;
  const expiresAt = new Date(getString(data.expires_at));
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    throw new ControlPlaneError("device_code_expired", 401, { status: "expired" });
  }

  const status = getString(data.status, "authorization_pending");
  if (status === "denied") throw new ControlPlaneError("access_denied", 403, { status: "denied" });
  if (status === "authorized" || status === "consumed") {
    const agentId = typeof data.agent_id === "string" ? data.agent_id : "";
    await recordControlPlaneAudit({
      action: "device-poll",
      outcome: status,
      subject: hashDeviceCode(code).slice(0, 16),
      metadata: { agent_id: agentId || null },
    });
    // No agent bound to the approval: fail closed rather than reporting an approval that cannot be redeemed.
    if (!agentId) throw new ControlPlaneError("invalid_device_state", 409);

    // Only a digest of the enrollment token is stored, so it is revealed at issuance: each poll of an
    // approved session issues a fresh token and replaces the stored digest (the previous token stops
    // working). A connector that lost the response simply polls again. A row just migrated from the
    // legacy plaintext shape hands back its original token once so an in-flight enroll still works.
    let enrollmentToken = loaded.legacyEnrollmentToken;
    if (!enrollmentToken) {
      enrollmentToken = mintEnrollmentToken();
      const issuedHash = hashEnrollmentSecret(enrollmentToken);
      await adminDb.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        const currentStatus = getString((current.data() ?? {}).status);
        if (!current.exists || (currentStatus !== "authorized" && currentStatus !== "consumed")) {
          throw new ControlPlaneError("invalid_device_state", 409);
        }
        tx.set(
          ref,
          {
            enrollment_token_hash: issuedHash,
            enrollment_token_issued_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
    }
    return { ok: true, status: "authorized", enrollment_token: enrollmentToken, agent_id: agentId };
  }

  return { ok: true, status: "authorization_pending", interval_seconds: 5 };
}

export async function deviceVerifyUserCode(input: {
  uid: string;
  user_code: string;
  ensureSeatUsage: () => Promise<{ allowed_agents: number; current_agents: number }>;
  ip?: string;
  user_agent?: string;
}): Promise<{ ok: true; agent_id: string }> {
  const userCode = safeUpperCode(input.user_code);
  if (!userCode) throw new Error("missing_user_code");

  const rate = await enforceRateLimit({
    action: "device-verify",
    subject: `${input.uid}:${userCode}`,
    windowSeconds: 60,
    limit: 10,
  });
  if (!rate.ok) {
    throw new Error(`rate_limited:${rate.retryAfterSeconds}`);
  }

  const snap = await adminDb
    .collection("device_codes")
    .where("user_code", "==", userCode)
    .limit(1)
    .get();

  if (snap.empty) throw new Error("invalid_user_code");
  const doc = snap.docs[0];
  const docData = doc.data() as Record<string, unknown>;
  const docMeta = (docData.meta as Record<string, unknown> | undefined) ?? {};
  const installationId = typeof docMeta.iid === "string" ? docMeta.iid : null;
  const seat = await input.ensureSeatUsage();
  const agentId = `aidr_ag_${randomBytes(12).toString("hex")}`;
  const agentRef = adminDb.collection(`users/${input.uid}/agents`).doc(agentId);
  const usageRef = adminDb.collection(`users/${input.uid}/seat_usage`).doc("current");

  await adminDb.runTransaction(async (tx) => {
    const deviceSnap = await tx.get(doc.ref);
    if (!deviceSnap.exists) throw new Error("invalid_user_code");
    const data = deviceSnap.data() as Record<string, unknown>;

    const expiresAt = new Date(getString(data.expires_at));
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      throw new Error("device_code_expired");
    }

    const status = getString(data.status, "authorization_pending");
    if (status !== "authorization_pending") {
      throw new Error("invalid_device_state");
    }

    const seatSnap = await tx.get(usageRef);
    const usage = seatSnap.exists ? (seatSnap.data() as Record<string, unknown>) : {};
    const allowed = Number(usage.allowed_agents ?? seat.allowed_agents ?? 1);
    const current = Number(usage.current_agents ?? seat.current_agents ?? 0);
    if (current >= allowed) {
      throw new Error("agent_seat_limit");
    }

    tx.set(agentRef, {
      id: agentId,
      name: "New agent",
      runtime: "unknown",
      status: "pending",
      last_seen_at: null,
      installation_id: installationId,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    tx.set(
      doc.ref,
      {
        uid: input.uid,
        agent_id: agentId,
        status: "authorized" satisfies DeviceCodeStatus,
        installation_id: installationId,
        verified_at: FieldValue.serverTimestamp(),
        verified_ip: input.ip ?? null,
        verified_user_agent: input.user_agent ?? null,
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    tx.set(
      usageRef,
      {
        current_agents: current + 1,
        allowed_agents: allowed,
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  await recordControlPlaneAudit({
    action: "device-verify",
    outcome: "authorized",
    uid: input.uid,
    agent_id: agentId,
    subject: userCode,
    ip: input.ip ?? null,
    user_agent: input.user_agent ?? null,
  });

  return { ok: true, agent_id: agentId };
}

/** Explicitly refuse a pending device code (the user clicked "this is not me"). */
export async function deviceDenyUserCode(input: { uid: string; user_code: string }): Promise<{ ok: true }> {
  const userCode = safeUpperCode(input.user_code);
  if (!userCode) throw new Error("missing_user_code");
  const snap = await adminDb.collection("device_codes").where("user_code", "==", userCode).limit(1).get();
  if (snap.empty) throw new Error("invalid_user_code");
  const doc = snap.docs[0];
  await adminDb.runTransaction(async (tx) => {
    const current = await tx.get(doc.ref);
    const data = (current.data() ?? {}) as Record<string, unknown>;
    if (getString(data.status, "authorization_pending") !== "authorization_pending") {
      throw new Error("invalid_device_state");
    }
    tx.set(
      doc.ref,
      { status: "denied" satisfies DeviceCodeStatus, denied_by: input.uid, updated_at: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });
  await recordControlPlaneAudit({ action: "device-deny", outcome: "denied", uid: input.uid, subject: userCode });
  return { ok: true };
}

export type EnrollResult = {
  ok: true;
  uid: string;
  agent_id: string;
  access_token: string;
  ingest_url: string;
};

/** Dashboard-minted enrollment tokens are stored as a plain SHA-256 digest (see the api route's hashSecret). */
const hashDashboardToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function enrollWithEnrollmentToken(input: {
  enrollment_token: string;
  origin: string;
  iid?: string;
  agent_runtime?: string;
  agent_runtime_version?: string;
  request_id?: string;
  ip?: string;
  user_agent?: string;
}): Promise<EnrollResult> {
  const token = input.enrollment_token.trim();
  if (!token) throw new ControlPlaneError("missing_enrollment_token", 401);
  const iid = boundedMeta(input.iid) ?? undefined;
  const runtime = boundedMeta(input.agent_runtime) ?? undefined;
  const runtimeVersion = boundedMeta(input.agent_runtime_version) ?? undefined;

  const rate = await enforceRateLimit({
    action: "enroll",
    subject: `${hashEnrollmentSecret(token).slice(0, 24)}:${input.ip ?? "unknown"}`,
    windowSeconds: 60,
    limit: 12,
  });
  if (!rate.ok) {
    throw new ControlPlaneError("rate_limited", 429, { retry_after_seconds: rate.retryAfterSeconds });
  }

  const tokenHash = hashEnrollmentSecret(token);
  let deviceRef: DeviceDocRef | null = null;
  const byHash = await adminDb
    .collection("device_codes")
    .where("enrollment_token_hash", "==", tokenHash)
    .limit(1)
    .get();
  if (!byHash.empty) {
    deviceRef = byHash.docs[0].ref;
  } else {
    // Rows written before hash-only storage still carry the plaintext token: rehash, drop it, continue.
    const legacy = await adminDb.collection("device_codes").where("enrollment_token", "==", token).limit(1).get();
    if (!legacy.empty) {
      deviceRef = (
        await migrateLegacyDeviceDoc({
          ref: legacy.docs[0].ref,
          data: legacy.docs[0].data() as Record<string, unknown>,
        })
      ).ref;
    }
  }

  // Not a device-flow token: it may be an enrollment token minted in the dashboard.
  if (!deviceRef) {
    return enrollWithDashboardToken({
      token,
      origin: input.origin,
      iid,
      runtime,
      runtimeVersion,
      ip: input.ip,
      user_agent: input.user_agent,
    });
  }

  const doc = { ref: deviceRef };
  let resolvedUid = "";
  let resolvedAgentId = "";
  let resolvedAccessToken = "";
  const ingestUrl = `${input.origin.replace(/\/+$/, "")}/v1/ingest`;

  await adminDb.runTransaction(async (tx) => {
    const current = await tx.get(doc.ref);
    if (!current.exists) throw new ControlPlaneError("invalid_enrollment_token", 401);
    const data = current.data() as Record<string, unknown>;
    // The query matched on the digest; re-check inside the transaction (constant time) so a token rotated
    // by a concurrent poll can no longer redeem.
    if (!safeEqualHex(data.enrollment_token_hash, tokenHash)) {
      throw new ControlPlaneError("invalid_enrollment_token", 401);
    }

    const expiresAt = new Date(getString(data.expires_at));
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      throw new ControlPlaneError("device_code_expired", 401);
    }

    const uid = getString(data.uid).trim();
    const agentId = getString(data.agent_id).trim();
    const status = getString(data.status);
    const claims = data.access_token_claims as AgentTokenClaims | undefined;
    if (!uid || !agentId) throw new ControlPlaneError("invalid_device_state", 409);

    // The credential is bound to the installation that started the device flow.
    // A stolen enrollment token cannot be redeemed from a different machine.
    const boundIid =
      getString(data.installation_id).trim() ||
      getString((data.meta as Record<string, unknown> | undefined)?.iid).trim();
    if (boundIid && boundIid !== iid) throw new ControlPlaneError("agent_key_mismatch", 403);

    const agentRef = adminDb.collection(`users/${uid}/agents`).doc(agentId);
    const agentSnap = await tx.get(agentRef);
    // A device approved and then removed from the dashboard must not enroll,
    // and a retry must not hand out the cached credential of a revoked agent.
    const agentStatus = agentSnap.exists ? getString((agentSnap.data() as Record<string, unknown>).status) : "";
    if (!agentSnap.exists || agentStatus === "deleted" || agentStatus === "paused") {
      throw new ControlPlaneError("agent_not_authorized", 403);
    }

    if (status === "consumed") {
      // Idempotent retry (lost enroll response): only the non-secret claims are stored; the identical
      // credential is re-signed. A row without claims cannot be re-issued.
      if (!claims || claims.uid !== uid || claims.agent_id !== agentId) {
        throw new ControlPlaneError("invalid_device_state", 409);
      }
      resolvedUid = uid;
      resolvedAgentId = agentId;
      resolvedAccessToken = reissueAgentAccessToken(claims);
      return;
    }
    if (status !== "authorized") throw new ControlPlaneError("invalid_device_state", 409);

    const accessToken = mintAgentAccessToken({ uid, agent_id: agentId });
    tx.set(
      agentRef,
      {
        runtime: runtime ?? "unknown",
        runtime_version: runtimeVersion ?? null,
        iid: iid ?? null,
        installation_id: iid ?? null,
        status: "connected",
        last_seen_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    tx.set(
      doc.ref,
      {
        status: "consumed" satisfies DeviceCodeStatus,
        consumed_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
        consumed_ip: input.ip ?? null,
        consumed_user_agent: input.user_agent ?? null,
        access_token_claims: accessToken.claims,
        access_token_issued_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    resolvedUid = uid;
    resolvedAgentId = agentId;
    resolvedAccessToken = accessToken.token;
  });

  await recordControlPlaneAudit({
    action: "enroll",
    outcome: "consumed",
    uid: resolvedUid,
    agent_id: resolvedAgentId,
    subject: tokenHash.slice(0, 16),
    ip: input.ip ?? null,
    user_agent: input.user_agent ?? null,
    metadata: { iid: iid ?? null, agent_runtime: runtime ?? null, flow: "device" },
  });

  return {
    ok: true,
    uid: resolvedUid,
    agent_id: resolvedAgentId,
    access_token: resolvedAccessToken,
    ingest_url: ingestUrl,
  };
}

/**
 * Redeem a one-time enrollment token created in the dashboard
 * (`users/{uid}/enrollment_tokens`, stored hash-only). Previously the enroll
 * endpoint only understood device-flow tokens, so these could never be used.
 * The tenant is derived from the token document's parent path, never from input.
 */
async function enrollWithDashboardToken(input: {
  token: string;
  origin: string;
  iid?: string;
  runtime?: string;
  runtimeVersion?: string;
  ip?: string;
  user_agent?: string;
}): Promise<EnrollResult> {
  const tokenHash = hashDashboardToken(input.token);
  const found = await adminDb
    .collectionGroup("enrollment_tokens")
    .where("token_hash", "==", tokenHash)
    .limit(1)
    .get();
  if (found.empty) throw new ControlPlaneError("invalid_enrollment_token", 401);
  // Redemption must identify the installation so the credential can be bound to it.
  if (!input.iid) throw new ControlPlaneError("missing_iid", 400);

  const tokenRef = found.docs[0].ref;
  const uid = tokenRef.parent.parent?.id ?? "";
  if (!uid) throw new ControlPlaneError("invalid_enrollment_token", 401);
  const agentId = `aidr_ag_${randomBytes(12).toString("hex")}`;
  const agentRef = adminDb.collection(`users/${uid}/agents`).doc(agentId);
  const usageRef = adminDb.collection(`users/${uid}/seat_usage`).doc("current");
  let accessToken = "";

  await adminDb.runTransaction(async (tx) => {
    const tokenSnap = await tx.get(tokenRef);
    if (!tokenSnap.exists) throw new ControlPlaneError("invalid_enrollment_token", 401);
    const data = tokenSnap.data() as Record<string, unknown>;
    const expires = Date.parse(getString(data.expires_at));
    if (!Number.isFinite(expires) || expires < Date.now()) {
      throw new ControlPlaneError("invalid_enrollment_token", 401);
    }
    if (data.consumed_at) throw new ControlPlaneError("invalid_enrollment_token", 401);

    const usageSnap = await tx.get(usageRef);
    const usage = usageSnap.exists ? (usageSnap.data() as Record<string, unknown>) : {};
    const allowed = Number(usage.allowed_agents ?? usage.included_agents ?? 1);
    const current = Number(usage.current_agents ?? 0);
    if (current >= allowed) {
      throw new ControlPlaneError("agent_limit_exceeded", 402, {
        allowed_agents: allowed,
        current_agents: current,
      });
    }

    accessToken = mintAgentAccessToken({ uid, agent_id: agentId }).token;
    tx.set(agentRef, {
      id: agentId,
      name: "New agent",
      runtime: input.runtime ?? "unknown",
      runtime_version: input.runtimeVersion ?? null,
      iid: input.iid,
      installation_id: input.iid,
      status: "connected",
      last_seen_at: FieldValue.serverTimestamp(),
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    tx.set(tokenRef, { consumed_at: new Date().toISOString(), consumed_agent_id: agentId }, { merge: true });
    tx.set(
      usageRef,
      { current_agents: current + 1, allowed_agents: allowed, updated_at: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });

  await recordControlPlaneAudit({
    action: "enroll",
    outcome: "consumed",
    uid,
    agent_id: agentId,
    subject: tokenHash.slice(0, 16),
    ip: input.ip ?? null,
    user_agent: input.user_agent ?? null,
    metadata: { iid: input.iid, agent_runtime: input.runtime ?? null, flow: "enrollment_token" },
  });

  return {
    ok: true,
    uid,
    agent_id: agentId,
    access_token: accessToken,
    ingest_url: `${input.origin.replace(/\/+$/, "")}/v1/ingest`,
  };
}
