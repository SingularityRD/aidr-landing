export type DeliveryFailureRow = {
  id: string;
  channel?: string | null;
  event_type?: string | null;
  subject?: string | null;
  status?: string | null;
  reason?: string | null;
  destination_origin?: string | null;
  owner?: {
    user_id?: string | null;
    assigned_at?: string | null;
  } | null;
  sla?: {
    due_at?: string | null;
  } | null;
  closed_at?: string | null;
  close_reason?: string | null;
  retry?: {
    strategy?: string | null;
    attempt?: number | null;
    max_attempts?: number | null;
    backoff_seconds?: number | null;
    next_retry_at?: string | null;
    dead_letter_at?: string | null;
  } | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export function deliveryFailureStats(failures: DeliveryFailureRow[]) {
  return {
    total: failures.length,
    retryPending: failures.filter((failure) => failure.status === "retry_pending").length,
    deadLetter: failures.filter((failure) => failure.status === "dead_letter").length,
    replayDelivered: failures.filter((failure) => failure.status === "replay_delivered").length,
    replaySkipped: failures.filter((failure) => failure.status === "replay_skipped").length,
    closed: failures.filter((failure) => failure.status === "closed").length,
    overdue: failures.filter((failure) => deliveryFailureSlaState(failure).state === "overdue").length,
    securityExport: failures.filter((failure) => failure.channel === "security_export").length,
    policyRollout: failures.filter((failure) => failure.channel === "policy_rollout").length,
  };
}

export function deliveryFailureTone(status?: string | null) {
  if (status === "closed") return { label: "closed", color: "#22c55e", background: "rgba(34,197,94,0.12)" };
  if (status === "replay_delivered") return { label: "replay delivered", color: "#22c55e", background: "rgba(34,197,94,0.12)" };
  if (status === "replay_skipped") return { label: "replay skipped", color: "#38bdf8", background: "rgba(56,189,248,0.12)" };
  if (status === "dead_letter") return { label: "dead-letter", color: "#ef4444", background: "rgba(239,68,68,0.12)" };
  if (status === "retry_pending") return { label: "retry pending", color: "#eab308", background: "rgba(234,179,8,0.12)" };
  return { label: "unknown", color: "var(--text-secondary)", background: "rgba(148,163,184,0.12)" };
}

export function deliveryFailureSlaState(failure: DeliveryFailureRow, now = new Date()) {
  if (failure.status === "closed") return { state: "closed" as const, label: "closed" };
  const dueAt = failure.sla?.due_at;
  if (!dueAt) return { state: "unassigned" as const, label: "unassigned" };
  const dueTime = Date.parse(dueAt);
  if (!Number.isFinite(dueTime)) return { state: "invalid" as const, label: "invalid SLA" };
  const minutes = Math.round((dueTime - now.getTime()) / 60000);
  if (minutes < 0) return { state: "overdue" as const, label: "SLA overdue" };
  if (minutes <= 120) return { state: "due_soon" as const, label: "SLA due soon" };
  return { state: "healthy" as const, label: "SLA active" };
}

export function filterDeliveryFailures(
  failures: DeliveryFailureRow[],
  status: "all" | "retry_pending" | "dead_letter" | "closed"
) {
  if (status === "all") return failures;
  return failures.filter((failure) => failure.status === status);
}

export function replayHrefForDeliveryFailure(failure: DeliveryFailureRow) {
  if (failure.channel === "policy_rollout") return "/policy-rollout";
  return "/settings#security-export";
}
