import { describe, expect, it } from "vitest";
import {
  currentPolicyVersionFromSettings,
  buildReconnectReminderText,
  buildStaleAgentCsv,
  filterPolicyDriftAlertsByAcknowledgement,
  formatPolicySeconds,
  getAcknowledgedPolicyDriftAgentIds,
  getPolicyCacheLabel,
  getPolicyDriftAlerts,
  getPolicyRolloutStats,
  type PolicyRolloutAgent,
} from "../policy-rollout";

describe("policy rollout helpers", () => {
  const agents: PolicyRolloutAgent[] = [
    {
      id: "fresh",
      runtime_policy_cache: {
        source: "valid",
        usable: true,
        policy_version: "pol_current",
        age_seconds: 40,
        ttl_seconds: 120,
      },
    },
    {
      id: "stale",
      runtime_policy_cache: {
        source: "expired",
        usable: false,
        policy_version: "pol_previous",
        age_seconds: 900,
        ttl_seconds: 0,
      },
    },
    {
      id: "missing",
      runtime_policy_cache: {
        source: "missing",
        usable: false,
      },
    },
    {
      id: "invalid",
      runtime_policy_cache: {
        source: "invalid",
        usable: false,
        policy_version: "pol_current",
      },
    },
  ];

  it("derives the current policy version from explicit version, update time, or default", () => {
    expect(currentPolicyVersionFromSettings({ runtime_policy_version: "pol_live" })).toBe("pol_live");
    expect(currentPolicyVersionFromSettings({ updated_at: "2026-05-06T10:00:00.000Z" })).toBe(
      "2026-05-06T10:00:00.000Z"
    );
    expect(currentPolicyVersionFromSettings({})).toBe("default");
  });

  it("classifies cache states and summarizes rollout health", () => {
    expect(getPolicyCacheLabel(agents[0]?.runtime_policy_cache)).toBe("fresh");
    expect(getPolicyCacheLabel(agents[1]?.runtime_policy_cache)).toBe("stale");
    expect(getPolicyCacheLabel(agents[2]?.runtime_policy_cache)).toBe("unknown");
    expect(getPolicyCacheLabel(agents[3]?.runtime_policy_cache)).toBe("attention");

    expect(getPolicyRolloutStats(agents, "pol_current")).toEqual({
      current: 2,
      fresh: 1,
      stale: 1,
      unknown: 2,
    });
  });

  it("raises drift alerts for stale, unknown, invalid, and old-version agents", () => {
    const alerts = getPolicyDriftAlerts(
      [
        ...agents,
        {
          id: "old-fresh",
          runtime_policy_cache: {
            source: "valid",
            usable: true,
            policy_version: "pol_previous",
            age_seconds: 30,
            ttl_seconds: 60,
          },
        },
      ],
      "pol_current",
      { cacheSlaSeconds: 300 }
    );

    expect(alerts.map((alert) => alert.agent.id)).toEqual(["stale", "missing", "invalid", "old-fresh"]);
    expect(alerts.find((alert) => alert.agent.id === "invalid")?.severity).toBe("critical");
    expect(alerts.find((alert) => alert.agent.id === "old-fresh")?.reason).toContain("pol_previous");
  });

  it("does not alert on recently expired caches before the SLA", () => {
    expect(
      getPolicyDriftAlerts(
        [
          {
            id: "recent",
            runtime_policy_cache: {
              source: "expired",
              usable: false,
              policy_version: "pol_current",
              age_seconds: 60,
              ttl_seconds: 0,
            },
          },
        ],
        "pol_current",
        { cacheSlaSeconds: 300 }
      )
    ).toEqual([]);
  });

  it("formats seconds for compact dashboard labels", () => {
    expect(formatPolicySeconds(null)).toBe("unknown");
    expect(formatPolicySeconds(45)).toBe("45s");
    expect(formatPolicySeconds(120)).toBe("2m");
    expect(formatPolicySeconds(7200)).toBe("2h");
  });

  it("filters drift alerts by acknowledgement evidence", () => {
    const alerts = getPolicyDriftAlerts(agents, "pol_current");
    const acknowledged = getAcknowledgedPolicyDriftAgentIds([
      { type: "policy_drift_acknowledgement", agent_id: "stale" },
      { type: "tool_call", agent_id: "invalid" },
    ]);

    expect(filterPolicyDriftAlertsByAcknowledgement(alerts, acknowledged, "acknowledged").map((alert) => alert.agent.id)).toEqual([
      "stale",
    ]);
    expect(filterPolicyDriftAlertsByAcknowledgement(alerts, acknowledged, "unacknowledged").map((alert) => alert.agent.id)).toEqual([
      "missing",
      "invalid",
    ]);
  });

  it("builds CSV and reconnect reminder artifacts for stale agents", () => {
    const alerts = getPolicyDriftAlerts(agents, "pol_current");
    const csv = buildStaleAgentCsv(alerts, "pol_current");
    const reminder = buildReconnectReminderText(alerts, "pol_current");

    expect(csv).toContain('"agent_id","name","runtime"');
    expect(csv).toContain('"stale"');
    expect(csv).toContain('"pol_previous"');
    expect(reminder).toContain("AIDR policy rollout reminder");
    expect(reminder).toContain("Current policy: pol_current");
    expect(reminder).toContain("stale");
  });
});
