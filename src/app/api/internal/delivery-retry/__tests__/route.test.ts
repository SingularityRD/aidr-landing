import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminDb: { collection: vi.fn() },
  processDueDeliveryFailures: vi.fn(),
  recordControlPlaneAudit: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: mocks.adminDb,
}));

vi.mock("@/lib/control-plane/delivery-replay", () => ({
  processDueDeliveryFailures: mocks.processDueDeliveryFailures,
}));

vi.mock("@/lib/control-plane/request-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/control-plane/request-guard")>(
    "@/lib/control-plane/request-guard",
  );
  return {
    ...actual,
    recordControlPlaneAudit: mocks.recordControlPlaneAudit,
  };
});

vi.mock("@/lib/logger", () => ({
  logger: mocks.logger,
}));

import { POST } from "../route";

describe("POST /api/internal/delivery-retry", () => {
  beforeEach(() => {
    process.env.AIDR_CRON_SECRET = "cron-secret";
    mocks.processDueDeliveryFailures.mockReset();
    mocks.recordControlPlaneAudit.mockReset();
    mocks.logger.error.mockReset();
  });

  it("rejects calls without the scheduler secret", async () => {
    const response = await POST(
      new Request("https://aidr.test/api/internal/delivery-retry", {
        method: "POST",
        body: JSON.stringify({ uid: "user_1" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(mocks.processDueDeliveryFailures).not.toHaveBeenCalled();
  });

  it("processes due delivery failures for the requested uid and writes audit evidence", async () => {
    mocks.processDueDeliveryFailures.mockResolvedValue({
      ok: true,
      scanned: 3,
      replayed: 2,
      delivered: 2,
      skipped: 0,
      failed: 0,
      results: [],
    });

    const response = await POST(
      new Request("https://aidr.test/api/internal/delivery-retry", {
        method: "POST",
        headers: {
          authorization: "Bearer cron-secret",
          "user-agent": "test-scheduler",
        },
        body: JSON.stringify({ uid: "user_1", limit: 99 }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, replayed: 2, delivered: 2 });
    expect(mocks.processDueDeliveryFailures).toHaveBeenCalledWith({
      uid: "user_1",
      actorUserId: "system:delivery-retry-scheduler",
      db: mocks.adminDb,
      limit: 50,
    });
    expect(mocks.recordControlPlaneAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delivery-failure-retry-due",
        outcome: "ok",
        uid: "user_1",
        metadata: expect.objectContaining({ limit: 50, replayed: 2, delivered: 2 }),
      }),
    );
  });

  it("hides internal errors while leaving failed audit evidence", async () => {
    mocks.processDueDeliveryFailures.mockRejectedValue(new Error("firestore_unavailable"));
    mocks.recordControlPlaneAudit.mockResolvedValue(undefined);

    const response = await POST(
      new Request("https://aidr.test/api/internal/delivery-retry", {
        method: "POST",
        headers: { "x-aidr-cron-secret": "cron-secret" },
        body: JSON.stringify({ uid: "user_1", limit: 2 }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "delivery_retry_failed" });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: "firestore_unavailable", uid: "user_1" }),
      "Delivery retry scheduler failed",
    );
    expect(mocks.recordControlPlaneAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delivery-failure-retry-due",
        outcome: "failed",
        metadata: { limit: 2, error: "firestore_unavailable" },
      }),
    );
  });
});
