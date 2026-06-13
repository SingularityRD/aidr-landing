import { createHmac } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { recordDeliveryFailure } from "./delivery-evidence";
import { getSecurityExportDestinations } from "./security-export-settings";
import {
  buildReconnectReminderText,
  buildStaleAgentCsv,
  currentPolicyVersionFromSettings,
  filterPolicyDriftAlertsByAcknowledgement,
  getAcknowledgedPolicyDriftAgentIds,
  getPolicyDriftAlerts,
  type PolicyAcknowledgementStatus,
  type PolicyRolloutAgent,
  type PolicyRolloutEvent,
} from "@/lib/policy-rollout";

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

export type PolicyRolloutDeliveryDb = {
  collection(path: string): FirestoreCollectionRef;
};

export type PolicyRolloutDeliveryResult = {
  ok: true;
  attempted: number;
  delivered: number;
  skipped: number;
  failed: number;
  agent_count: number;
  event_id: string;
};

function normalizeAckFilter(value: unknown): PolicyAcknowledgementStatus {
  if (value === "acknowledged" || value === "unacknowledged") return value;
  return "all";
}

function signBody(body: string, secret: string): string | null {
  const clean = secret.trim();
  if (!clean) return null;
  return `sha256=${createHmac("sha256", clean).update(body, "utf8").digest("hex")}`;
}

export async function deliverPolicyRolloutReminder(input: {
  uid: string;
  actorUserId: string;
  ackFilter?: unknown;
  db: PolicyRolloutDeliveryDb;
  fetchImpl?: typeof fetch;
  now?: Date;
  recordFailure?: boolean;
  failureAttempt?: number;
}): Promise<PolicyRolloutDeliveryResult> {
  const settingsSnap = await input.db.collection(`users/${input.uid}/settings`).doc("current").get();
  const settings = settingsSnap.exists ? (settingsSnap.data() ?? {}) : {};
  const policyVersion = currentPolicyVersionFromSettings(settings);
  const ackFilter = normalizeAckFilter(input.ackFilter);

  const [agentsSnap, eventsSnap] = await Promise.all([
    input.db.collection(`users/${input.uid}/agents`).get(),
    input.db.collection(`users/${input.uid}/events`).get(),
  ]);
  const agents = agentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as PolicyRolloutAgent[];
  const events = eventsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as PolicyRolloutEvent[];
  const alerts = getPolicyDriftAlerts(agents, policyVersion);
  const acknowledged = getAcknowledgedPolicyDriftAgentIds(events);
  const filteredAlerts = filterPolicyDriftAlertsByAcknowledgement(alerts, acknowledged, ackFilter);
  const csv = buildStaleAgentCsv(filteredAlerts, policyVersion);
  const reminder = buildReconnectReminderText(filteredAlerts, policyVersion);
  const destinations = getSecurityExportDestinations(settings.security_export, "policy_rollout");

  const eventRef = input.db.collection(`users/${input.uid}/events`).doc();
  const eventId = typeof eventRef.id === "string" ? eventRef.id : `policy_rollout_${Date.now()}`;
  const sentAt = (input.now ?? new Date()).toISOString();
  const result: PolicyRolloutDeliveryResult = {
    ok: true,
    attempted: 0,
    delivered: 0,
    skipped: 0,
    failed: 0,
    agent_count: filteredAlerts.length,
    event_id: eventId,
  };

  if (destinations.length === 0 || filteredAlerts.length === 0) {
    result.skipped = filteredAlerts.length;
  } else {
    const fetcher = input.fetchImpl ?? fetch;

    for (const destination of destinations) {
      const body = JSON.stringify({
        source: "aidr",
        type: "policy.rollout_reminder",
        uid: input.uid,
        actor_user_id: input.actorUserId,
        sent_at: sentAt,
        destination_id: destination.id,
        destination_name: destination.name,
        current_policy_version: policyVersion,
        acknowledgement_filter: ackFilter,
        agent_count: filteredAlerts.length,
        reminder,
        csv,
        agents: filteredAlerts.map((alert) => ({
          agent_id: alert.agent.id,
          name: alert.agent.name ?? null,
          runtime: alert.agent.runtime ?? null,
          label: alert.label,
          severity: alert.severity,
          reason: alert.reason,
          policy_version: alert.agent.runtime_policy_cache?.policy_version ?? null,
          cache_source: alert.agent.runtime_policy_cache?.source ?? "missing",
        })),
      });
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "user-agent": "aidr-policy-rollout/1.0",
        "x-aidr-event": "policy.rollout_reminder",
      };
      const signature = signBody(body, process.env.AIDR_EXPORT_WEBHOOK_SECRET ?? "");
      if (signature) headers["x-aidr-signature"] = signature;

      result.attempted += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      try {
        const response = await fetcher(destination.webhookUrl, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
        });
        if (response.ok) result.delivered += 1;
        else {
          result.failed += 1;
          if (input.recordFailure !== false) {
            await recordDeliveryFailure({
              uid: input.uid,
              db: input.db,
              channel: "policy_rollout",
              eventType: "policy.rollout_reminder",
              subject: eventId,
              destination: destination.webhookUrl,
              reason: `http_${response.status || "error"}`,
              now: input.now,
              attempt: input.failureAttempt,
            }).catch(() => {});
          }
        }
      } catch {
        result.failed += 1;
        if (input.recordFailure !== false) {
          await recordDeliveryFailure({
            uid: input.uid,
            db: input.db,
            channel: "policy_rollout",
            eventType: "policy.rollout_reminder",
            subject: eventId,
            destination: destination.webhookUrl,
            reason: "network_error",
            now: input.now,
            attempt: input.failureAttempt,
          }).catch(() => {});
        }
      } finally {
        clearTimeout(timer);
      }
    }
  }

  await eventRef.set({
    event_id: eventId,
    agent_id: null,
    type: "policy_rollout_reminder_delivery",
    verdict: result.failed > 0 ? "ask" : "allow",
    severity: result.failed > 0 ? "warning" : "info",
    payload: {
      category: "policy_rollout",
      artifact: "bulk_reconnect_reminder",
      actor_user_id: input.actorUserId,
      current_policy_version: policyVersion,
      acknowledgement_filter: ackFilter,
      agent_count: filteredAlerts.length,
      delivery: {
        attempted: result.attempted,
        delivered: result.delivered,
        skipped: result.skipped,
        failed: result.failed,
      },
    },
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return result;
}
