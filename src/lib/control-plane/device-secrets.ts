import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Device-flow credentials are never persisted in plaintext. A secret is shown to
 * its recipient once (device-poll / enroll response) and only a SHA-256 digest is
 * stored. The secrets are 160-192 bit random values, so an unsalted digest is not
 * brute-forceable; a domain prefix keeps a digest of one kind from being replayed
 * as another.
 */
export const DEVICE_CODE_SCHEMA_VERSION = 2;

const digest = (domain: string, value: string) =>
  createHash("sha256").update(`${domain}:${value}`).digest("hex");

/** Firestore document id of a device-code session: the digest of the device code. */
export const hashDeviceCode = (deviceCode: string) => digest("aidr.device_code.v1", deviceCode);

export const hashEnrollmentSecret = (token: string) => digest("aidr.enrollment_token.v1", token);

export function mintEnrollmentToken() {
  return `aidr_enroll_${randomBytes(20).toString("hex")}`;
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Decode the non-secret claims out of a legacy plaintext access token (migration only; not verified). */
export function readLegacyAccessClaims(token: string): { jti: string; iat: number; exp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    const { jti, iat, exp } = payload as Record<string, unknown>;
    return typeof jti === "string" && typeof iat === "number" && typeof exp === "number" ? { jti, iat, exp } : null;
  } catch {
    return null;
  }
}
