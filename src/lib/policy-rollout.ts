export type RuntimePolicyCacheMetadata = {
  source?: string | null;
  usable?: boolean | null;
  policy_version?: string | null;
  cached_at?: string | null;
  expires_at?: string | null;
  age_seconds?: number | null;
  ttl_seconds?: number | null;
};

export type PolicyRolloutAgent = {
  id: string;
  name?: string | null;
  runtime?: string | null;
  status?: string | null;
  runtime_policy_cache?: RuntimePolicyCacheMetadata | null;
};

export type PolicyCacheLabel = "fresh" | "stale" | "attention" | "unknown";

export type PolicyDriftAlert = {
  agent: PolicyRolloutAgent;
  label: PolicyCacheLabel;
  severity: "warning" | "critical";
  reason: string;
};

export type PolicyAcknowledgementStatus = "all" | "unacknowledged" | "acknowledged";

export type PolicyRolloutEvent = {
  agent_id?: string | null;
  type?: string | null;
};

export function formatPolicySeconds(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  if (value <= 0) return "0s";
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.round(value / 60)}m`;
  return `${Math.round(value / 3600)}h`;
}

export function currentPolicyVersionFromSettings(settings: {
  runtime_policy_version?: string;
  updated_at?: string;
}) {
  return settings.runtime_policy_version ?? settings.updated_at ?? "default";
}

export function getPolicyCacheLabel(cache?: RuntimePolicyCacheMetadata | null): PolicyCacheLabel {
  const source = cache?.source ?? "missing";
  if (cache?.usable || source === "valid") return "fresh";
  if (source === "expired") return "stale";
  if (source === "mismatched" || source === "invalid") return "attention";
  return "unknown";
}

export function getPolicyRolloutStats(agents: PolicyRolloutAgent[], version: string) {
  return agents.reduce(
    (stats, agent) => {
      const cache = agent.runtime_policy_cache;
      const label = getPolicyCacheLabel(cache);
      if (label === "fresh") stats.fresh += 1;
      else if (label === "stale") stats.stale += 1;
      else stats.unknown += 1;
      if (cache?.policy_version && cache.policy_version === version) stats.current += 1;
      return stats;
    },
    { fresh: 0, stale: 0, unknown: 0, current: 0 }
  );
}

export function getPolicyDriftAlerts(
  agents: PolicyRolloutAgent[],
  currentVersion: string,
  options: { cacheSlaSeconds?: number } = {}
): PolicyDriftAlert[] {
  const cacheSlaSeconds = options.cacheSlaSeconds ?? 300;
  return agents.flatMap<PolicyDriftAlert>((agent) => {
    const cache = agent.runtime_policy_cache;
    const label = getPolicyCacheLabel(cache);
    const source = cache?.source ?? "missing";
    const age = typeof cache?.age_seconds === "number" ? cache.age_seconds : null;
    const version = cache?.policy_version ?? null;

    if (label === "attention") {
      return [
        {
          agent,
          label,
          severity: "critical" as const,
          reason:
            source === "mismatched"
              ? "Policy cache belongs to a different endpoint or agent token."
              : "Policy cache is invalid and cannot be trusted.",
        },
      ];
    }

    if (label === "stale" && (age === null || age >= cacheSlaSeconds)) {
      return [
        {
          agent,
          label,
          severity: "warning" as const,
          reason: `Policy cache is stale beyond the ${formatPolicySeconds(cacheSlaSeconds)} SLA.`,
        },
      ];
    }

    if (label === "unknown") {
      return [
        {
          agent,
          label,
          severity: "warning" as const,
          reason:
            source === "disabled"
              ? "Remote policy cache reporting is disabled for this agent."
              : "Agent has not reported a usable runtime policy cache.",
        },
      ];
    }

    if (version && currentVersion !== "default" && version !== currentVersion) {
      return [
        {
          agent,
          label,
          severity: "warning" as const,
          reason: `Agent is enforcing ${version}, not the current ${currentVersion} policy.`,
        },
      ];
    }

    return [];
  });
}

export function getAcknowledgedPolicyDriftAgentIds(events: PolicyRolloutEvent[]) {
  return new Set(
    events
      .filter((event) => (event.type ?? "").toLowerCase() === "policy_drift_acknowledgement")
      .map((event) => event.agent_id)
      .filter((agentId): agentId is string => typeof agentId === "string" && agentId.trim().length > 0)
  );
}

export function filterPolicyDriftAlertsByAcknowledgement(
  alerts: PolicyDriftAlert[],
  acknowledgedAgentIds: Set<string>,
  status: PolicyAcknowledgementStatus
) {
  if (status === "all") return alerts;
  return alerts.filter((alert) => {
    const acknowledged = acknowledgedAgentIds.has(alert.agent.id);
    return status === "acknowledged" ? acknowledged : !acknowledged;
  });
}

function csvCell(value: unknown) {
  const raw = value == null ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export function buildStaleAgentCsv(alerts: PolicyDriftAlert[], currentPolicyVersion: string) {
  const headers = [
    "agent_id",
    "name",
    "runtime",
    "status",
    "alert_label",
    "severity",
    "current_policy_version",
    "reported_policy_version",
    "cache_source",
    "age_seconds",
    "ttl_seconds",
    "reason",
  ];
  const rows = alerts.map((alert) => {
    const cache = alert.agent.runtime_policy_cache;
    return [
      alert.agent.id,
      alert.agent.name ?? "",
      alert.agent.runtime ?? "",
      alert.agent.status ?? "",
      alert.label,
      alert.severity,
      currentPolicyVersion,
      cache?.policy_version ?? "",
      cache?.source ?? "missing",
      cache?.age_seconds ?? "",
      cache?.ttl_seconds ?? "",
      alert.reason,
    ];
  });
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function buildReconnectReminderText(alerts: PolicyDriftAlert[], currentPolicyVersion: string) {
  if (alerts.length === 0) return "No agents currently need reconnect or policy cache review.";
  const lines = alerts.map((alert, index) => {
    const cache = alert.agent.runtime_policy_cache;
    const label = alert.agent.name ?? alert.agent.id;
    const reported = cache?.policy_version ?? "not reported";
    return `${index + 1}. ${label} (${alert.agent.runtime ?? "unknown"}) - ${alert.reason} Current policy: ${currentPolicyVersion}. Reported policy: ${reported}.`;
  });
  return [
    "AIDR policy rollout reminder",
    `Current policy: ${currentPolicyVersion}`,
    "Please reconnect or refresh the following agents so they enforce the latest runtime policy before tool calls run:",
    ...lines,
    "Open AIDR > Policy Rollout for the current cache state and acknowledgement history.",
  ].join("\n");
}
