import { describe, expect, it } from "vitest";
import { deliveryBackoffSeconds, recordDeliveryFailure, type DeliveryEvidenceDb } from "../delivery-evidence";

class FakeDeliveryEvidenceDb implements DeliveryEvidenceDb {
  readonly writes: Array<{ path: string; data: Record<string, unknown> }> = [];
  private nextId = 0;

  collection(path: string) {
    return {
      doc: () => {
        const id = `failure_${++this.nextId}`;
        return {
          id,
          set: async (data: Record<string, unknown>) => {
            this.writes.push({ path: `${path}/${id}`, data });
          },
        };
      },
    };
  }
}

describe("delivery evidence", () => {
  it("computes bounded exponential backoff", () => {
    expect(deliveryBackoffSeconds(1)).toBe(60);
    expect(deliveryBackoffSeconds(3)).toBe(240);
    expect(deliveryBackoffSeconds(20)).toBe(3600);
  });

  it("records retry-pending evidence with next retry metadata", async () => {
    const db = new FakeDeliveryEvidenceDb();
    const evidence = await recordDeliveryFailure({
      uid: "user_1",
      db,
      channel: "security_export",
      eventType: "security.events",
      subject: "req_1",
      destination: "https://siem.example/hook/path",
      reason: "http_500",
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(db.writes[0]?.path).toBe("users/user_1/delivery_failures/failure_1");
    expect(evidence).toMatchObject({
      channel: "security_export",
      event_type: "security.events",
      status: "retry_pending",
      destination_origin: "https://siem.example",
      retry: {
        attempt: 1,
        max_attempts: 5,
        backoff_seconds: 60,
        next_retry_at: "2026-05-06T12:01:00.000Z",
        dead_letter_at: null,
      },
    });
  });

  it("records dead-letter evidence when max attempts are exhausted", async () => {
    const db = new FakeDeliveryEvidenceDb();
    const evidence = await recordDeliveryFailure({
      uid: "user_1",
      db,
      channel: "policy_rollout",
      eventType: "policy.rollout_reminder",
      subject: "policy_rollout_1",
      reason: "network_error",
      attempt: 5,
      maxAttempts: 5,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(evidence).toMatchObject({
      status: "dead_letter",
      retry: {
        attempt: 5,
        max_attempts: 5,
        backoff_seconds: null,
        next_retry_at: null,
        dead_letter_at: "2026-05-06T12:00:00.000Z",
      },
    });
  });
});
