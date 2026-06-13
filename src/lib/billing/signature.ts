import { createHmac, timingSafeEqual } from "node:crypto";
import { Webhook } from "standardwebhooks";

export type WebhookHeaderMap = Record<string, string | null | undefined>;

export function verifyHmacSha256Signature(payload: string, signature: string, secret: string): boolean {
  const cleanSecret = secret.trim();
  const cleanSignature = signature.trim().replace(/^sha256=/i, "");
  if (!payload || !cleanSecret || !cleanSignature) return false;

  const expected = createHmac("sha256", cleanSecret).update(payload, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(cleanSignature, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

export function normalizePolarWebhookSecret(secret: string): string {
  const cleanSecret = secret.trim();
  if (cleanSecret.startsWith("whsec_")) return cleanSecret;
  return Buffer.from(cleanSecret, "utf8").toString("base64");
}

function getHeader(headers: WebhookHeaderMap, name: string): string {
  return headers[name] ?? headers[name.toLowerCase()] ?? "";
}

export function verifyPolarWebhookSignature(input: {
  rawBody: string;
  secret: string;
  headers: WebhookHeaderMap;
}): boolean {
  const secret = input.secret.trim();
  if (!input.rawBody || !secret) return false;

  const standardHeaders = {
    "webhook-id": getHeader(input.headers, "webhook-id").trim(),
    "webhook-timestamp": getHeader(input.headers, "webhook-timestamp").trim(),
    "webhook-signature": getHeader(input.headers, "webhook-signature").trim(),
  };

  if (
    standardHeaders["webhook-id"] &&
    standardHeaders["webhook-timestamp"] &&
    standardHeaders["webhook-signature"]
  ) {
    try {
      const webhook = new Webhook(normalizePolarWebhookSecret(secret));
      webhook.verify(input.rawBody, standardHeaders);
      return true;
    } catch {
      return false;
    }
  }

  const legacySignature = getHeader(input.headers, "x-polar-webhook-signature");
  return verifyHmacSha256Signature(input.rawBody, legacySignature, secret);
}
