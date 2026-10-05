import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { applyLemonWebhook, type LemonWebhookPayload } from "../webhook";

const SECRET = "lemon-test-secret-that-is-long-enough";
let db: FakeFirestore;

function call(payload: LemonWebhookPayload, over: { signature?: string; rawBody?: string } = {}) {
  const rawBody = over.rawBody ?? JSON.stringify(payload);
  const signature = over.signature ?? createHmac("sha256", SECRET).update(rawBody, "utf8").digest("hex");
  return applyLemonWebhook({ payload, rawBody, signature, secret: SECRET });
}

const payload = (over: Partial<LemonWebhookPayload["meta"]> = {}, attrs: Record<string, unknown> = {}): LemonWebhookPayload => ({
  meta: { event_name: "subscription_updated", event_id: "ev_1", custom_data: { user_id: "user_lemon_1", seats: "3" }, ...over },
  data: { id: "ls_sub_1", attributes: { status: "active", ...attrs } },
});

describe("applyLemonWebhook", () => {
  beforeEach(async () => {
    db = (await import("@/lib/firebase/admin")).adminDb as unknown as FakeFirestore;
    db.docs.clear();
  });

  it("verifies the signature before reading anything the sender controls", async () => {
    await expect(call(payload(), { signature: "deadbeef" })).rejects.toThrow("invalid_signature");
    await expect(call(payload(), { signature: "" })).rejects.toThrow("invalid_signature");
    expect(db.docs.size).toBe(0);
  });

  it("writes tenant-scoped entitlement fields (included/extra agents, revoked_serials, epoch)", async () => {
    await expect(call(payload())).resolves.toMatchObject({ ok: true, uid: "user_lemon_1" });
    expect(db.peek("users/user_lemon_1/entitlements/current")).toMatchObject({
      provider: "lemon_squeezy",
      included_agents: 1,
      extra_agents: 2,
      revoked_serials: [],
      revocation_epoch: 1,
    });
    expect(db.peek("users/user_lemon_1/seat_usage/current")).toMatchObject({ allowed_agents: 3 });
    expect([...db.docs.keys()].filter((p) => p.startsWith("users/") && !p.startsWith("users/user_lemon_1/"))).toEqual([]);
  });

  it("dedupes by delivery id and treats a changed body under the same id as a conflict", async () => {
    await call(payload());
    await expect(call(payload())).resolves.toMatchObject({ ok: true, duplicate: true });
    await expect(call(payload({ custom_data: { user_id: "user_lemon_1", seats: "9" } }))).rejects.toThrow("billing_webhook_conflict");
  });

  it("does not use the subscription id as the delivery id: a later event for the same subscription applies", async () => {
    await call(payload({ event_id: "ev_a" }));
    await call(payload({ event_id: "ev_b", event_name: "subscription_cancelled" }));
    expect(db.peek("users/user_lemon_1/entitlements/current")).toMatchObject({ extra_agents: 0, revocation_epoch: 2 });
  });

  it("falls back to the exact-body digest when the payload carries no event id", async () => {
    const noId = payload({ event_id: undefined });
    await call(noId);
    await expect(call(noId)).resolves.toMatchObject({ duplicate: true });
  });

  it("refuses events older than the replay-protection window", async () => {
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
    await expect(call(payload({}, { updated_at: old }))).rejects.toThrow("billing_webhook_stale");
    expect(db.docs.size).toBe(0);
  });

  it("binds a subscription to its first tenant", async () => {
    await call(payload({ event_id: "ev_own" }));
    const hijack = payload({ event_id: "ev_hijack", custom_data: { user_id: "user_lemon_2", seats: "50" } });
    await expect(call(hijack)).rejects.toThrow("billing_tenant_mismatch");
    expect(db.peek("users/user_lemon_2/entitlements/current")).toBeUndefined();
  });

  it("rejects unsafe tenant ids and invalid seat counts", async () => {
    await expect(call(payload({ custom_data: { user_id: "../x", seats: "1" } }))).rejects.toThrow("missing_user_id");
    await expect(call(payload({ custom_data: { user_id: "user_lemon_1", seats: "-5" } }))).rejects.toThrow("invalid_seats");
    expect(db.docs.size).toBe(0);
  });

  it("releases the replay reservation when processing fails so the retry is applied", async () => {
    const original = db.runTransaction.bind(db);
    let failOnce = true;
    (db as unknown as { runTransaction: unknown }).runTransaction = async (fn: never) => {
      if (failOnce) {
        failOnce = false;
        throw new Error("transient");
      }
      return original(fn);
    };
    try {
      await expect(call(payload({ event_id: "ev_retry" }))).rejects.toThrow("transient");
      await expect(call(payload({ event_id: "ev_retry" }))).resolves.toMatchObject({ ok: true });
    } finally {
      (db as unknown as { runTransaction: unknown }).runTransaction = original;
    }
    expect(db.peek("users/user_lemon_1/entitlements/current")).toMatchObject({ extra_agents: 2 });
  });
});
