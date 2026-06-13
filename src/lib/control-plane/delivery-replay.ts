import { FieldValue } from "firebase-admin/firestore";
import { deliveryBackoffSeconds } from "./delivery-evidence";
import { exportSecurityEvents, type ExportableEvent } from "./event-export";
import { deliverPolicyRolloutReminder } from "./policy-rollout-delivery";

type FirestoreSnapshot = {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
};

type FirestoreDocRef = {
  id?: string;
  get(): Promise<FirestoreSnapshot>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
};

type FirestoreCollectionRef = {
  doc(id?: string): FirestoreDocRef;
  get(): Promise<{ docs: Array<{ id: string; data(): Record<string, unknown> }> }>;
};

export type DeliveryReplayDb = {
  collection(path: string): FirestoreCollectionRef;
};

export type DeliveryReplayResult = {
  ok: true;
  failure_id: string;
  channel: string;
  status: "replay_delivered" | "replay_skipped" | "retry_pending" | "dead_letter";
  attempted: number;
  delivered: number;
  skipped: number;
  failed: number;
  replay_event_id: string;
};

export type DeliveryRetryWorkerResult = {
  ok: true;
  scanned: number;
  replayed: number;
  delivered: number;
  skipped: number;
  failed: number;
  results: DeliveryReplayResult[];
};

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function getNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function subjectTokens(subject: unknown) {
  return getString(subject)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeExportableEvent(id: string, data: Record<string, unknown>): ExportableEvent {
  return {
    event_id: getString(data.event_id, id),
    agent_id: getString(data.agent_id, "unknown"),
    type: getString(data.type, "security_event"),
    verdict: getString(data.verdict, "allow"),
    severity: getString(data.severity, "info"),
    request_id: getString(data.request_id, id),
    payload: getRecord(data.payload),
  };
}

async function getReplayableSecurityEvents(input: {
  uid: string;
  subject: unknown;
  db: DeliveryReplayDb;
}) {
  const wanted = new Set(subjectTokens(input.subject));
  if (wanted.size === 0) return [];

  const snap = await input.db.collection(`users/${input.uid}/events`).get();
  return snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter((doc) => {
      const eventId = getString(doc.data.event_id, doc.id);
      const requestId = getString(doc.data.request_id);
      return wanted.has(doc.id) || wanted.has(eventId) || wanted.has(requestId);
    })
    .map((doc) => normalizeExportableEvent(doc.id, doc.data));
}

function nextFailureState(input: {
  delivered: number;
  failed: number;
  skipped: number;
  attempt: number;
  maxAttempts: number;
  now: Date;
  existingDeadLetterAt?: unknown;
}) {
  if (input.delivered > 0 && input.failed === 0) {
    return {
      status: "replay_delivered" as const,
      retry: {
        strategy: "manual",
        attempt: input.attempt,
        max_attempts: input.maxAttempts,
        backoff_seconds: null,
        next_retry_at: null,
        dead_letter_at: null,
      },
    };
  }

  if (input.failed === 0 && input.skipped > 0) {
    return {
      status: "replay_skipped" as const,
      retry: {
        strategy: "manual",
        attempt: input.attempt,
        max_attempts: input.maxAttempts,
        backoff_seconds: null,
        next_retry_at: null,
        dead_letter_at: getNullableString(input.existingDeadLetterAt),
      },
    };
  }

  const deadLetter = input.attempt >= input.maxAttempts;
  const backoffSeconds = deadLetter ? null : deliveryBackoffSeconds(input.attempt);
  return {
    status: deadLetter ? ("dead_letter" as const) : ("retry_pending" as const),
    retry: {
      strategy: "exponential_backoff",
      attempt: input.attempt,
      max_attempts: input.maxAttempts,
      backoff_seconds: backoffSeconds,
      next_retry_at: backoffSeconds ? new Date(input.now.getTime() + backoffSeconds * 1000).toISOString() : null,
      dead_letter_at: deadLetter ? input.now.toISOString() : getNullableString(input.existingDeadLetterAt),
    },
  };
}

export async function replayDeliveryFailure(input: {
  uid: string;
  actorUserId: string;
  failureId: string;
  db: DeliveryReplayDb;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<DeliveryReplayResult> {
  const failureId = input.failureId.trim();
  if (!failureId) throw new Error("missing_delivery_failure_id");

  const failureRef = input.db.collection(`users/${input.uid}/delivery_failures`).doc(failureId);
  const snap = await failureRef.get();
  if (!snap.exists) throw new Error("missing_delivery_failure");

  const failure = snap.data() ?? {};
  const channel = getString(failure.channel);
  const retry = getRecord(failure.retry);
  const attempt = getNumber(retry.attempt, 1) + 1;
  const maxAttempts = getNumber(retry.max_attempts, 5);
  const now = input.now ?? new Date();

  let attempted = 0;
  let delivered = 0;
  let skipped = 0;
  let failed = 0;
  let replaySubject = getString(failure.subject, failureId);

  if (channel === "policy_rollout") {
    const result = await deliverPolicyRolloutReminder({
      uid: input.uid,
      actorUserId: input.actorUserId,
      db: input.db,
      fetchImpl: input.fetchImpl,
      now,
      recordFailure: false,
      failureAttempt: attempt,
    });
    attempted = result.attempted;
    delivered = result.delivered;
    skipped = result.skipped;
    failed = result.failed;
    replaySubject = result.event_id;
  } else if (channel === "security_export") {
    const events = await getReplayableSecurityEvents({ uid: input.uid, subject: failure.subject, db: input.db });
    if (events.length === 0) {
      skipped = 1;
    } else {
      const result = await exportSecurityEvents({
        uid: input.uid,
        db: input.db,
        events,
        fetchImpl: input.fetchImpl,
        now,
        recordFailure: false,
        failureAttempt: attempt,
      });
      attempted = result.attempted;
      delivered = result.delivered;
      skipped = result.skipped;
      failed = result.failed;
    }
  } else {
    throw new Error("unsupported_delivery_channel");
  }

  const next = nextFailureState({
    delivered,
    failed,
    skipped,
    attempt,
    maxAttempts,
    now,
    existingDeadLetterAt: retry.dead_letter_at,
  });

  await failureRef.set(
    {
      status: next.status,
      retry: next.retry,
      last_replay_at: now.toISOString(),
      manual_replay: {
        requested_at: now.toISOString(),
        requested_by: input.actorUserId,
        replay_subject: replaySubject,
        result: { attempted, delivered, skipped, failed },
      },
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const eventRef = input.db.collection(`users/${input.uid}/events`).doc();
  const replayEventId = eventRef.id ?? `delivery_replay_${now.getTime()}`;
  await eventRef.set({
    event_id: replayEventId,
    agent_id: null,
    type: "delivery_failure_replay",
    verdict: failed > 0 ? "ask" : "allow",
    severity: failed > 0 ? "warning" : "info",
    payload: {
      category: "delivery_failure",
      artifact: "manual_replay",
      actor_user_id: input.actorUserId,
      failure_id: failureId,
      channel,
      previous_status: getString(failure.status, "unknown"),
      next_status: next.status,
      replay_subject: replaySubject,
      delivery: { attempted, delivered, skipped, failed },
    },
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    failure_id: failureId,
    channel,
    status: next.status,
    attempted,
    delivered,
    skipped,
    failed,
    replay_event_id: replayEventId,
  };
}

function isDueRetryFailure(doc: { id: string; data: Record<string, unknown> }, now: Date) {
  if (doc.data.status !== "retry_pending") return false;
  const retry = getRecord(doc.data.retry);
  const nextRetryAt = getNullableString(retry.next_retry_at);
  if (!nextRetryAt) return true;
  const nextTime = Date.parse(nextRetryAt);
  if (!Number.isFinite(nextTime)) return true;
  return nextTime <= now.getTime();
}

export async function processDueDeliveryFailures(input: {
  uid: string;
  actorUserId?: string;
  db: DeliveryReplayDb;
  fetchImpl?: typeof fetch;
  now?: Date;
  limit?: number;
}): Promise<DeliveryRetryWorkerResult> {
  const now = input.now ?? new Date();
  const max = Math.max(1, Math.min(50, Math.floor(input.limit ?? 10)));
  const snap = await input.db.collection(`users/${input.uid}/delivery_failures`).get();
  const due = snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter((doc) => isDueRetryFailure(doc, now))
    .sort((a, b) => {
      const aRetry = getNullableString(getRecord(a.data.retry).next_retry_at) ?? "";
      const bRetry = getNullableString(getRecord(b.data.retry).next_retry_at) ?? "";
      return aRetry.localeCompare(bRetry);
    })
    .slice(0, max);

  const results: DeliveryReplayResult[] = [];
  for (const failure of due) {
    const result = await replayDeliveryFailure({
      uid: input.uid,
      actorUserId: input.actorUserId ?? "system:delivery-retry-worker",
      failureId: failure.id,
      db: input.db,
      fetchImpl: input.fetchImpl,
      now,
    });
    results.push(result);
  }

  return {
    ok: true,
    scanned: snap.docs.length,
    replayed: results.length,
    delivered: results.reduce((sum, result) => sum + result.delivered, 0),
    skipped: results.reduce((sum, result) => sum + result.skipped, 0),
    failed: results.reduce((sum, result) => sum + result.failed, 0),
    results,
  };
}
