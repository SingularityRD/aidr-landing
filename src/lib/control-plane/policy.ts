import { createHash, createHmac } from "node:crypto";
import { buildRuntimePolicyAsCode, normalizeRuntimePolicySettings } from "../policy-settings";
import { authenticateAgent, ControlPlaneError } from "./agent-auth";

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

/**
 * Canonical JSON used for `policy_sha256`. This MUST match `canonicalPolicy` in
 * aidr `packages/core/src/remote-policy.ts` (and `supabase/functions/_shared/runtime-policy.ts`):
 * keys sorted by UTF-16 code unit order (NOT localeCompare), no whitespace.
 */
export function canonicalRuntimePolicy(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalRuntimePolicy).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalRuntimePolicy(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Hex SHA-256 digest of the canonical runtime policy; the connector recomputes and compares it. */
export function runtimePolicySha256(runtimePolicy: unknown): string {
  return createHash("sha256").update(canonicalRuntimePolicy(runtimePolicy), "utf8").digest("hex");
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
  // Tenant = token claim. A revoked/deleted/paused agent is refused before any
  // tenant data is read.
  const { uid, agentId } = await authenticateAgent({
    authorizationHeader: input.authorizationHeader,
    db: input.db,
    now: input.now,
  });
  const snap = await input.db.collection(`users/${uid}/settings`).doc("current").get();
  const data = snap.exists ? (snap.data() ?? {}) : {};
  // An unpublished tenant has NO central policy. Serving the dashboard defaults
  // (ask for every command/file/url) would block every enrolled agent pending
  // approval, so report "not published" and let the connector keep local policy.
  if (!data.runtime_policy || typeof data.runtime_policy !== "object") {
    throw new ControlPlaneError("policy_not_published", 404);
  }
  const policy = normalizeRuntimePolicySettings(data.runtime_policy);
  const policyAsCode = buildRuntimePolicyAsCode(policy);
  // Same precedence as the dashboard drift view (`currentPolicyVersionFromSettings`).
  const policyVersion = getString(data.runtime_policy_version) || getString(data.updated_at) || "default";
  const policyHash = runtimePolicyHash(policyAsCode);

  return {
    ok: true,
    agent_id: agentId,
    policy_version: policyVersion,
    policy_sha256: runtimePolicySha256(policy),
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
