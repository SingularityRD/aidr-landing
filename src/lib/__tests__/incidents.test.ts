import { describe, expect, it } from "vitest";
import { buildIncidentTimeline, type IncidentEvent } from "../incidents";

describe("buildIncidentTimeline", () => {
  it("groups repeated decisions by agent, type, and artifact", () => {
    const events: IncidentEvent[] = [
      {
        id: "evt_1",
        agent_id: "agent_1",
        type: "tool_call",
        verdict: "ask",
        severity: "warning",
        created_at: "2026-05-06T10:00:00.000Z",
        payload: { category: "mcp_tool_call", artifact: "filesystem" },
      },
      {
        id: "evt_2",
        agent_id: "agent_1",
        type: "tool_call",
        verdict: "deny",
        severity: "critical",
        created_at: "2026-05-06T10:02:00.000Z",
        payload: { category: "mcp_tool_call", artifact: "filesystem" },
      },
      {
        id: "evt_3",
        agent_id: "agent_2",
        type: "tool_call",
        verdict: "allow",
        severity: "info",
        created_at: "2026-05-06T10:03:00.000Z",
        payload: { category: "command_execution", artifact: "npm test" },
      },
    ];

    const timeline = buildIncidentTimeline(events);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      agent_id: "agent_1",
      type: "mcp_tool_call",
      artifact: "filesystem",
      event_count: 2,
      highest_severity: "critical",
      dominant_verdict: "deny",
      first_seen_at: "2026-05-06T10:00:00.000Z",
      last_seen_at: "2026-05-06T10:02:00.000Z",
    });
    expect(timeline[0]?.recommended_actions).toContain("Keep policy strict");
  });

  it("prioritizes critical root causes and repeated events", () => {
    const events: IncidentEvent[] = [
      {
        id: "evt_1",
        agent_id: "agent_1",
        verdict: "ask",
        severity: "warning",
        created_at: "2026-05-06T10:00:00.000Z",
        payload: { category: "network_egress", artifact: "https://example.test" },
      },
      {
        id: "evt_2",
        agent_id: "agent_1",
        verdict: "ask",
        severity: "warning",
        created_at: "2026-05-06T10:01:00.000Z",
        payload: { category: "network_egress", artifact: "https://example.test" },
      },
      {
        id: "evt_3",
        agent_id: "agent_1",
        verdict: "deny",
        severity: "critical",
        created_at: "2026-05-06T10:02:00.000Z",
        payload: { category: "supply_chain", artifact: "left-pad" },
      },
    ];

    const timeline = buildIncidentTimeline(events);

    expect(timeline.map((item) => item.artifact)).toEqual(["left-pad", "https://example.test"]);
    expect(timeline[1]?.event_count).toBe(2);
  });

  it("keeps policy drift acknowledgement in the incident timeline as remediation evidence", () => {
    const timeline = buildIncidentTimeline([
      {
        id: "evt_ack",
        agent_id: "agent_1",
        type: "policy_drift_acknowledgement",
        verdict: "allow",
        severity: "info",
        created_at: "2026-05-06T10:05:00.000Z",
        payload: {
          category: "policy_rollout",
          artifact: "agent_1",
          action: "mark_reviewed",
          remediation: "Admin marked this policy drift item as reviewed.",
        },
      },
    ]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      agent_id: "agent_1",
      type: "policy_rollout",
      artifact: "agent_1",
      dominant_verdict: "allow",
      highest_severity: "info",
    });
    expect(timeline[0]?.recommended_actions).toContain("Keep acknowledgement evidence");
  });
});
