import { describe, expect, it } from "vitest";
import { demoAgents, demoEvents } from "../demo-data";
import { buildIncidentTimeline } from "../incidents";

describe("demo data", () => {
  it("contains a connected agent inventory and incident-producing events", () => {
    expect(demoAgents.some((agent) => agent.status === "connected")).toBe(true);
    expect(demoAgents.some((agent) => agent.runtime_policy_cache?.source === "valid")).toBe(true);
    expect(demoAgents.some((agent) => agent.runtime_policy_cache?.source === "expired")).toBe(true);
    expect(demoEvents.some((event) => event.verdict === "deny")).toBe(true);
    expect(demoEvents.some((event) => event.payload.category === "mcp_tool_call")).toBe(true);
  });

  it("drives the root-cause timeline without Firestore data", () => {
    const timeline = buildIncidentTimeline(demoEvents);

    expect(timeline.length).toBeGreaterThanOrEqual(3);
    expect(timeline[0]?.highest_severity).toBe("critical");
    expect(timeline.map((item) => item.artifact)).toContain("filesystem");
  });
});
