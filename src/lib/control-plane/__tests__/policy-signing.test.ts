import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../entitlement";
import {
  getPolicySigningConfig,
  runtimePolicySequence,
  runtimePolicySha256,
  signRuntimePolicyEnvelope,
} from "../policy";

// Throwaway key generated per run; never a real credential.
const pair = generateKeyPairSync("ed25519");
const pkcs8 = pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");

const env = (extra: Record<string, string>) => ({ ...extra }) as NodeJS.ProcessEnv;

describe("policy signing config", () => {
  it("is null when neither a policy nor an entitlement key is provisioned", () => {
    expect(getPolicySigningConfig(env({}))).toBeNull();
  });

  it("uses the dedicated policy key and a bounded TTL", () => {
    const config = getPolicySigningConfig(
      env({ AIDR_POLICY_SIGNING_KEY_ID: "pk-1", AIDR_POLICY_SIGNING_PRIVATE_KEY_PKCS8_B64: pkcs8, AIDR_POLICY_SIGNATURE_TTL_HOURS: "48" }),
    );
    expect(config).toMatchObject({ keyId: "pk-1", ttlHours: 48 });
  });

  it("falls back to the entitlement key when no policy key is set", () => {
    const config = getPolicySigningConfig(
      env({ AIDR_ENTITLEMENT_SIGNING_KEY_ID: "ent-1", AIDR_ENTITLEMENT_SIGNING_PRIVATE_KEY_PKCS8_B64: pkcs8 }),
    );
    expect(config).toMatchObject({ keyId: "ent-1", ttlHours: 24 });
  });

  it("fails closed on a half-provisioned pair or an invalid TTL", () => {
    expect(() => getPolicySigningConfig(env({ AIDR_POLICY_SIGNING_KEY_ID: "pk-1" }))).toThrow("policy_signing_unavailable");
    expect(() => getPolicySigningConfig(env({ AIDR_POLICY_SIGNING_PRIVATE_KEY_PKCS8_B64: pkcs8 }))).toThrow("policy_signing_unavailable");
    for (const ttl of ["0", "721", "abc", "1.5"]) {
      expect(() =>
        getPolicySigningConfig(
          env({ AIDR_POLICY_SIGNING_KEY_ID: "pk-1", AIDR_POLICY_SIGNING_PRIVATE_KEY_PKCS8_B64: pkcs8, AIDR_POLICY_SIGNATURE_TTL_HOURS: ttl }),
        ),
      ).toThrow("policy_signing_unavailable");
    }
    expect(() => getPolicySigningConfig(env({ AIDR_ENTITLEMENT_SIGNING_KEY_ID: "ent-1" }))).toThrow("entitlement_signing_unavailable");
  });
});

describe("signRuntimePolicyEnvelope", () => {
  const config = { keyId: "pk-1", pkcs8: Buffer.from(pkcs8, "base64"), ttlHours: 2 };
  const now = new Date("2026-10-05T12:00:00.000Z");
  const policy = { command_default: "deny" };

  it("produces a detached Ed25519 signature over canonicalJson(envelope)", () => {
    const signed = signRuntimePolicyEnvelope(
      { tenantId: "t1", policyVersion: "pol_1", policySha256: runtimePolicySha256(policy), sequence: 7, now },
      config,
    );
    expect(signed).toMatchObject({ alg: "ed25519", key_id: "pk-1" });
    expect(signed.envelope).toMatchObject({
      schema_version: 1,
      key_id: "pk-1",
      sequence: 7,
      issued_at: "2026-10-05T12:00:00.000Z",
      expires_at: "2026-10-05T14:00:00.000Z",
    });
    const publicKey = createPublicKey(pair.publicKey.export({ type: "spki", format: "pem" }).toString());
    expect(
      verify(null, Buffer.from(canonicalJson(signed.envelope), "utf8"), publicKey, Buffer.from(signed.sig_b64, "base64")),
    ).toBe(true);
    // Any change to the envelope invalidates it.
    expect(
      verify(
        null,
        Buffer.from(canonicalJson({ ...signed.envelope, sequence: 8 }), "utf8"),
        publicKey,
        Buffer.from(signed.sig_b64, "base64"),
      ),
    ).toBe(false);
  });

  it("refuses a non-positive sequence and a corrupt key", () => {
    const base = { tenantId: "t1", policyVersion: "pol_1", policySha256: "a".repeat(64), now };
    expect(() => signRuntimePolicyEnvelope({ ...base, sequence: 0 }, config)).toThrow("policy_signing_unavailable");
    expect(() => signRuntimePolicyEnvelope({ ...base, sequence: 1 }, { ...config, pkcs8: Buffer.from("nope") })).toThrow(
      "policy_signing_unavailable",
    );
  });
});

describe("runtimePolicySequence", () => {
  it("is monotonic in publish time and honours an explicit sequence", () => {
    const a = runtimePolicySequence({ runtime_policy_published_at: "2026-10-05T12:00:00.000Z" });
    const b = runtimePolicySequence({ runtime_policy_published_at: "2026-10-05T12:00:01.000Z" });
    expect(a).not.toBeNull();
    expect(b!).toBeGreaterThan(a!);
    expect(runtimePolicySequence({ runtime_policy_sequence: 42, updated_at: "2026-10-05T12:00:00.000Z" })).toBe(42);
    expect(runtimePolicySequence({ updated_at: "2026-10-05T12:00:00.000Z" })).toBe(Date.parse("2026-10-05T12:00:00.000Z"));
    expect(runtimePolicySequence({})).toBeNull();
    expect(runtimePolicySequence({ updated_at: "not a date" })).toBeNull();
  });
});
