import { describe, expect, it } from "vitest";
import {
  classifyEvent,
  eventDisplaySummary,
  eventDisplayTitle,
  isPolicyDriftAcknowledgement,
} from "../event-classification";

describe("event classification", () => {
  it("treats policy drift acknowledgement as remediation evidence", () => {
    const event = {
      type: "policy_drift_acknowledgement",
      verdict: "allow",
      severity: "info",
      payload: {
        action: "mark_reviewed",
        remediation: "Admin marked this policy drift item as reviewed.",
      },
    };

    expect(isPolicyDriftAcknowledgement(event)).toBe(true);
    expect(classifyEvent(event)).toBe("remediation");
    expect(eventDisplayTitle(event)).toBe("Policy drift mark reviewed");
    expect(eventDisplaySummary(event)).toBe("Admin marked this policy drift item as reviewed.");
  });

  it("keeps ask, deny, and warning events in the security class", () => {
    expect(classifyEvent({ verdict: "deny", severity: "info" })).toBe("security");
    expect(classifyEvent({ verdict: "allow", severity: "warning" })).toBe("security");
    expect(classifyEvent({ verdict: "allow", severity: "info" })).toBe("telemetry");
  });
});
