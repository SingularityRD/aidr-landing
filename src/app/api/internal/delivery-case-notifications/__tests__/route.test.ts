import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminDb: { collection: vi.fn() },
  notifyOverdueDeliveryFailures: vi.fn(),
  recordControlPlaneAudit: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: mocks.adminDb,
}));

vi.mock("@/lib/control-plane/delivery-notifications", () => ({
  notifyOverdueDeliveryFailures: mocks.notifyOverdueDeliveryFailures,
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

describe("POST /api/internal/delivery-case-notifications", () => {
  beforeEach(() => {
    process.env.AIDR_CRON_SECRET = "cron-secret";
    mocks.notifyOverdueDeliveryFailures.mockReset();
    mocks.recordControlPlaneAudit.mockReset();
    mocks.logger.error.mockReset();
  });

  it("rejects calls without the scheduler secret", async () => {
    const response = await POST(
      new Request("https://aidr.test/api/internal/delivery-case-notifications", {
        method: "POST",
        body: JSON.stringify({ uid: "user_1" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(mocks.notifyOverdueDeliveryFailures).not.toHaveBeenCalled();
  });

  it("notifies overdue cases and writes audit evidence", async () => {
    mocks.notifyOverdueDeliveryFailures.mockResolvedValue({
      ok: true,
      scanned: 4,
      notified: 2,
      delivered: 2,
      skipped: 0,
      failed: 0,
      event_id: "evt_notify",
    });

    const response = await POST(
      new Request("https://aidr.test/api/internal/delivery-case-notifications", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret", "user-agent": "test-scheduler" },
        body: JSON.stringify({ uid: "user_1", limit: 100 }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ notified: 2, delivered: 2 });
    expect(mocks.notifyOverdueDeliveryFailures).toHaveBeenCalledWith({
      uid: "user_1",
      actorUserId: "system:delivery-case-notifier",
      db: mocks.adminDb,
      limit: 50,
    });
    expect(mocks.recordControlPlaneAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delivery-failure-overdue-notify",
        outcome: "ok",
        metadata: expect.objectContaining({ notified: 2, delivered: 2, event_id: "evt_notify" }),
      }),
    );
  });
});
