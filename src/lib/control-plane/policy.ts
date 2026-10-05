import { createHash, createHmac, createPrivateKey, sign as cryptoSign } from "node:crypto";
import { buildRuntimePolicyAsCode, normalizeRuntimePolicySettings } from "../policy-settings";
import { authenticateAgent, ControlPlaneError } from "./agent-auth";
import { canonicalJson, getEntitlementSigningConfig } from "./entitlement";

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

/**
 * Ed25519-signed policy envelope, verified by aidr `verifySignedPolicy`
 * (packages/core/src/policy-signature.ts).
 *
 *  - signature = Ed25519 over UTF-8 `canonicalJson(envelope)` (same canonicalisation as signed
 *    entitlements: recursive key-sorted JSON),
 *  - `key_id` is repeated inside the signed envelope so it cannot be relabelled,
 *  - `policy_sha256` is the digest of the canonical runtime policy (see `runtimePolicySha256`),
 *  - `sequence` is monotonic per tenant (publish time in ms), so a connector refuses a replayed
 *    older policy,
 *  - `expires_at` bounds how long a captured response stays acceptable.
 *
 * Key provisioning mirrors the entitlement key: AIDR_POLICY_SIGNING_KEY_ID,
 * AIDR_POLICY_SIGNING_PRIVATE_KEY_PKCS8_B64, AIDR_POLICY_SIGNATURE_TTL_HOURS (default 24,
 * 1..720). A SEPARATE policy key is recommended so a leaked policy key cannot mint entitlements.
 * When no policy key is provisioned the entitlement signing key is reused, matching the connector
 * falling back from `control_plane.policy_public_keys_pem` to `licensing.public_keys_pem`.
 * With neither key the policy is served unsigned.
 */
export type PolicyEnvelope = {
  schema_version: 1;
  key_id: string;
  policy_version: string;
  policy_sha256: string;
  sequence: number;
  issued_at: string;
  expires_at: string;
  tenant_id: string;
};

export type SignedPolicy = {
  alg: "ed25519";
  key_id: string;
  sig_b64: string;
  envelope: PolicyEnvelope;
};

type PolicySigningConfig = { keyId: string; pkcs8: Buffer; ttlHours: number } | null;

/** Null when policy signing is not provisioned; throws (503) on a half-configured or invalid setup. */
export function getPolicySigningConfig(env: NodeJS.ProcessEnv = process.env): PolicySigningConfig {
  const keyId = (env.AIDR_POLICY_SIGNING_KEY_ID ?? "").trim();
  const b64 = (env.AIDR_POLICY_SIGNING_PRIVATE_KEY_PKCS8_B64 ?? "").trim();
  if (!keyId && !b64) {
    // Throws entitlement_signing_unavailable (503) for a half-provisioned entitlement pair.
    const fallback = getEntitlementSigningConfig(env);
    return fallback ? { ...fallback, ttlHours: parsePolicyTtlHours(env) } : null;
  }
  if (!keyId || !b64) throw new ControlPlaneError("policy_signing_unavailable", 503);
  return { keyId, pkcs8: Buffer.from(b64, "base64"), ttlHours: parsePolicyTtlHours(env) };
}

function parsePolicyTtlHours(env: NodeJS.ProcessEnv): number {
  const rawTtl = (env.AIDR_POLICY_SIGNATURE_TTL_HOURS ?? "").trim();
  const ttlHours = rawTtl === "" ? 24 : /^\d+$/.test(rawTtl) ? Number(rawTtl) : Number.NaN;
  if (!Number.isSafeInteger(ttlHours) || ttlHours < 1 || ttlHours > 720) {
    throw new ControlPlaneError("policy_signing_unavailable", 503);
  }
  return ttlHours;
}

export function signRuntimePolicyEnvelope(
  input: {
    tenantId: string;
    policyVersion: string;
    policySha256: string;
    sequence: number;
    now: Date;
  },
  config: NonNullable<PolicySigningConfig>,
): SignedPolicy {
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) {
    throw new ControlPlaneError("policy_signing_unavailable", 503);
  }
  const envelope: PolicyEnvelope = {
    schema_version: 1,
    key_id: config.keyId,
    policy_version: input.policyVersion,
    policy_sha256: input.policySha256,
    sequence: input.sequence,
    issued_at: input.now.toISOString(),
    expires_at: new Date(input.now.getTime() + config.ttlHours * 3_600_000).toISOString(),
    tenant_id: input.tenantId,
  };
  try {
    const key = createPrivateKey({ key: config.pkcs8, format: "der", type: "pkcs8" });
    const sig = cryptoSign(null, Buffer.from(canonicalJson(envelope), "utf8"), key).toString("base64");
    return { alg: "ed25519", key_id: config.keyId, sig_b64: sig, envelope };
  } catch {
    throw new ControlPlaneError("policy_signing_unavailable", 503);
  }
}

/**
 * Monotonic sequence for a tenant policy: explicit `runtime_policy_sequence`, else the publish time
 * in epoch milliseconds. Every publish is later than the previous one, including a re-publish of
 * older content, so rolling back policy content still advances the sequence.
 */
export function runtimePolicySequence(data: Record<string, unknown>): number | null {
  const explicit = data.runtime_policy_sequence;
  if (typeof explicit === "number" && Number.isSafeInteger(explicit) && explicit >= 1) return explicit;
  const published = Date.parse(getString(data.runtime_policy_published_at) || getString(data.updated_at));
  return Number.isFinite(published) && published >= 1 ? published : null;
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
  const policySha256 = runtimePolicySha256(policy);
  // Misconfiguration throws before anything is served; an unprovisioned key serves an unsigned
  // policy, which connectors holding policy public keys refuse (fail closed on their side).
  const signingConfig = getPolicySigningConfig();
  let policySigned: SignedPolicy | null = null;
  if (signingConfig) {
    const sequence = runtimePolicySequence(data);
    if (sequence === null) throw new ControlPlaneError("policy_signing_unavailable", 503);
    policySigned = signRuntimePolicyEnvelope(
      { tenantId: uid, policyVersion, policySha256, sequence, now: input.now ?? new Date() },
      signingConfig,
    );
  }

  return {
    ok: true,
    agent_id: agentId,
    policy_version: policyVersion,
    policy_sha256: policySha256,
    policy_hash: policyHash,
    ...(policySigned ? { policy_signed: policySigned } : {}),
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
