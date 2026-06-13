import { isPolicyDriftAcknowledgement } from "./event-classification";

export type IncidentEvent = {
  id: string;
  created_at?: string | null;
  agent_id?: string | null;
  type?: string | null;
  verdict?: string | null;
  severity?: string | null;
  payload?: Record<string, unknown> | null;
};

export type IncidentTimelineItem = {
  id: string;
  root_cause: string;
  agent_id: string;
  type: string;
  artifact: string;
  highest_severity: "critical" | "warning" | "info";
  dominant_verdict: "deny" | "ask" | "allow";
  first_seen_at: string | null;
  last_seen_at: string | null;
  event_count: number;
  events: IncidentEvent[];
  recommended_actions: string[];
};

const severityRank: Record<IncidentTimelineItem["highest_severity"], number> = {
  info: 1,
  warning: 2,
  critical: 3,
};

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 180);
}

function getSeverity(value: unknown): IncidentTimelineItem["highest_severity"] {
  const severity = getString(value, "info").toLowerCase();
  if (severity === "critical") return "critical";
  if (severity === "warning" || severity === "warn" || severity === "high") return "warning";
  return "info";
}

function getVerdict(value: unknown): IncidentTimelineItem["dominant_verdict"] {
  const verdict = getString(value, "allow").toLowerCase();
  if (verdict === "deny") return "deny";
  if (verdict === "ask") return "ask";
  return "allow";
}

function getPayloadString(payload: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === "string" && item.trim());
      if (typeof first === "string") return first.trim();
    }
  }
  return null;
}

function inferType(event: IncidentEvent): string {
  if (isPolicyDriftAcknowledgement(event)) return "policy_rollout";
  return (
    getPayloadString(event.payload, ["category", "tool_name", "toolName", "type"]) ??
    getString(event.type, "event")
  );
}

function inferArtifact(event: IncidentEvent): string {
  if (isPolicyDriftAcknowledgement(event)) {
    return getPayloadString(event.payload, ["artifact", "agent_id", "agentId"]) ?? getString(event.agent_id, "unknown-agent");
  }
  return (
    getPayloadString(event.payload, ["artifact", "artifacts", "command", "url", "file_path", "path"]) ??
    getString(event.type, "event")
  );
}

function eventTime(event: IncidentEvent): number {
  const time = Date.parse(event.created_at ?? "");
  return Number.isFinite(time) ? time : 0;
}

function rootCauseKey(event: IncidentEvent): string {
  const agentId = getString(event.agent_id, "unknown-agent");
  const type = normalizeText(inferType(event));
  const artifact = normalizeText(inferArtifact(event));
  return `${agentId}:${type}:${artifact}`;
}

function recommendedActions(item: Omit<IncidentTimelineItem, "recommended_actions">): string[] {
  if (item.type === "policy_rollout") {
    return ["Keep acknowledgement evidence", "Confirm agent refresh", "Review related policy events"];
  }
  if (item.dominant_verdict === "deny") {
    return ["Keep policy strict", "Review affected agent", "Inspect payload", "Add allow rule only if expected"];
  }
  if (item.dominant_verdict === "ask") {
    return ["Confirm business intent", "Approve once if expected", "Tighten policy if repeated"];
  }
  if (item.highest_severity === "critical") {
    return ["Inspect payload", "Check agent history", "Escalate if repeated"];
  }
  return ["Review context", "Monitor for recurrence"];
}

export function buildIncidentTimeline(events: IncidentEvent[]): IncidentTimelineItem[] {
  const groups = new Map<string, IncidentEvent[]>();
  for (const event of events) {
    const verdict = getVerdict(event.verdict);
    const severity = getSeverity(event.severity);
    if (verdict === "allow" && severity === "info" && !isPolicyDriftAcknowledgement(event)) continue;
    const key = rootCauseKey(event);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  const timeline: IncidentTimelineItem[] = [];
  for (const [key, groupEvents] of groups.entries()) {
    const sorted = [...groupEvents].sort((a, b) => eventTime(a) - eventTime(b));
    const latest = sorted[sorted.length - 1] ?? sorted[0];
    const agentId = getString(latest?.agent_id, "unknown-agent");
    const type = inferType(latest ?? groupEvents[0]);
    const artifact = inferArtifact(latest ?? groupEvents[0]);
    const highestSeverity = sorted.reduce<IncidentTimelineItem["highest_severity"]>((current, event) => {
      const next = getSeverity(event.severity);
      return severityRank[next] > severityRank[current] ? next : current;
    }, "info");
    const denyCount = sorted.filter((event) => getVerdict(event.verdict) === "deny").length;
    const askCount = sorted.filter((event) => getVerdict(event.verdict) === "ask").length;
    const dominantVerdict: IncidentTimelineItem["dominant_verdict"] =
      denyCount > 0 ? "deny" : askCount > 0 ? "ask" : "allow";
    const itemWithoutActions = {
      id: key,
      root_cause: `${type} on ${artifact}`.slice(0, 220),
      agent_id: agentId,
      type,
      artifact,
      highest_severity: highestSeverity,
      dominant_verdict: dominantVerdict,
      first_seen_at: sorted[0]?.created_at ?? null,
      last_seen_at: latest?.created_at ?? null,
      event_count: sorted.length,
      events: sorted,
    };
    timeline.push({
      ...itemWithoutActions,
      recommended_actions: recommendedActions(itemWithoutActions),
    });
  }

  return timeline.sort((a, b) => {
    const severityDiff = severityRank[b.highest_severity] - severityRank[a.highest_severity];
    if (severityDiff !== 0) return severityDiff;
    const countDiff = b.event_count - a.event_count;
    if (countDiff !== 0) return countDiff;
    return Date.parse(b.last_seen_at ?? "") - Date.parse(a.last_seen_at ?? "");
  });
}
