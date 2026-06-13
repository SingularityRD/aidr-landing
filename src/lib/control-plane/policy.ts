import { createHash, createHmac } from "node:crypto";
import { buildRuntimePolicyAsCode, normalizeRuntimePolicySettings } from "../policy-settings";
import { verifyAgentAccessToken } from "./agent-token";

type FirestoreSnapshot = {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
};

type FirestoreDocRef = {
  get(): Promise<FirestoreSnapshot>;
};

export type RuntimePolicyDb = {
  collection(path: string): {
    doc(id: string): FirestoreDocRef;
  };
};

function getBearerToken(headerValue: string | null) {
  if (!headerValue) return null;
  const value = headerValue.trim();
  if (!value.toLowerCase().startsWith("bearer ")) return null;
  return value.slice("bearer ".length).trim() || null;
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

export function runtimePolicyHash(value: unknown) {
  return `sha256=${createHash("sha256").update(stableStringify(value), "utf8").digest("hex")}`;
}

export function signRuntimePolicyVersion(input: {
  policyVersion: string;
  policyHash: string;
  secret?: string | null;
}) {
  const secret = input.secret?.trim();
  if (!secret) return null;
  return `hmac-sha256=${createHmac("sha256", secret)
    .update(`${input.policyVersion}.${input.policyHash}`, "utf8")
    .digest("hex")}`;
}

export async function getAgentRuntimePolicy(input: {
  authorizationHeader: string | null;
  db: RuntimePolicyDb;
  now?: Date;
}) {
  const token = getBearerToken(input.authorizationHeader);
  if (!token) throw new Error("missing_agent_token");

  const claims = verifyAgentAccessToken(token, input.now);
  const snap = await input.db.collection(`users/${claims.uid}/settings`).doc("current").get();
  const data = snap.exists ? (snap.data() ?? {}) : {};
  const policy = normalizeRuntimePolicySettings(data.runtime_policy);
  const policyAsCode = buildRuntimePolicyAsCode(policy);
  const policyVersion = getString(data.updated_at, "default");
  const policyHash = runtimePolicyHash(policyAsCode);

  return {
    ok: true,
    agent_id: claims.agent_id,
    policy_version: policyVersion,
    policy_hash: policyHash,
    policy_signature: signRuntimePolicyVersion({
      policyVersion,
      policyHash,
      secret: process.env.AIDR_POLICY_SIGNING_SECRET,
    }),
    cache_seconds: 60,
    runtime_policy: policy,
    policy_as_code: policyAsCode,
  };
}
