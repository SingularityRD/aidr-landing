import { FieldValue } from "firebase-admin/firestore";

type DeliveryEvidenceDocRef = {
  id?: string;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
};

export type DeliveryEvidenceDb = {
  collection(path: string): {
    doc(id?: string): DeliveryEvidenceDocRef;
  };
};

export type DeliveryEvidenceInput = {
  uid: string;
  db: DeliveryEvidenceDb;
  channel: "security_export" | "policy_rollout";
  eventType: string;
  subject: string;
  destination?: string | null;
  reason: string;
  attempt?: number;
  maxAttempts?: number;
  now?: Date;
};

function destinationOrigin(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function deliveryBackoffSeconds(attempt: number, baseSeconds = 60, maxSeconds = 3600) {
  const normalized = Math.max(1, Math.floor(attempt));
  return Math.min(maxSeconds, baseSeconds * 2 ** (normalized - 1));
}

export async function recordDeliveryFailure(input: DeliveryEvidenceInput) {
  const attempt = Math.max(1, Math.floor(input.attempt ?? 1));
  const maxAttempts = Math.max(1, Math.floor(input.maxAttempts ?? 5));
  const now = input.now ?? new Date();
  const deadLetter = attempt >= maxAttempts;
  const backoffSeconds = deliveryBackoffSeconds(attempt);
  const nextRetryAt = deadLetter ? null : new Date(now.getTime() + backoffSeconds * 1000).toISOString();
  const deadLetterAt = deadLetter ? now.toISOString() : null;
  const ref = input.db.collection(`users/${input.uid}/delivery_failures`).doc();
  const evidenceId = ref.id ?? `delivery_failure_${now.getTime()}`;

  const evidence = {
    id: evidenceId,
    channel: input.channel,
    event_type: input.eventType,
    subject: input.subject,
    status: deadLetter ? "dead_letter" : "retry_pending",
    reason: input.reason,
    destination_origin: destinationOrigin(input.destination),
    retry: {
      strategy: "exponential_backoff",
      attempt,
      max_attempts: maxAttempts,
      backoff_seconds: deadLetter ? null : backoffSeconds,
      next_retry_at: nextRetryAt,
      dead_letter_at: deadLetterAt,
    },
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  await ref.set(evidence);
  return evidence;
}
