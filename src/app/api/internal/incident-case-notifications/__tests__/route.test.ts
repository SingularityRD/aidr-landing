import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminDb: { collection: vi.fn() },
  notifyIncidentCaseEscalations: vi.fn(),
  recordControlPlaneAudit: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: mocks.adminDb,
}));

vi.mock("@/lib/control-plane/incident-notifications", () => ({
  notifyIncidentCaseEscalations: mocks.notifyIncidentCaseEscalations,
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

describe("POST /api/internal/incident-case-notifications", () => {
  beforeEach(() => {
    process.env.AIDR_CRON_SECRET = "cron-secret";
    mocks.notifyIncidentCaseEscalations.mockReset();
    mocks.recordControlPlaneAudit.mockReset();
    mocks.logger.error.mockReset();
  });

  it("rejects calls without the scheduler secret", async () => {
    const response = await POST(
      new Request("https://aidr.test/api/internal/incident-case-notifications", {
        method: "POST",
        body: JSON.stringify({ uid: "user_1" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(mocks.notifyIncidentCaseEscalations).not.toHaveBeenCalled();
  });

  it("notifies incident escalations and writes audit evidence", async () => {
    mocks.notifyIncidentCaseEscalations.mockResolvedValue({
      ok: true,
      scanned: 5,
      notified: 2,
      delivered: 1,
      skipped: 0,
      failed: 1,
      event_id: "evt_incident_notify",
    });

    const response = await POST(
      new Request("https://aidr.test/api/internal/incident-case-notifications", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret", "user-agent": "test-scheduler" },
        body: JSON.stringify({ uid: "user_1", limit: 100 }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ notified: 2, delivered: 1, failed: 1 });
    expect(mocks.notifyIncidentCaseEscalations).toHaveBeenCalledWith({
      uid: "user_1",
      actorUserId: "system:incident-case-notifier",
      db: mocks.adminDb,
      limit: 50,
    });
    expect(mocks.recordControlPlaneAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "incident-case-escalation-notify",
        outcome: "partial_failure",
        metadata: expect.objectContaining({ notified: 2, delivered: 1, failed: 1, event_id: "evt_incident_notify" }),
      }),
    );
  });
});
