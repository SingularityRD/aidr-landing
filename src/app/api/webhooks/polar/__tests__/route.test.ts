import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";
import { normalizePolarWebhookSecret } from "@/lib/billing/signature";
import type { FakeFirestore } from "@/lib/control-plane/__tests__/helpers/fake-firestore";

vi.mock("@/lib/firebase/admin", async () => {
  const { FakeFirestore: Fake } = await import("@/lib/control-plane/__tests__/helpers/fake-firestore");
  return { adminDb: new Fake(), adminAuth: {}, firebaseAdminEnvError: null };
});
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "server-timestamp" },
  Timestamp: class {},
}));

import { POST } from "../route";

const SECRET = "polar-route-secret";
let db: FakeFirestore;

function signed(rawBody: string, deliveryId: string, timestamp = new Date()) {
  const webhook = new Webhook(normalizePolarWebhookSecret(SECRET));
  return {
    "content-type": "application/json",
    "webhook-id": deliveryId,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": webhook.sign(deliveryId, timestamp, rawBody),
  };
}

function send(rawBody: string, headers: Record<string, string>) {
  return POST(new Request("https://aidr.test/api/webhooks/polar", { method: "POST", headers, body: rawBody }) as never);
}

const subscription = (type: string, over: Record<string, unknown> = {}, metadata: Record<string, unknown> = {}) =>
  JSON.stringify({
    type,
    data: {
      id: "sub_route_123",
      status: "active",
      metadata: { user_id: "user_route_123", seats: "2", ...metadata },
      current_period_end: "2026-06-06T00:00:00.000Z",
      ...over,
    },
  });

describe("POST /api/webhooks/polar", () => {
  beforeEach(async () => {
    process.env.POLAR_WEBHOOK_SECRET = SECRET;
    db = (await import("@/lib/firebase/admin")).adminDb as unknown as FakeFirestore;
    db.docs.clear();
  });

  it("writes tenant-scoped entitlement fields the entitlement code reads", async () => {
    const body = subscription("subscription.created");
    const res = await send(body, signed(body, "evt_1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    expect(db.peek("users/user_route_123/entitlements/current")).toMatchObject({
      provider: "polar",
      included_agents: 1,
      extra_agents: 2,
      revoked_serials: [],
      revocation_epoch: 1,
    });
    expect(db.peek("users/user_route_123/seat_usage/current")).toMatchObject({
      included_agents: 1,
      extra_agents: 2,
      allowed_agents: 3,
    });
    expect(db.peek("users/user_route_123/subscriptions/sub_route_123")).toMatchObject({ provider: "polar", status: "active", extra_agents: 2 });
    // Nothing is written for any other tenant.
    expect([...db.docs.keys()].filter((p) => p.startsWith("users/") && !p.startsWith("users/user_route_123/"))).toEqual([]);
  });

  it("buildTenantEntitlement reads what the webhook wrote", async () => {
    const body = subscription("subscription.created");
    await send(body, signed(body, "evt_read"));
    process.env.AIDR_ENTITLEMENT_TTL_HOURS = "168";
    const { buildTenantEntitlement } = await import("@/lib/control-plane/entitlement");
    const snapshot = await buildTenantEntitlement({ uid: "user_route_123", db: db as never });
    expect(snapshot).toMatchObject({ included_agents: 1, extra_agents: 2, allowed_agents: 3 });
  });

  it("ends the entitlement on cancel: extra agents 0, revocation epoch advances, serial list preserved", async () => {
    db.seed("users/user_route_123/entitlements/current", { revoked_serials: ["old-serial"], revocation_epoch: 4, included_agents: 1, extra_agents: 2 });
    const body = subscription("subscription.canceled");
    expect((await send(body, signed(body, "evt_cancel"))).status).toBe(200);
    expect(db.peek("users/user_route_123/entitlements/current")).toMatchObject({
      extra_agents: 0,
      revoked_serials: ["old-serial"],
      revocation_epoch: 5,
    });
    expect(db.peek("users/user_route_123/seat_usage/current")).toMatchObject({ extra_agents: 0, allowed_agents: 1 });
  });

  it("does not entitle seats for a non-active status on subscription.updated", async () => {
    const body = subscription("subscription.updated", { status: "past_due" });
    expect((await send(body, signed(body, "evt_pastdue"))).status).toBe(200);
    expect(db.peek("users/user_route_123/entitlements/current")).toMatchObject({ extra_agents: 0 });
  });

  it("rejects a tampered payload before idempotency or writes", async () => {
    const original = subscription("subscription.created");
    const tampered = subscription("subscription.created", {}, { seats: "200" });
    const res = await send(tampered, signed(original, "evt_tamper"));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "invalid_signature" });
    expect(db.docs.size).toBe(0);
  });

  it("rejects missing headers, the legacy unsigned HMAC header, and stale timestamps", async () => {
    const body = subscription("subscription.created");
    expect((await send(body, { "content-type": "application/json" })).status).toBe(401);
    const legacy = createHmac("sha256", SECRET).update(body).digest("hex");
    expect((await send(body, { "x-polar-webhook-signature": legacy })).status).toBe(401);
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    expect((await send(body, signed(body, "evt_stale", stale))).status).toBe(401);
    expect(db.docs.size).toBe(0);
  });

  it("acknowledges a replayed delivery once and never applies it twice", async () => {
    const body = subscription("subscription.created");
    const headers = signed(body, "evt_replay");
    expect((await send(body, headers)).status).toBe(200);
    db.seed("users/user_route_123/seat_usage/current", { ...db.peek("users/user_route_123/seat_usage/current")!, extra_agents: 99 });
    const again = await send(body, headers);
    expect(again.status).toBe(200);
    await expect(again.json()).resolves.toEqual({ ok: true, duplicate: true });
    expect(db.peek("users/user_route_123/seat_usage/current")).toMatchObject({ extra_agents: 99 });
  });

  it("reuses a delivery id with a different body as a conflict", async () => {
    const first = subscription("subscription.created");
    expect((await send(first, signed(first, "evt_conflict"))).status).toBe(200);
    const second = subscription("subscription.created", {}, { seats: "9" });
    expect((await send(second, signed(second, "evt_conflict"))).status).toBe(409);
  });

  it("keys replay protection on the delivery id, so later events of the same subscription still apply", async () => {
    const created = subscription("subscription.created");
    const cancelled = subscription("subscription.canceled");
    expect((await send(created, signed(created, "evt_a"))).status).toBe(200);
    expect((await send(cancelled, signed(cancelled, "evt_b"))).status).toBe(200);
    expect(db.peek("users/user_route_123/entitlements/current")).toMatchObject({ extra_agents: 0 });
  });

  it("refuses to move a subscription to a different tenant", async () => {
    const mine = subscription("subscription.created");
    expect((await send(mine, signed(mine, "evt_mine"))).status).toBe(200);
    const hijack = subscription("subscription.updated", {}, { user_id: "user_other_999", seats: "50" });
    const res = await send(hijack, signed(hijack, "evt_hijack"));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "billing_tenant_mismatch" });
    expect(db.peek("users/user_other_999/entitlements/current")).toBeUndefined();
    expect(db.peek("users/user_other_999/seat_usage/current")).toBeUndefined();
  });

  it("lets the provider retry after a processing failure (idempotency key released)", async () => {
    const body = subscription("subscription.created");
    const headers = signed(body, "evt_retry");
    const original = db.runTransaction.bind(db);
    let failOnce = true;
    (db as unknown as { runTransaction: unknown }).runTransaction = async (fn: never) => {
      if (failOnce && String(fn).includes("applyEntitlementChange")) {
        failOnce = false;
        throw new Error("transient firestore failure");
      }
      return original(fn);
    };
    try {
      expect((await send(body, headers)).status).toBe(400);
      expect((await send(body, headers)).status).toBe(200);
    } finally {
      (db as unknown as { runTransaction: unknown }).runTransaction = original;
    }
    expect(db.peek("users/user_route_123/entitlements/current")).toMatchObject({ extra_agents: 2 });
  });

  it.each([
    ["path traversal", "../other"],
    ["slash", "a/b"],
    ["empty", ""],
  ])("rejects an unsafe tenant id (%s)", async (_name, userId) => {
    const body = subscription("subscription.created", {}, { user_id: userId });
    expect((await send(body, signed(body, `evt_uid_${_name}`))).status).toBe(400);
    expect(db.docs.size).toBe(0);
  });

  it.each(["-1", "1.5", "abc", "100000"])("rejects invalid seat counts (%s)", async (seats) => {
    const body = subscription("subscription.created", {}, { seats });
    expect((await send(body, signed(body, `evt_seats_${seats}`))).status).toBe(400);
    expect(db.docs.size).toBe(0);
  });

  it("acknowledges unhandled event types without touching anything", async () => {
    const body = JSON.stringify({ type: "order.created", data: { id: "ord_1" } });
    const res = await send(body, signed(body, "evt_order"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, ignored: true });
    expect(db.docs.size).toBe(0);
  });
});
