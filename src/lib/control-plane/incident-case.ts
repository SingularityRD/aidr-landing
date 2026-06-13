import { FieldValue } from "firebase-admin/firestore";
import {
  incidentCaseDocId,
  incidentCaseActionLabel,
  nextIncidentCaseState,
  normalizeIncidentCaseAction,
} from "@/lib/incident-case";

type FirestoreDocRef = {
  id?: string;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
};

export type IncidentCaseDb = {
  collection(path: string): {
    doc(id?: string): FirestoreDocRef;
  };
};

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export async function updateIncidentCase(input: {
  uid: string;
  actorUserId: string;
  actorEmail?: unknown;
  actorName?: unknown;
  ownerUserId?: unknown;
  ownerEmail?: unknown;
  ownerName?: unknown;
  incidentId: unknown;
  action: unknown;
  db: IncidentCaseDb;
  agentId?: unknown;
  rootCause?: unknown;
  reason?: unknown;
  now?: Date;
}) {
  const rawIncidentId = getString(input.incidentId).trim();
  const incidentId = incidentCaseDocId(rawIncidentId);
  if (!incidentId) throw new Error("missing_incident_id");

  const action = normalizeIncidentCaseAction(input.action);
  const state = nextIncidentCaseState({
    action,
    actorUserId: input.actorUserId,
    actorEmail: getString(input.actorEmail) || null,
    actorName: getString(input.actorName) || null,
    ownerUserId: getString(input.ownerUserId) || null,
    ownerEmail: getString(input.ownerEmail) || null,
    ownerName: getString(input.ownerName) || null,
    now: input.now,
  });
  const agentId = getString(input.agentId, "unknown-agent");
  const rootCause = getString(input.rootCause, incidentId);
  const reason = getString(input.reason);

  await input.db.collection(`users/${input.uid}/incident_cases`).doc(incidentId).set(
    {
      incident_id: incidentId,
      raw_incident_id: rawIncidentId,
      agent_id: agentId,
      root_cause: rootCause,
      status: state.status,
      owner_id: state.owner_id ?? null,
      owner_email: state.owner_email ?? null,
      owner_name: state.owner_name ?? null,
      owner: state.owner_id
        ? {
            user_id: state.owner_id,
            email: state.owner_email ?? null,
            name: state.owner_name ?? null,
            assigned_at: state.updated_at,
          }
        : null,
      snoozed_until: state.snoozed_until ?? null,
      reason: reason || null,
      updated_at: FieldValue.serverTimestamp(),
      case_updated_at: state.updated_at,
      case_updated_by: input.actorUserId,
      assigned_by: action === "assign" ? input.actorUserId : null,
    },
    { merge: true },
  );

  const eventRef = input.db.collection(`users/${input.uid}/events`).doc();
  const eventId = eventRef.id ?? `incident_case_${Date.now()}`;
  await eventRef.set({
    event_id: eventId,
    agent_id: agentId,
    type: "incident_case_update",
    verdict: "allow",
    severity: action === "resolve" ? "info" : "warning",
    payload: {
      category: "incident_case",
      artifact: incidentId,
      actor_user_id: input.actorUserId,
      incident_id: incidentId,
      root_cause: rootCause,
      action,
      status: state.status,
      owner_id: state.owner_id ?? null,
      owner_email: state.owner_email ?? null,
      owner_name: state.owner_name ?? null,
      assigned_by: action === "assign" ? input.actorUserId : null,
      snoozed_until: state.snoozed_until ?? null,
      summary: `Incident ${incidentCaseActionLabel(action)} by operator.`,
      reason: reason || null,
    },
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    incident_id: incidentId,
    action,
    status: state.status,
    owner_id: state.owner_id ?? null,
    owner_email: state.owner_email ?? null,
    owner_name: state.owner_name ?? null,
    assigned_by: action === "assign" ? input.actorUserId : null,
    event_id: eventId,
    snoozed_until: state.snoozed_until ?? null,
  };
}
