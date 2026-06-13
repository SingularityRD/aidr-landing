import { createHmac } from "node:crypto";
import { recordDeliveryFailure, type DeliveryEvidenceDb } from "./delivery-evidence";
import { getSecurityExportDestinations } from "./security-export-settings";

type FirestoreSnapshot = {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
};

type FirestoreDocRef = {
  get(): Promise<FirestoreSnapshot>;
};

export type EventExportDb = {
  collection(path: string): {
    doc(id: string): FirestoreDocRef;
  };
};

export type ExportableEvent = {
  event_id?: string;
  agent_id: string;
  type: string;
  verdict: string;
  severity: string;
  request_id: string;
  payload: Record<string, unknown>;
};

export type SecurityEventExportResult = {
  attempted: number;
  delivered: number;
  skipped: number;
  failed: number;
};

function isExportable(event: ExportableEvent) {
  return event.verdict === "deny" || event.severity === "critical";
}

function signBody(body: string, secret: string): string | null {
  const clean = secret.trim();
  if (!clean) return null;
  return `sha256=${createHmac("sha256", clean).update(body, "utf8").digest("hex")}`;
}

async function recordSecurityExportFailure(input: {
  uid: string;
  db: EventExportDb;
  webhookUrl: string;
  reason: string;
  events: ExportableEvent[];
  now?: Date;
  attempt?: number;
}) {
  if (input.attempt === 0) return;
  await recordDeliveryFailure({
    uid: input.uid,
    db: input.db as unknown as DeliveryEvidenceDb,
    channel: "security_export",
    eventType: "security.events",
    subject: input.events.map((event) => event.event_id ?? event.request_id).join(",").slice(0, 240),
    destination: input.webhookUrl,
    reason: input.reason,
    now: input.now,
    attempt: input.attempt,
  }).catch(() => {});
}

export async function exportSecurityEvents(input: {
  uid: string;
  events: ExportableEvent[];
  db: EventExportDb;
  fetchImpl?: typeof fetch;
  now?: Date;
  recordFailure?: boolean;
  failureAttempt?: number;
}): Promise<SecurityEventExportResult> {
  const result: SecurityEventExportResult = { attempted: 0, delivered: 0, skipped: 0, failed: 0 };
  const exportable = input.events.filter(isExportable);
  result.skipped = input.events.length - exportable.length;
  if (exportable.length === 0) return result;

  const snap = await input.db.collection(`users/${input.uid}/settings`).doc("current").get();
  const destinations = getSecurityExportDestinations(snap.exists ? snap.data()?.security_export : null, "runtime_events");
  if (destinations.length === 0) {
    result.skipped += exportable.length;
    return result;
  }

  const fetcher = input.fetchImpl ?? fetch;

  for (const destination of destinations) {
    const body = JSON.stringify({
      source: "aidr",
      type: "security.events",
      uid: input.uid,
      sent_at: (input.now ?? new Date()).toISOString(),
      destination_id: destination.id,
      destination_name: destination.name,
      events: exportable.map((event) => ({
        event_id: event.event_id ?? null,
        agent_id: event.agent_id,
        type: event.type,
        verdict: event.verdict,
        severity: event.severity,
        request_id: event.request_id,
        payload: destination.includePayload ? event.payload : null,
      })),
    });

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "user-agent": "aidr-security-export/1.0",
      "x-aidr-event": "security.events",
    };
    const signature = signBody(body, process.env.AIDR_EXPORT_WEBHOOK_SECRET ?? "");
    if (signature) headers["x-aidr-signature"] = signature;

    result.attempted += exportable.length;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);

    try {
      const response = await fetcher(destination.webhookUrl, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      if (response.ok) {
        result.delivered += exportable.length;
      } else {
        result.failed += exportable.length;
        if (input.recordFailure !== false) {
          await recordSecurityExportFailure({
            uid: input.uid,
            db: input.db,
            webhookUrl: destination.webhookUrl,
            reason: `http_${response.status || "error"}`,
            events: exportable,
            now: input.now,
            attempt: input.failureAttempt,
          });
        }
      }
    } catch {
      result.failed += exportable.length;
      if (input.recordFailure !== false) {
        await recordSecurityExportFailure({
          uid: input.uid,
          db: input.db,
          webhookUrl: destination.webhookUrl,
          reason: "network_error",
          events: exportable,
          now: input.now,
          attempt: input.failureAttempt,
        });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return result;
}
