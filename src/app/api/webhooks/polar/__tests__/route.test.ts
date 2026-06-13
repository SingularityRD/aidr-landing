import { describe, expect, it, beforeEach, vi } from "vitest";
import { Webhook } from "standardwebhooks";
import { normalizePolarWebhookSecret } from "@/lib/billing/signature";

const mocks = vi.hoisted(() => {
  const set = vi.fn();
  const get = vi.fn();
  const doc = vi.fn(() => ({ get, set }));
  const collection = vi.fn(() => ({ doc }));
  return {
    adminDb: { collection },
    collection,
    doc,
    get,
    set,
    hashStable: vi.fn(() => "stable-hash"),
    reserveIdempotencyKey: vi.fn(),
    logger: {
      error: vi.fn(),
      info: vi.fn(),
    },
  };
});

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: mocks.adminDb,
}));

vi.mock("@/lib/control-plane/request-guard", () => ({
  hashStable: mocks.hashStable,
  reserveIdempotencyKey: mocks.reserveIdempotencyKey,
}));

vi.mock("@/lib/logger", () => ({
  logger: mocks.logger,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "server-timestamp",
  },
}));

import { POST } from "../route";

function signPolarRequest(rawBody: string, secret: string) {
  const timestamp = new Date();
  const webhook = new Webhook(normalizePolarWebhookSecret(secret));
  return {
    "content-type": "application/json",
    "webhook-id": "evt_route_test",
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": webhook.sign("evt_route_test", timestamp, rawBody),
  };
}

describe("POST /api/webhooks/polar", () => {
  beforeEach(() => {
    process.env.POLAR_WEBHOOK_SECRET = "polar-route-secret";
    mocks.collection.mockClear();
    mocks.doc.mockClear();
    mocks.get.mockResolvedValue({ exists: true, data: () => ({ included_agents: 1 }) });
    mocks.set.mockClear();
    mocks.hashStable.mockClear();
    mocks.reserveIdempotencyKey.mockClear();
    mocks.reserveIdempotencyKey.mockResolvedValue({ state: "created" });
    mocks.logger.error.mockClear();
    mocks.logger.info.mockClear();
  });

  it("processes a signed subscription event and updates entitlement documents", async () => {
    const payload = JSON.stringify({
      type: "subscription.created",
      data: {
        id: "sub_route_123",
        metadata: { user_id: "user_route_123", seats: "2" },
        current_period_end: "2026-06-06T00:00:00.000Z",
      },
    });

    const response = await POST(
      new Request("https://aidr.test/api/webhooks/polar", {
        method: "POST",
        headers: signPolarRequest(payload, "polar-route-secret"),
        body: payload,
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.reserveIdempotencyKey).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "polar-webhook",
        key: "sub_route_123",
      }),
    );
    expect(mocks.collection).toHaveBeenCalledWith("users/user_route_123/subscriptions");
    expect(mocks.collection).toHaveBeenCalledWith("users/user_route_123/seat_usage");
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "polar",
        status: "active",
        extra_agents: 2,
      }),
      { merge: true },
    );
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        included_agents: 1,
        extra_agents: 2,
        allowed_agents: 3,
      }),
      { merge: true },
    );
  });

  it("rejects a tampered payload before idempotency or writes", async () => {
    const originalPayload = JSON.stringify({
      type: "subscription.created",
      data: {
        id: "sub_route_123",
        metadata: { user_id: "user_route_123", seats: "2" },
      },
    });
    const tamperedPayload = JSON.stringify({
      type: "subscription.created",
      data: {
        id: "sub_route_123",
        metadata: { user_id: "user_route_123", seats: "200" },
      },
    });

    const response = await POST(
      new Request("https://aidr.test/api/webhooks/polar", {
        method: "POST",
        headers: signPolarRequest(originalPayload, "polar-route-secret"),
        body: tamperedPayload,
      }) as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_signature" });
    expect(mocks.reserveIdempotencyKey).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
