import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLicensePayload, buildPacketPayload, type CustomerTerms } from "../customers";
import {
  documentFileText,
  getLicenseSigningKey,
  licenseCanonicalJson,
  LicenseIssueError,
  publicKeyRegistryEntry,
  signCustomerPacket,
  signLicense,
  validateLicensePayload,
  type LicensePayload,
} from "../license";

/*
 * The fixtures were produced by the AIDR repository's own tools
 * (SingularityRD/aidr scripts/license-issue.mjs and scripts/customer-packet-issue.mjs)
 * with TEST-ONLY-signing-key.pkcs8.b64, a throwaway key that is in no registry
 * any product trusts. Ed25519 is deterministic, so signing the same payload here
 * must give the same bytes: the panel issues exactly what the product verifies.
 */
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const key = getLicenseSigningKey({
  AIDR_LICENSE_SIGNING_KEY_ID: "vector-2026",
  AIDR_LICENSE_SIGNING_PRIVATE_KEY_PKCS8_B64: fixture("TEST-ONLY-signing-key.pkcs8.b64").trim(),
})!;
const licenseText = fixture("aidr-license.vector.json");
const packetText = fixture("aidr-customer-packet.vector.json");
const registry = JSON.parse(fixture("aidr-registry.vector.json"));

const bilgem: CustomerTerms = {
  customer_id: "bilgem",
  legal_name: "TÜBİTAK BİLGEM",
  display_name: "TÜBİTAK BİLGEM",
  seats: 250,
  plan_id: "enterprise",
  deployment: "airgap",
  features: ["premium_intel", "offline_packs"],
  starts_on: "2026-10-01",
  ends_on: "2027-09-30",
  grace_days: 30,
  control_plane_url: "https://aidr.bilgem.example/",
  sensitivity: "balanced",
  contact_email: "",
  notes: "",
};

describe("license documents match the AIDR tools byte for byte", () => {
  it("signs the vector license to the same file", () => {
    const vector = JSON.parse(licenseText);
    expect(documentFileText(signLicense(vector.payload as LicensePayload, key))).toBe(licenseText);
  });

  it("signs the vector customer packet (with the embedded license) to the same file", () => {
    const vector = JSON.parse(packetText);
    expect(documentFileText(signCustomerPacket(vector.payload, key))).toBe(packetText);
  });

  it("builds the payloads in the AIDR field order from customer terms", () => {
    const license = signLicense(buildLicensePayload(bilgem, "LIC-bilgem-20261001-ab12", new Date("2026-10-01T00:00:00.400Z")), key);
    const vector = JSON.parse(licenseText);
    // Same fields and order; the panel ends a term on the last second of ends_on.
    expect(Object.keys(license.payload)).toEqual(Object.keys(vector.payload));
    expect({ ...license.payload, expires_at: vector.payload.expires_at }).toEqual(vector.payload);
    expect(license.payload.expires_at).toBe("2027-09-30T23:59:59Z");
    const packet = buildPacketPayload(bilgem, "PKT-bilgem-20261001-ab12", JSON.parse(licenseText));
    expect(documentFileText(signCustomerPacket(packet, key))).toBe(packetText);
  });

  it("verifies with the public key the registry entry publishes", () => {
    const { entry, fingerprintSha256 } = publicKeyRegistryEntry(key, "2026-01-01T00:00:00Z");
    expect(entry).toEqual(registry.keys[0]);
    expect(fingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
    const document = JSON.parse(licenseText);
    const message = Buffer.from(`aidr-license-v1\n${licenseCanonicalJson(document.payload)}`, "utf8");
    expect(verify(null, message, createPublicKey(entry.public_key_pem), Buffer.from(document.sig, "base64"))).toBe(true);
  });
});

describe("the AIDR verifier's rules refuse what it would refuse", () => {
  const base = JSON.parse(licenseText).payload as LicensePayload;
  const refused: Array<[string, Partial<LicensePayload>]> = [
    ["seats", { seats: 0 }],
    ["seats", { seats: 100001 }],
    ["seats", { seats: 2.5 }],
    ["plan_id", { deployment: "airgap", plan_id: "business" }],
    ["grace_days", { grace_days: 91 }],
    ["expires_at", { expires_at: "2031-10-07T00:00:00Z" }],
    ["expires_at", { expires_at: "2026-09-30T00:00:00Z" }],
    ["customer_id", { customer_id: "Bilgem" }],
    ["customer", { customer: " BİLGEM" }],
    ["features", { features: ["a", "a"] }],
    ["issued_at", { issued_at: "2026-10-01" }],
  ];
  it.each(refused)("refuses a bad %s", (field, change) => {
    expect(() => validateLicensePayload({ ...base, ...change })).toThrow(expect.objectContaining({ field }));
  });

  it("refuses a packet whose license is for another customer, and bad packet fields", () => {
    const license = JSON.parse(licenseText);
    const packet = JSON.parse(packetText).payload;
    expect(() => signCustomerPacket({ ...packet, customer_id: "havelsan" }, key)).toThrow(LicenseIssueError);
    expect(() => signCustomerPacket({ ...packet, license, control_plane_url: "http://aidr.example/" }, key)).toThrow(/https/);
    expect(() => signCustomerPacket({ ...packet, license, display_name: "x".repeat(61) }, key)).toThrow(/display name/);
  });

  it("refuses a half-configured or non-Ed25519 signing key", () => {
    expect(getLicenseSigningKey({})).toBeNull();
    expect(() => getLicenseSigningKey({ AIDR_LICENSE_SIGNING_KEY_ID: "k" })).toThrow(LicenseIssueError);
    expect(() => getLicenseSigningKey({ AIDR_LICENSE_SIGNING_KEY_ID: "k", AIDR_LICENSE_SIGNING_PRIVATE_KEY_PKCS8_B64: "bm90IGEga2V5" })).toThrow(/PKCS#8/);
  });
});
