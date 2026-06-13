import { createHmac } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import {
  getSecurityExportDestinations,
  getSecurityExportSkipReason,
  type SecurityExportDestination,
} from "./security-export-settings";

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

export type DeliveryNotificationDb = {
  collection(path: string): FirestoreCollectionRef;
};

export type DeliveryNotificationResult = {
  ok: true;
  scanned: number;
  notified: number;
  delivered: number;
  skipped: number;
  failed: number;
  event_id: string;
};

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function signBody(body: string, secret: string): string | null {
  const clean = secret.trim();
  if (!clean) return null;
  return `sha256=${createHmac("sha256", clean).update(body, "utf8").digest("hex")}`;
}

function destinationOrigin(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function shouldNotifyOverdueFailure(data: Record<string, unknown>, now: Date) {
  if (data.status === "closed") return false;
  const sla = getRecord(data.sla);
  const dueAt = getString(sla.due_at);
  if (!dueAt) return false;
  const dueTime = Date.parse(dueAt);
  if (!Number.isFinite(dueTime) || dueTime > now.getTime()) return false;

  const overdueNotification = getRecord(data.overdue_notification);
  const lastSentAt = getString(overdueNotification.last_sent_at);
  if (!lastSentAt) return true;
  const lastSentTime = Date.parse(lastSentAt);
  if (!Number.isFinite(lastSentTime)) return true;
  return now.getTime() - lastSentTime >= 24 * 60 * 60 * 1000;
}

export async function notifyOverdueDeliveryFailures(input: {
  uid: string;
  actorUserId?: string;
  db: DeliveryNotificationDb;
  fetchImpl?: typeof fetch;
  now?: Date;
  limit?: number;
}): Promise<DeliveryNotificationResult> {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(50, Math.floor(input.limit ?? 10)));
  const [settingsSnap, failuresSnap] = await Promise.all([
    input.db.collection(`users/${input.uid}/settings`).doc("current").get(),
    input.db.collection(`users/${input.uid}/delivery_failures`).get(),
  ]);
  const securityExportSettings = settingsSnap.exists ? settingsSnap.data()?.security_export : null;
  const destinations = getSecurityExportDestinations(securityExportSettings, "delivery_failures");
  const overdue = failuresSnap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter((doc) => shouldNotifyOverdueFailure(doc.data, now))
    .slice(0, limit);

  let delivered = 0;
  let failed = 0;
  let skipped = 0;
  let reason: string | null = null;
  let attemptedDestinations: SecurityExportDestination[] = [];

  if (overdue.length === 0) {
    skipped = 0;
  } else if (destinations.length === 0) {
    skipped = overdue.length;
    reason = getSecurityExportSkipReason(securityExportSettings, "delivery_failures");
  } else {
    attemptedDestinations = destinations;
    for (const destination of destinations) {
      const body = JSON.stringify({
        source: "aidr",
        type: "delivery.failure_overdue",
        uid: input.uid,
        sent_at: now.toISOString(),
        destination_id: destination.id,
        destination_name: destination.name,
        count: overdue.length,
        cases: overdue.map((failure) => ({
          failure_id: failure.id,
          channel: failure.data.channel ?? null,
          event_type: failure.data.event_type ?? null,
          subject: failure.data.subject ?? null,
          status: failure.data.status ?? null,
          reason: failure.data.reason ?? null,
          destination_origin: failure.data.destination_origin ?? null,
          owner_user_id: getString(getRecord(failure.data.owner).user_id) || null,
          sla_due_at: getString(getRecord(failure.data.sla).due_at) || null,
        })),
      });
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "user-agent": "aidr-delivery-notifications/1.0",
        "x-aidr-event": "delivery.failure_overdue",
      };
      const signature = signBody(body, process.env.AIDR_EXPORT_WEBHOOK_SECRET ?? "");
      if (signature) headers["x-aidr-signature"] = signature;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      try {
        const response = await (input.fetchImpl ?? fetch)(destination.webhookUrl, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
        });
        if (response.ok) delivered += overdue.length;
        else {
          failed += overdue.length;
          reason = `http_${response.status || "error"}`;
        }
      } catch {
        failed += overdue.length;
        reason = "network_error";
      } finally {
        clearTimeout(timer);
      }
    }
  }

  const destinationOrigins = attemptedDestinations
    .map((destination) => destinationOrigin(destination.webhookUrl))
    .filter((origin): origin is string => Boolean(origin));

  await Promise.all(
    overdue.map((failure) =>
      input.db.collection(`users/${input.uid}/delivery_failures`).doc(failure.id).set(
        {
          overdue_notification: {
            status: failed > 0 ? "failed" : delivered > 0 ? "delivered" : "skipped",
            last_sent_at: now.toISOString(),
            destination_origin: destinationOrigins[0] ?? null,
            destination_origins: destinationOrigins,
            reason,
          },
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
    ),
  );

  const eventRef = input.db.collection(`users/${input.uid}/events`).doc();
  const eventId = eventRef.id ?? `delivery_overdue_${now.getTime()}`;
  await eventRef.set({
    event_id: eventId,
    agent_id: null,
    type: "delivery_failure_overdue_notification",
    verdict: failed > 0 ? "ask" : "allow",
    severity: failed > 0 ? "warning" : overdue.length > 0 ? "info" : "debug",
    payload: {
      category: "delivery_failure",
      artifact: "overdue_notification",
      actor_user_id: input.actorUserId ?? "system:delivery-case-notifier",
      overdue_count: overdue.length,
      delivered,
      skipped,
      failed,
      reason,
      destinations: attemptedDestinations.map((destination) => ({
        id: destination.id,
        name: destination.name,
        origin: destinationOrigin(destination.webhookUrl),
      })),
      cases: overdue.map((failure) => failure.id),
    },
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    scanned: failuresSnap.docs.length,
    notified: overdue.length,
    delivered,
    skipped,
    failed,
    event_id: eventId,
  };
}
