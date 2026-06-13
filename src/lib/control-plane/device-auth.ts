import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { mintAgentAccessToken } from "./agent-token";
import {
  enforceRateLimit,
  pruneExpiredControlPlaneArtifacts,
  recordControlPlaneAudit,
} from "./request-guard";

type DeviceCodeStatus = "authorization_pending" | "authorized" | "consumed";

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

export type DeviceStartResult = {
  verification_url: string;
  user_code: string;
  device_code: string;
  expires_at: string;
  interval_seconds: number;
};

export async function deviceStart(input: { origin: string; meta?: Record<string, unknown> }): Promise<DeviceStartResult> {
  const ip = typeof input.meta?.ip === "string" ? input.meta.ip.trim() : "unknown";
  const limit = await enforceRateLimit({
    action: "device-start",
    subject: ip || "unknown",
    windowSeconds: 600,
    limit: 6,
  });
  if (!limit.ok) {
    throw new Error(`rate_limited:${limit.retryAfterSeconds}`);
  }

  const deviceCode = randomBytes(24).toString("hex");
  const userCode = makeUserCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await adminDb.collection("device_codes").doc(deviceCode).set({
    user_code: userCode,
    status: "authorization_pending" satisfies DeviceCodeStatus,
    uid: null,
    agent_id: null,
    enrollment_token: null,
    meta: input.meta ?? {},
    expires_at: expiresAt.toISOString(),
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  await recordControlPlaneAudit({
    action: "device-start",
    outcome: "created",
    ip,
    user_agent: typeof input.meta?.user_agent === "string" ? input.meta.user_agent : null,
    subject: deviceCode,
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

export async function devicePollByDeviceCode(
  deviceCode: string,
  input?: { ip?: string; user_agent?: string },
): Promise<
  | { status: "authorization_pending" }
  | { status: "expired" }
  | { status: "consumed"; agent_id: string | null }
  | { status: "authorized"; enrollment_token: string | null; agent_id: string | null }
> {
  const code = deviceCode.trim();
  if (!code) throw new Error("missing_device_code");

  const rate = await enforceRateLimit({
    action: "device-poll",
    subject: `${code.slice(0, 24)}:${input?.ip ?? "unknown"}`,
    windowSeconds: 60,
    limit: 60,
  });
  if (!rate.ok) {
    throw new Error(`rate_limited:${rate.retryAfterSeconds}`);
  }

  const ref = adminDb.collection("device_codes").doc(code);
  const snap = await ref.get();
  if (!snap.exists) return { status: "authorization_pending" };

  const data = snap.data() as Record<string, unknown>;
  const expiresAt = new Date(getString(data.expires_at));
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    return { status: "expired" };
  }

  const status = getString(data.status, "authorization_pending");
  if (status === "authorized" || status === "consumed") {
    const agentId = typeof data.agent_id === "string" ? (data.agent_id as string) : null;
    const hasEnrollmentToken = typeof data.enrollment_token === "string" && data.enrollment_token.trim().length > 0;
    await recordControlPlaneAudit({
      action: "device-poll",
      outcome: status,
      subject: code,
      metadata: { agent_id: agentId, has_enrollment_token: hasEnrollmentToken },
    });
    if (status === "consumed") {
      return { status: "consumed", agent_id: agentId };
    }
    const enrollmentToken = hasEnrollmentToken ? (data.enrollment_token as string) : null;
    return {
      status: "authorized",
      enrollment_token: enrollmentToken,
      agent_id: agentId,
    };
  }

  return { status: "authorization_pending" };
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
  const enrollmentToken = `aidr_enroll_${randomBytes(20).toString("hex")}`;
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
        enrollment_token: enrollmentToken,
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

export async function enrollWithEnrollmentToken(input: {
  enrollment_token: string;
  origin: string;
  iid?: string;
  agent_runtime?: string;
  agent_runtime_version?: string;
  request_id?: string;
  ip?: string;
  user_agent?: string;
}): Promise<{
  ok: true;
  agent_id: string;
  access_token: string;
  ingest_url: string;
}> {
  const token = input.enrollment_token.trim();
  if (!token) throw new Error("missing_enrollment_token");

  const rate = await enforceRateLimit({
    action: "enroll",
    subject: `${token.slice(0, 18)}:${input.ip ?? "unknown"}`,
    windowSeconds: 60,
    limit: 12,
  });
  if (!rate.ok) {
    throw new Error(`rate_limited:${rate.retryAfterSeconds}`);
  }

  const snap = await adminDb
    .collection("device_codes")
    .where("enrollment_token", "==", token)
    .limit(1)
    .get();

  if (snap.empty) throw new Error("invalid_enrollment_token");
  const doc = snap.docs[0];
  let resolvedUid = "";
  let resolvedAgentId = "";
  let resolvedAccessToken = "";
  let resolvedIngestUrl = "";

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(doc.ref);
    if (!snap.exists) throw new Error("invalid_enrollment_token");
    const data = snap.data() as Record<string, unknown>;

    const expiresAt = new Date(getString(data.expires_at));
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      throw new Error("device_code_expired");
    }

    const uid = getString(data.uid).trim();
    const agentId = getString(data.agent_id).trim();
    const status = getString(data.status);
    const cachedAccessToken = getString(data.access_token).trim();
    if (!uid || !agentId) throw new Error("invalid_device_state");
    if (status === "consumed" && cachedAccessToken) {
      resolvedUid = uid;
      resolvedAgentId = agentId;
      resolvedAccessToken = cachedAccessToken;
      resolvedIngestUrl = `${input.origin.replace(/\/+$/, "")}/v1/ingest`;
      return;
    }
    if (status !== "authorized") throw new Error("invalid_device_state");

    resolvedUid = uid;
    resolvedAgentId = agentId;

    const agentRef = adminDb.collection(`users/${uid}/agents`).doc(agentId);
    const accessToken = mintAgentAccessToken({ uid, agent_id: agentId });
    tx.set(
      agentRef,
      {
        runtime: input.agent_runtime ?? "unknown",
        runtime_version: input.agent_runtime_version ?? null,
        iid: input.iid ?? null,
        installation_id: input.iid ?? null,
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
        access_token: accessToken.token,
        access_token_issued_at: FieldValue.serverTimestamp(),
        access_token_agent_id: agentId,
      },
      { merge: true },
    );

    resolvedAccessToken = accessToken.token;
    resolvedIngestUrl = `${input.origin.replace(/\/+$/, "")}/v1/ingest`;
  });

  await recordControlPlaneAudit({
    action: "enroll",
    outcome: "consumed",
    uid: resolvedUid,
    agent_id: resolvedAgentId,
    subject: token,
    ip: input.ip ?? null,
    user_agent: input.user_agent ?? null,
    metadata: { iid: input.iid ?? null, agent_runtime: input.agent_runtime ?? null },
  });

  return { ok: true, agent_id: resolvedAgentId, access_token: resolvedAccessToken, ingest_url: resolvedIngestUrl };
}
