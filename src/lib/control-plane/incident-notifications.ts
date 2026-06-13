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

export type IncidentNotificationDb = {
  collection(path: string): FirestoreCollectionRef;
};

export type IncidentNotificationResult = {
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

function recentNotification(data: Record<string, unknown>, now: Date) {
  const escalation = getRecord(data.escalation_notification);
  const lastSentAt = getString(escalation.last_sent_at);
  if (!lastSentAt) return false;
  const lastSentTime = Date.parse(lastSentAt);
  if (!Number.isFinite(lastSentTime)) return false;
  return now.getTime() - lastSentTime < 24 * 60 * 60 * 1000;
}

function ageMs(data: Record<string, unknown>, now: Date) {
  const updatedAt = getString(data.case_updated_at) || getString(data.updated_at);
  const time = Date.parse(updatedAt);
  return Number.isFinite(time) ? now.getTime() - time : 0;
}

function escalationReason(data: Record<string, unknown>, now: Date): string | null {
  if (data.status === "resolved") return null;
  if (recentNotification(data, now)) return null;

  if (data.status === "snoozed") {
    const snoozedUntil = Date.parse(getString(data.snoozed_until));
    if (Number.isFinite(snoozedUntil) && snoozedUntil <= now.getTime()) return "snooze_expired";
    return null;
  }

  if (data.status === "assigned" && ageMs(data, now) >= 24 * 60 * 60 * 1000) {
    return "assigned_sla_overdue";
  }

  if ((data.status === "open" || !data.status) && ageMs(data, now) >= 4 * 60 * 60 * 1000) {
    return "open_unassigned_overdue";
  }

  return null;
}

export async function notifyIncidentCaseEscalations(input: {
  uid: string;
  actorUserId?: string;
  db: IncidentNotificationDb;
  fetchImpl?: typeof fetch;
  now?: Date;
  limit?: number;
}): Promise<IncidentNotificationResult> {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(50, Math.floor(input.limit ?? 10)));
  const [settingsSnap, casesSnap] = await Promise.all([
    input.db.collection(`users/${input.uid}/settings`).doc("current").get(),
    input.db.collection(`users/${input.uid}/incident_cases`).get(),
  ]);
  const securityExportSettings = settingsSnap.exists ? settingsSnap.data()?.security_export : null;
  const destinations = getSecurityExportDestinations(securityExportSettings, "incident_cases");
  const escalations = casesSnap.docs
    .map((doc) => ({ id: doc.id, data: doc.data(), reason: escalationReason(doc.data(), now) }))
    .filter((doc): doc is { id: string; data: Record<string, unknown>; reason: string } => Boolean(doc.reason))
    .slice(0, limit);

  let delivered = 0;
  let failed = 0;
  let skipped = 0;
  let routeReason: string | null = null;
  let attemptedDestinations: SecurityExportDestination[] = [];

  if (escalations.length === 0) {
    skipped = 0;
  } else if (destinations.length === 0) {
    skipped = escalations.length;
    routeReason = getSecurityExportSkipReason(securityExportSettings, "incident_cases");
  } else {
    attemptedDestinations = destinations;
    for (const destination of destinations) {
      const body = JSON.stringify({
        source: "aidr",
        type: "incident.case_escalation",
        uid: input.uid,
        sent_at: now.toISOString(),
        destination_id: destination.id,
        destination_name: destination.name,
        count: escalations.length,
        cases: escalations.map((incident) => ({
          incident_id: incident.id,
          raw_incident_id: incident.data.raw_incident_id ?? null,
          agent_id: incident.data.agent_id ?? null,
          root_cause: incident.data.root_cause ?? null,
          status: incident.data.status ?? "open",
          owner_user_id: incident.data.owner_id ?? null,
          owner_email: incident.data.owner_email ?? null,
          owner_name: incident.data.owner_name ?? null,
          reason: incident.reason,
          snoozed_until: incident.data.snoozed_until ?? null,
          case_updated_at: incident.data.case_updated_at ?? null,
        })),
      });
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "user-agent": "aidr-incident-notifications/1.0",
        "x-aidr-event": "incident.case_escalation",
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
        if (response.ok) delivered += escalations.length;
        else {
          failed += escalations.length;
          routeReason = `http_${response.status || "error"}`;
        }
      } catch {
        failed += escalations.length;
        routeReason = "network_error";
      } finally {
        clearTimeout(timer);
      }
    }
  }

  const destinationOrigins = attemptedDestinations
    .map((destination) => destinationOrigin(destination.webhookUrl))
    .filter((origin): origin is string => Boolean(origin));

  await Promise.all(
    escalations.map((incident) =>
      input.db.collection(`users/${input.uid}/incident_cases`).doc(incident.id).set(
        {
          escalation_notification: {
            status: failed > 0 ? "failed" : delivered > 0 ? "delivered" : "skipped",
            last_sent_at: now.toISOString(),
            destination_origin: destinationOrigins[0] ?? null,
            destination_origins: destinationOrigins,
            reason: routeReason ?? incident.reason,
          },
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
    ),
  );

  const eventRef = input.db.collection(`users/${input.uid}/events`).doc();
  const eventId = eventRef.id ?? `incident_escalation_${now.getTime()}`;
  await eventRef.set({
    event_id: eventId,
    agent_id: null,
    type: "incident_case_escalation_notification",
    verdict: failed > 0 ? "ask" : "allow",
    severity: failed > 0 ? "warning" : escalations.length > 0 ? "info" : "debug",
    payload: {
      category: "incident_case",
      artifact: "case_escalation",
      actor_user_id: input.actorUserId ?? "system:incident-case-notifier",
      escalation_count: escalations.length,
      delivered,
      skipped,
      failed,
      reason: routeReason,
      destinations: attemptedDestinations.map((destination) => ({
        id: destination.id,
        name: destination.name,
        origin: destinationOrigin(destination.webhookUrl),
      })),
      cases: escalations.map((incident) => ({ incident_id: incident.id, reason: incident.reason })),
    },
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    scanned: casesSnap.docs.length,
    notified: escalations.length,
    delivered,
    skipped,
    failed,
    event_id: eventId,
  };
}
