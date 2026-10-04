import { createPrivateKey, randomUUID, sign as cryptoSign } from "node:crypto";
import { ControlPlaneError } from "./agent-auth";

/**
 * Signed entitlement snapshots (schema v2) for the AIDR connector.
 *
 * Wire contract, verified by aidr `verifyEd25519SignedEntitlementSnapshot`:
 *  - signature = Ed25519 over UTF-8 `canonicalJson(snapshot)` where canonicalJson
 *    is JSON.stringify of the value with object keys sorted recursively,
 *  - transported as `entitlement_signed: { alg: "ed25519", key_id, sig_b64, snapshot }`,
 *  - snapshot must satisfy `validateEntitlementSnapshotV2Strict`
 *    (allowed_agents === included_agents + extra_agents, issued<=expires<=grace, ...).
 *
 * Key provisioning uses the same variable names as the aidr Supabase `ingest`
 * function so one signing key serves either control-plane implementation:
 *  AIDR_ENTITLEMENT_SIGNING_KEY_ID, AIDR_ENTITLEMENT_SIGNING_PRIVATE_KEY_PKCS8_B64.
 */

export type EntitlementSnapshotV2 = {
  schema_version: 2;
  tenant_id: string;
  subscription_tier: "free" | "pro" | "enterprise";
  included_agents: number;
  extra_agents: number;
  allowed_agents: number;
  premium_modules: string[];
  issued_at: string;
  expires_at: string;
  grace_until: string;
  serial: string;
  revocation_epoch: number;
};

export type SignedEntitlement = {
  alg: "ed25519";
  key_id: string;
  sig_b64: string;
  snapshot: EntitlementSnapshotV2;
};

type EntitlementDb = {
  collection(path: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
    };
  };
};

export function canonicalizeForSigning(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalizeForSigning(item));
  if (!value || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) out[key] = canonicalizeForSigning(input[key]);
  return out;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeForSigning(value));
}

function parseBoundedHours(raw: string | undefined, fallback: number, min: number, max: number) {
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw.trim())) return null;
  const hours = Number(raw.trim());
  return Number.isSafeInteger(hours) && hours >= min && hours <= max ? hours : null;
}

function nonNegativeInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
}

type SigningConfig = { keyId: string; pkcs8: Buffer } | null;

/** Returns null when signing is not provisioned; throws on a half-configured pair. */
export function getEntitlementSigningConfig(env: NodeJS.ProcessEnv = process.env): SigningConfig {
  const keyId = (env.AIDR_ENTITLEMENT_SIGNING_KEY_ID ?? "").trim();
  const b64 = (env.AIDR_ENTITLEMENT_SIGNING_PRIVATE_KEY_PKCS8_B64 ?? "").trim();
  if (!keyId && !b64) return null;
  // A half-provisioned pair means the operator believes entitlements are signed.
  if (!keyId || !b64) throw new ControlPlaneError("entitlement_signing_unavailable", 503);
  return { keyId, pkcs8: Buffer.from(b64, "base64") };
}

/** Detached Ed25519 signature (base64) over the canonical JSON of `value`. */
export function signCanonicalEd25519(value: unknown, config: NonNullable<SigningConfig>): string {
  try {
    const key = createPrivateKey({ key: config.pkcs8, format: "der", type: "pkcs8" });
    return cryptoSign(null, Buffer.from(canonicalJson(value), "utf8"), key).toString("base64");
  } catch {
    throw new ControlPlaneError("entitlement_signing_unavailable", 503);
  }
}

export function getEntitlementTiming(env: NodeJS.ProcessEnv = process.env) {
  const ttlHours = parseBoundedHours(env.AIDR_ENTITLEMENT_TTL_HOURS, 168, 1, 720);
  const graceHours = parseBoundedHours(env.AIDR_ENTITLEMENT_GRACE_HOURS, 72, 0, 168);
  if (ttlHours === null || graceHours === null) {
    throw new ControlPlaneError("entitlement_timing_unavailable", 503);
  }
  return { ttlHours, graceHours };
}

/**
 * Build the tenant entitlement from Firestore. Tenant = the Firebase uid carried
 * by the agent token. Seat counts come from `seat_usage/current` (kept in sync by
 * billing) with `entitlements/current` as fallback; an absent record is the free
 * single-seat plan, matching `ensureSeatUsage` in the dashboard API.
 */
export async function buildTenantEntitlement(input: {
  uid: string;
  db: EntitlementDb;
  now?: Date;
}): Promise<EntitlementSnapshotV2> {
  const timing = getEntitlementTiming();
  const [usageSnap, entSnap] = await Promise.all([
    input.db.collection(`users/${input.uid}/seat_usage`).doc("current").get(),
    input.db.collection(`users/${input.uid}/entitlements`).doc("current").get(),
  ]);
  const usage = usageSnap.exists ? (usageSnap.data() ?? {}) : {};
  const ent = entSnap.exists ? (entSnap.data() ?? {}) : {};

  const included = nonNegativeInt(usage.included_agents ?? ent.included_agents, 1);
  const extra = nonNegativeInt(usage.extra_agents ?? ent.extra_agents, 0);
  const premiumModules: string[] = [];
  if (ent.premium_intel === true) premiumModules.push("premium_intel");
  if (ent.premium_correlation === true) premiumModules.push("premium_correlation");
  if (ent.premium_pkg_plugin === true) premiumModules.push("premium_pkg_plugin");

  const issued = input.now ?? new Date();
  const expires = new Date(issued.getTime() + timing.ttlHours * 3_600_000);
  const grace = new Date(expires.getTime() + timing.graceHours * 3_600_000);
  return {
    schema_version: 2,
    tenant_id: input.uid,
    subscription_tier: extra > 0 ? "pro" : "free",
    included_agents: included,
    extra_agents: extra,
    allowed_agents: included + extra,
    premium_modules: premiumModules,
    issued_at: issued.toISOString(),
    expires_at: expires.toISOString(),
    grace_until: grace.toISOString(),
    serial: randomUUID(),
    revocation_epoch: Math.max(1, nonNegativeInt(ent.revocation_epoch, 1)),
  };
}

/**
 * Response fragment understood by `applyIngestResult` in the connector.
 * `entitlement_signed` is present only when a signing key is provisioned; an
 * unsigned deployment must not pretend otherwise (a connector configured with
 * `licensing.public_keys_pem` then correctly refuses to unlock signed features).
 */
export function entitlementResponseFragment(snapshot: EntitlementSnapshotV2) {
  const config = getEntitlementSigningConfig();
  const fragment: Record<string, unknown> = {
    allowed_agents: snapshot.allowed_agents,
    entitlement: snapshot,
  };
  if (config) {
    const sig = signCanonicalEd25519(snapshot, config);
    fragment.entitlement_signed = {
      alg: "ed25519",
      key_id: config.keyId,
      sig_b64: sig,
      snapshot,
    } satisfies SignedEntitlement;
  }
  return fragment;
}
