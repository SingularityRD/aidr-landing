/**
 * Vendor-side issuance of AIDR on-prem licenses (`aidr-license-v1`) and
 * customer packets (`aidr-customer-packet-v1`).
 *
 * These are the documents the AIDR product verifies on every endpoint and in the
 * per-customer installer build (SingularityRD/aidr: packages/core/src/license/
 * verify.ts and packet.ts, scripts/license-issue.mjs, scripts/customer-packet-issue.mjs).
 * The rules below are a port of those verifiers: a document this module signs
 * must verify there byte for byte, so every field rule refuses what they refuse
 * (license-vectors.test.ts checks a vector signed by the AIDR scripts).
 *
 * The signature covers `<format>\n` + canonical JSON of the payload (sorted
 * keys, no whitespace). The signing key is an Ed25519 key from
 * AIDR_LICENSE_SIGNING_KEY_ID + AIDR_LICENSE_SIGNING_PRIVATE_KEY_PKCS8_B64; its
 * public half must be in the product's deploy/onprem/license-public-keys.json
 * (`publicKeyRegistryEntry`), or every endpoint refuses what is signed here.
 */
import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from "node:crypto";

export const LICENSE_FORMAT = "aidr-license-v1";
export const CUSTOMER_PACKET_FORMAT = "aidr-customer-packet-v1";
export const MAX_DOCUMENT_BYTES = 64 * 1024;
export const MAX_GRACE_DAYS = 90;
export const MAX_TERM_DAYS = 1830;
export const MAX_SEATS = 100_000;
export const PLAN_IDS = ["free", "team", "business", "enterprise"] as const;
export const DEPLOYMENTS = ["onprem", "airgap"] as const;
export const SENSITIVITIES = ["paranoid", "balanced", "relaxed"] as const;
export const CUSTOMER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

const DAY_MS = 24 * 60 * 60 * 1000;
const DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const FEATURE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const MAX_URL_LENGTH = 2048;

export type PlanId = (typeof PLAN_IDS)[number];
export type Deployment = (typeof DEPLOYMENTS)[number];
export type Sensitivity = (typeof SENSITIVITIES)[number];

export interface LicensePayload {
  license_id: string;
  customer: string;
  customer_id: string;
  plan_id: PlanId;
  seats: number;
  features: string[];
  deployment: Deployment;
  issued_at: string;
  not_before: string;
  expires_at: string;
  grace_days: number;
}

export interface CustomerPacketPayload {
  customer_id: string;
  packet_id: string;
  issued_at: string;
  license: SignedDocument<LicensePayload>;
  control_plane_url?: string;
  sensitivity?: Sensitivity;
  display_name?: string;
}

export interface SignedDocument<P> {
  format: string;
  key_id: string;
  payload: P;
  sig: string;
}

export class LicenseIssueError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "LicenseIssueError";
  }
}

/** Deterministic JSON: sorted object keys, no whitespace. Only JSON data types. */
export function licenseCanonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new LicenseIssueError("license values must be finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(licenseCanonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${licenseCanonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new LicenseIssueError("license values must be JSON data");
}

function signingMessage(format: string, payload: unknown): Buffer {
  return Buffer.from(`${format}\n${licenseCanonicalJson(payload)}`, "utf8");
}

function isoTime(value: string, field: string): number {
  if (!ISO_UTC.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new LicenseIssueError(`${field} must be an ISO-8601 UTC timestamp (YYYY-MM-DDTHH:MM:SSZ)`, field);
  }
  return Date.parse(value);
}

/** An ISO-8601 UTC timestamp at whole seconds, as the AIDR scripts write them. */
export function isoSeconds(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
}

/** The AIDR license verifier's payload rules (verify.ts validateLicensePayload). */
export function validateLicensePayload(p: LicensePayload): void {
  const fail = (message: string, field: string): never => {
    throw new LicenseIssueError(message, field);
  };
  if (!DOCUMENT_ID.test(p.license_id)) fail("license_id must be 1..128 characters of [A-Za-z0-9._-]", "license_id");
  if (p.customer.trim() !== p.customer || p.customer.length < 1 || p.customer.length > 120 || /[\x00-\x1f\x7f]/.test(p.customer)) {
    fail("the legal name must be 1..120 printable characters without surrounding spaces", "customer");
  }
  if (!CUSTOMER_ID_PATTERN.test(p.customer_id)) {
    fail("the customer id must be 2..32 characters of a-z, 0-9 and '-', starting with a letter or digit", "customer_id");
  }
  if (!PLAN_IDS.includes(p.plan_id)) fail(`plan must be one of ${PLAN_IDS.join(", ")}`, "plan_id");
  if (!Number.isInteger(p.seats) || p.seats < 1 || p.seats > MAX_SEATS) fail(`device limit must be a whole number from 1 to ${MAX_SEATS}`, "seats");
  if (p.features.length > 64 || p.features.some((f) => !FEATURE.test(f)) || new Set(p.features).size !== p.features.length) {
    fail("features must be at most 64 unique identifiers of [a-z0-9._:-]", "features");
  }
  if (!DEPLOYMENTS.includes(p.deployment)) fail(`deployment must be one of ${DEPLOYMENTS.join(", ")}`, "deployment");
  if (p.deployment === "airgap" && p.plan_id !== "enterprise") fail("an air-gapped deployment needs the enterprise plan", "plan_id");
  if (!Number.isInteger(p.grace_days) || p.grace_days < 0 || p.grace_days > MAX_GRACE_DAYS) {
    fail(`grace days must be a whole number from 0 to ${MAX_GRACE_DAYS}`, "grace_days");
  }
  const issuedAt = isoTime(p.issued_at, "issued_at");
  const notBefore = isoTime(p.not_before, "not_before");
  const expiresAt = isoTime(p.expires_at, "expires_at");
  if (expiresAt <= notBefore) fail("the license must end after it starts", "expires_at");
  if (expiresAt <= issuedAt) fail("the license must end in the future", "expires_at");
  if (expiresAt - issuedAt > MAX_TERM_DAYS * DAY_MS) fail(`the license may run at most ${MAX_TERM_DAYS} days from today`, "expires_at");
}

/** The AIDR packet verifier's rule for control_plane_url (packet.ts checkControlPlaneUrl). */
export function checkControlPlaneUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LicenseIssueError("the server address must be an absolute https:// address", "control_plane_url");
  }
  if (
    value.length > MAX_URL_LENGTH ||
    /[\s\x00-\x1f\x7f]/u.test(value) ||
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    value.includes("#")
  ) {
    throw new LicenseIssueError("the server address must be an https:// address without credentials or a fragment", "control_plane_url");
  }
}

/** The AIDR packet verifier's rule for display_name (packet.ts checkDisplayName). */
export function checkDisplayName(value: string): void {
  const length = [...value].length;
  if (length < 1 || length > 60 || value.trim() !== value || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value)) {
    throw new LicenseIssueError("the display name must be 1..60 printable characters without surrounding spaces", "display_name");
  }
}

export interface SigningKey {
  keyId: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
}

/** The license signing key, or null when the deployment has none (issuance is then unavailable). */
export function getLicenseSigningKey(env: NodeJS.ProcessEnv = process.env): SigningKey | null {
  const keyId = (env.AIDR_LICENSE_SIGNING_KEY_ID ?? "").trim();
  const b64 = (env.AIDR_LICENSE_SIGNING_PRIVATE_KEY_PKCS8_B64 ?? "").trim();
  if (!keyId && !b64) return null;
  if (!keyId || !b64 || !DOCUMENT_ID.test(keyId)) {
    throw new LicenseIssueError("AIDR_LICENSE_SIGNING_KEY_ID and AIDR_LICENSE_SIGNING_PRIVATE_KEY_PKCS8_B64 must both be set");
  }
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });
  } catch {
    throw new LicenseIssueError("AIDR_LICENSE_SIGNING_PRIVATE_KEY_PKCS8_B64 is not a base64 PKCS#8 private key");
  }
  if (privateKey.asymmetricKeyType !== "ed25519") throw new LicenseIssueError("the license signing key must be Ed25519");
  return { keyId, privateKey, publicKey: createPublicKey(privateKey) };
}

function signDocument<P>(format: string, payload: P, key: SigningKey): SignedDocument<P> {
  const message = signingMessage(format, payload);
  const sig = cryptoSign(null, message, key.privateKey);
  // A key that does not match itself must never produce a document.
  if (!cryptoVerify(null, message, key.publicKey, sig)) throw new LicenseIssueError("the signing key failed its own check");
  const document = { format, key_id: key.keyId, payload, sig: sig.toString("base64") };
  if (Buffer.byteLength(JSON.stringify(document), "utf8") > MAX_DOCUMENT_BYTES) {
    throw new LicenseIssueError(`the signed document is larger than ${MAX_DOCUMENT_BYTES} bytes`);
  }
  return document;
}

export function signLicense(payload: LicensePayload, key: SigningKey): SignedDocument<LicensePayload> {
  validateLicensePayload(payload);
  return signDocument(LICENSE_FORMAT, payload, key);
}

export function signCustomerPacket(payload: CustomerPacketPayload, key: SigningKey): SignedDocument<CustomerPacketPayload> {
  if (!CUSTOMER_ID_PATTERN.test(payload.customer_id) || payload.license.payload.customer_id !== payload.customer_id) {
    throw new LicenseIssueError("the packet and its license must be for the same customer id", "customer_id");
  }
  if (!DOCUMENT_ID.test(payload.packet_id)) throw new LicenseIssueError("packet_id must be 1..128 characters of [A-Za-z0-9._-]");
  isoTime(payload.issued_at, "issued_at");
  if (payload.control_plane_url !== undefined) checkControlPlaneUrl(payload.control_plane_url);
  if (payload.display_name !== undefined) checkDisplayName(payload.display_name);
  if (payload.sensitivity !== undefined && !SENSITIVITIES.includes(payload.sensitivity)) {
    throw new LicenseIssueError(`sensitivity must be one of ${SENSITIVITIES.join(", ")}`, "sensitivity");
  }
  return signDocument(CUSTOMER_PACKET_FORMAT, payload, key);
}

/** The file bytes AIDR reads: the document as pretty JSON with a trailing newline. */
export function documentFileText(document: SignedDocument<unknown>): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** expires_at + grace_days: the last day a new update pack is accepted. */
export function updatesUntil(payload: Pick<LicensePayload, "expires_at" | "grace_days">): string {
  return isoSeconds(Date.parse(payload.expires_at) + payload.grace_days * DAY_MS);
}

/**
 * This deployment's public key as an `aidr-license-public-keys-v1` registry
 * entry, to add to the AIDR repository's deploy/onprem/license-public-keys.json.
 */
export function publicKeyRegistryEntry(key: SigningKey, notBefore: string) {
  const pem = key.publicKey.export({ type: "spki", format: "pem" }).toString();
  const der = key.publicKey.export({ type: "spki", format: "der" });
  return {
    entry: {
      key_id: key.keyId,
      algorithm: "ed25519",
      public_key_pem: pem,
      not_before: notBefore,
      not_after: null,
      status: "active",
    },
    fingerprintSha256: createHash("sha256").update(der).digest("hex"),
  };
}
