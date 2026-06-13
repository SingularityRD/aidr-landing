export type EventLike = {
  type?: string | null;
  verdict?: string | null;
  severity?: string | null;
  payload?: Record<string, unknown> | null;
};

export type EventClass = "security" | "remediation" | "telemetry";

function getString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function isPolicyDriftAcknowledgement(event: EventLike) {
  return getString(event.type).toLowerCase() === "policy_drift_acknowledgement";
}

export function classifyEvent(event: EventLike): EventClass {
  if (isPolicyDriftAcknowledgement(event)) return "remediation";
  const verdict = getString(event.verdict, "allow").toLowerCase();
  const severity = getString(event.severity, "info").toLowerCase();
  if (verdict === "deny" || verdict === "ask" || severity === "critical" || severity === "warning") {
    return "security";
  }
  return "telemetry";
}

export function eventDisplayTitle(event: EventLike) {
  if (isPolicyDriftAcknowledgement(event)) {
    const action = getString(event.payload?.action, "reviewed").replace(/_/g, " ");
    return `Policy drift ${action}`;
  }
  return getString(event.type, "event");
}

export function eventDisplaySummary(event: EventLike) {
  if (isPolicyDriftAcknowledgement(event)) {
    return getString(event.payload?.remediation || event.payload?.reason, "Policy drift remediation recorded.");
  }
  return getString(event.payload?.reason, "");
}
