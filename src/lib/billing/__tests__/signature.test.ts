import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Webhook } from "standardwebhooks";
import {
  normalizePolarWebhookSecret,
  verifyHmacSha256Signature,
  verifyPolarWebhookSignature,
} from "../signature";

function signLegacy(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function signPolar(payload: string, secret: string, timestamp = new Date()) {
  const webhook = new Webhook(normalizePolarWebhookSecret(secret));
  return {
    "webhook-id": "evt_test_123",
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": webhook.sign("evt_test_123", timestamp, payload),
  };
}

describe("verifyHmacSha256Signature", () => {
  it("rejects payload tampering and malformed signatures", () => {
    const payload = JSON.stringify({ provider: "lemon", seats: 2 });
    const secret = "billing-webhook-secret";
    const signature = signLegacy(payload, secret);

    expect(verifyHmacSha256Signature(payload, `sha256=${signature}`, secret)).toBe(true);
    expect(verifyHmacSha256Signature(JSON.stringify({ provider: "lemon", seats: 20 }), signature, secret)).toBe(false);
    expect(verifyHmacSha256Signature(payload, signature.slice(0, -2), secret)).toBe(false);
    expect(verifyHmacSha256Signature(payload, "not-hex", secret)).toBe(false);
  });
});

describe("verifyPolarWebhookSignature", () => {
  it("accepts a valid Standard Webhooks signature", () => {
    const payload = JSON.stringify({ type: "subscription.created", data: { id: "sub_123" } });
    const secret = "polar-webhook-secret";

    expect(verifyPolarWebhookSignature({ rawBody: payload, secret, headers: signPolar(payload, secret) })).toBe(true);
  });

  it("rejects tampered Standard Webhooks payloads", () => {
    const payload = JSON.stringify({ type: "subscription.created", data: { id: "sub_123", seats: 1 } });
    const secret = "polar-webhook-secret";
    const headers = signPolar(payload, secret);

    expect(
      verifyPolarWebhookSignature({
        rawBody: JSON.stringify({ type: "subscription.created", data: { id: "sub_123", seats: 50 } }),
        secret,
        headers,
      }),
    ).toBe(false);
  });

  it("rejects missing or stale Standard Webhooks headers", () => {
    const payload = JSON.stringify({ type: "subscription.created", data: { id: "sub_123" } });
    const secret = "polar-webhook-secret";
    const stale = new Date(Date.now() - 10 * 60 * 1000);

    expect(verifyPolarWebhookSignature({ rawBody: payload, secret, headers: {} })).toBe(false);
    expect(verifyPolarWebhookSignature({ rawBody: payload, secret, headers: signPolar(payload, secret, stale) })).toBe(false);
  });

  it("keeps legacy Polar HMAC fallback guarded against tampering", () => {
    const payload = JSON.stringify({ type: "subscription.created", data: { id: "sub_123" } });
    const secret = "polar-webhook-secret";
    const signature = signLegacy(payload, secret);

    expect(
      verifyPolarWebhookSignature({
        rawBody: payload,
        secret,
        headers: { "x-polar-webhook-signature": `sha256=${signature}` },
      }),
    ).toBe(true);
    expect(
      verifyPolarWebhookSignature({
        rawBody: JSON.stringify({ type: "subscription.revoked", data: { id: "sub_123" } }),
        secret,
        headers: { "x-polar-webhook-signature": signature },
      }),
    ).toBe(false);
  });
});
