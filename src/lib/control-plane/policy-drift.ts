import { FieldValue } from "firebase-admin/firestore";
import { type RuntimePolicyCacheMetadata } from "@/lib/policy-rollout";

export type PolicyDriftAcknowledgementAction = "mark_reviewed" | "reconnect_requested";

export type PolicyDriftAcknowledgementInput = {
  uid: string;
  agentId: string;
  action: PolicyDriftAcknowledgementAction;
  actorUserId: string;
  currentPolicyVersion: string;
  alertLabel?: string | null;
  reason?: string | null;
  runtimePolicyCache?: RuntimePolicyCacheMetadata | null;
  requestId?: string | null;
};

type FirestoreLike = {
  collection(path: string): {
    doc(id?: string): {
      get?(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
      set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
    };
  };
};

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizePolicyDriftAction(value: unknown): PolicyDriftAcknowledgementAction {
  if (value === "reconnect_requested") return "reconnect_requested";
  return "mark_reviewed";
}

export function sanitizePolicyCacheForAcknowledgement(value: unknown): RuntimePolicyCacheMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  return {
    source: getString(input.source, "missing"),
    usable: typeof input.usable === "boolean" ? input.usable : null,
    policy_version: getString(input.policy_version || input.policyVersion) || null,
    cached_at: getString(input.cached_at || input.cachedAt) || null,
    expires_at: getString(input.expires_at || input.expiresAt) || null,
    age_seconds: getNumber(input.age_seconds ?? input.ageSeconds),
    ttl_seconds: getNumber(input.ttl_seconds ?? input.ttlSeconds),
  };
}

export function buildPolicyDriftAcknowledgementEvent(input: PolicyDriftAcknowledgementInput) {
  const action = normalizePolicyDriftAction(input.action);
  const cache = sanitizePolicyCacheForAcknowledgement(input.runtimePolicyCache);
  return {
    agent_id: input.agentId,
    type: "policy_drift_acknowledgement",
    verdict: "allow",
    severity: action === "reconnect_requested" ? "warning" : "info",
    request_id: input.requestId ?? null,
    payload: {
      category: "policy_rollout",
      artifact: input.agentId,
      action,
      actor_user_id: input.actorUserId,
      current_policy_version: input.currentPolicyVersion || "default",
      alert_label: input.alertLabel ?? "unknown",
      reason: input.reason ?? "Policy drift reviewed from settings.",
      runtime_policy_cache: cache,
      remediation:
        action === "reconnect_requested"
          ? "Admin opened reconnect flow for this agent."
          : "Admin marked this policy drift item as reviewed.",
    },
  };
}

export async function acknowledgePolicyDrift(input: PolicyDriftAcknowledgementInput & { db: FirestoreLike }) {
  const agentRef = input.db.collection(`users/${input.uid}/agents`).doc(input.agentId);
  const snap = await agentRef.get?.();
  if (snap && !snap.exists) throw new Error("agent_not_found");

  const event = buildPolicyDriftAcknowledgementEvent(input);
  const acknowledgedAt = new Date().toISOString();
  const eventRef = input.db.collection(`users/${input.uid}/events`).doc();

  await eventRef.set({
    ...event,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  await agentRef.set(
    {
      policy_drift_acknowledgement: {
        action: event.payload.action,
        actor_user_id: input.actorUserId,
        current_policy_version: event.payload.current_policy_version,
        alert_label: event.payload.alert_label,
        reason: event.payload.reason,
        acknowledged_at: acknowledgedAt,
      },
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true as const, event, acknowledged_at: acknowledgedAt };
}
