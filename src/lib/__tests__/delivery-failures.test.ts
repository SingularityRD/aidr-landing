import { describe, expect, it } from "vitest";
import {
  deliveryFailureStats,
  deliveryFailureSlaState,
  deliveryFailureTone,
  filterDeliveryFailures,
  replayHrefForDeliveryFailure,
  type DeliveryFailureRow,
} from "../delivery-failures";

describe("delivery failure helpers", () => {
  const failures: DeliveryFailureRow[] = [
    {
      id: "retry",
      channel: "policy_rollout",
      status: "retry_pending",
    },
    {
      id: "dead",
      channel: "security_export",
      status: "dead_letter",
    },
  ];

  it("summarizes delivery failures by status and channel", () => {
    expect(deliveryFailureStats(failures)).toEqual({
      total: 2,
      retryPending: 1,
      deadLetter: 1,
      replayDelivered: 0,
      replaySkipped: 0,
      closed: 0,
      overdue: 0,
      securityExport: 1,
      policyRollout: 1,
    });
  });

  it("filters and styles failure statuses", () => {
    expect(filterDeliveryFailures(failures, "retry_pending").map((failure) => failure.id)).toEqual(["retry"]);
    expect(deliveryFailureTone("dead_letter").label).toBe("dead-letter");
    expect(deliveryFailureTone("replay_delivered").label).toBe("replay delivered");
    expect(deliveryFailureTone("closed").label).toBe("closed");
  });

  it("computes SLA state for operator-owned failures", () => {
    expect(
      deliveryFailureSlaState(
        { id: "sla", status: "retry_pending", sla: { due_at: "2026-05-06T11:00:00.000Z" } },
        new Date("2026-05-06T12:00:00.000Z")
      ).state
    ).toBe("overdue");
    expect(deliveryFailureSlaState({ id: "closed", status: "closed" }).state).toBe("closed");
  });

  it("returns replay destinations for each channel", () => {
    expect(replayHrefForDeliveryFailure(failures[0])).toBe("/policy-rollout");
    expect(replayHrefForDeliveryFailure(failures[1])).toBe("/settings#security-export");
  });
});
