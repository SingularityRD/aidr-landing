import { FieldValue } from "firebase-admin/firestore";

type FirestoreSnapshot = {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
};

type FirestoreDocRef = {
  id?: string;
  get(): Promise<FirestoreSnapshot>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
};

export type DeliveryCaseDb = {
  collection(path: string): {
    doc(id?: string): FirestoreDocRef;
  };
};

export type DeliveryCaseAction = "assign" | "close" | "reopen";

export type DeliveryCaseResult = {
  ok: true;
  failure_id: string;
  action: DeliveryCaseAction;
  status: string;
  event_id: string;
};

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeAction(value: unknown): DeliveryCaseAction {
  if (value === "assign" || value === "close" || value === "reopen") return value;
  throw new Error("invalid_delivery_case_action");
}

function normalizeReopenStatus(value: unknown, existingStatus: unknown) {
  if (value === "retry_pending" || value === "dead_letter") return value;
  if (existingStatus === "dead_letter") return "dead_letter";
  return "retry_pending";
}

function defaultSlaDueAt(now: Date) {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export async function updateDeliveryFailureCase(input: {
  uid: string;
  actorUserId: string;
  failureId: string;
  action: unknown;
  db: DeliveryCaseDb;
  reason?: unknown;
  nextStatus?: unknown;
  slaDueAt?: unknown;
  now?: Date;
}): Promise<DeliveryCaseResult> {
  const failureId = input.failureId.trim();
  if (!failureId) throw new Error("missing_delivery_failure_id");

  const action = normalizeAction(input.action);
  const now = input.now ?? new Date();
  const failureRef = input.db.collection(`users/${input.uid}/delivery_failures`).doc(failureId);
  const snap = await failureRef.get();
  if (!snap.exists) throw new Error("missing_delivery_failure");

  const existing = snap.data() ?? {};
  const update: Record<string, unknown> = {
    case_updated_at: now.toISOString(),
    case_updated_by: input.actorUserId,
    updated_at: FieldValue.serverTimestamp(),
  };
  let status = getString(existing.status, "retry_pending");

  if (action === "assign") {
    update.owner = {
      user_id: input.actorUserId,
      assigned_at: now.toISOString(),
    };
    update.sla = {
      due_at: getString(input.slaDueAt) || getString(existing.sla_due_at) || defaultSlaDueAt(now),
    };
  }

  if (action === "close") {
    status = "closed";
    update.status = status;
    update.closed_at = now.toISOString();
    update.closed_by = input.actorUserId;
    update.close_reason = getString(input.reason, "Closed after operator review.");
  }

  if (action === "reopen") {
    status = normalizeReopenStatus(input.nextStatus, existing.status);
    update.status = status;
    update.reopened_at = now.toISOString();
    update.reopened_by = input.actorUserId;
    update.closed_at = null;
    update.closed_by = null;
    update.close_reason = null;
  }

  await failureRef.set(update, { merge: true });

  const eventRef = input.db.collection(`users/${input.uid}/events`).doc();
  const eventId = eventRef.id ?? `delivery_case_${now.getTime()}`;
  await eventRef.set({
    event_id: eventId,
    agent_id: null,
    type: "delivery_failure_case_update",
    verdict: "allow",
    severity: action === "close" ? "info" : "warning",
    payload: {
      category: "delivery_failure",
      artifact: "case_management",
      actor_user_id: input.actorUserId,
      failure_id: failureId,
      action,
      previous_status: getString(existing.status, "unknown"),
      next_status: status,
      reason: action === "close" ? update.close_reason : null,
      sla_due_at: action === "assign" ? (update.sla as { due_at: string }).due_at : null,
    },
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return { ok: true, failure_id: failureId, action, status, event_id: eventId };
}
