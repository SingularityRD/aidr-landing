import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../lemon-client";

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

describe("verifyWebhookSignature", () => {
  it("accepts a valid HMAC signature", () => {
    const payload = JSON.stringify({ hello: "world" });
    const secret = "a-very-long-test-secret-that-is-safe-to-use";
    const signature = sign(payload, secret);

    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(payload, `sha256=${signature}`, secret)).toBe(true);
  });

  it("rejects invalid or missing signatures", () => {
    const payload = JSON.stringify({ hello: "world" });
    const secret = "a-very-long-test-secret-that-is-safe-to-use";
    const signature = sign(payload, secret);

    expect(verifyWebhookSignature(payload, "", secret)).toBe(false);
    expect(verifyWebhookSignature(payload, "deadbeef", secret)).toBe(false);
    expect(verifyWebhookSignature("", sign(payload, secret), secret)).toBe(false);
    expect(verifyWebhookSignature(JSON.stringify({ hello: "tampered" }), signature, secret)).toBe(false);
    expect(verifyWebhookSignature(payload, signature, "wrong-secret")).toBe(false);
  });
});
