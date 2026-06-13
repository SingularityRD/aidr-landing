export type IncidentCaseAction = "assign" | "resolve" | "snooze";

export type IncidentCaseStatus = "open" | "assigned" | "resolved" | "snoozed";

export type IncidentCaseState = {
  status: IncidentCaseStatus;
  owner_id?: string | null;
  owner_email?: string | null;
  owner_name?: string | null;
  updated_at?: string | null;
  snoozed_until?: string | null;
};

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function incidentCaseDocId(value: unknown): string {
  return getString(value).trim().replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 120);
}

export function normalizeIncidentCaseAction(value: unknown): IncidentCaseAction {
  if (value === "assign" || value === "resolve" || value === "snooze") return value;
  throw new Error("invalid_incident_case_action");
}

export function normalizeIncidentCaseStatus(value: unknown): IncidentCaseStatus {
  if (value === "assigned" || value === "resolved" || value === "snoozed") return value;
  return "open";
}

export function normalizeIncidentCaseState(value: unknown): IncidentCaseState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    status: normalizeIncidentCaseStatus(raw.status),
    owner_id: typeof raw.owner_id === "string" ? raw.owner_id : null,
    owner_email: typeof raw.owner_email === "string" ? raw.owner_email : null,
    owner_name: typeof raw.owner_name === "string" ? raw.owner_name : null,
    updated_at: typeof raw.case_updated_at === "string"
      ? raw.case_updated_at
      : typeof raw.updated_at === "string"
        ? raw.updated_at
        : null,
    snoozed_until: typeof raw.snoozed_until === "string" ? raw.snoozed_until : null,
  };
}

export function nextIncidentCaseState(input: {
  action: IncidentCaseAction;
  actorUserId: string;
  actorEmail?: string | null;
  actorName?: string | null;
  ownerUserId?: string | null;
  ownerEmail?: string | null;
  ownerName?: string | null;
  now?: Date;
}): IncidentCaseState {
  const now = input.now ?? new Date();
  const updatedAt = now.toISOString();
  const owner = {
    owner_id: input.action === "assign" ? input.ownerUserId || input.actorUserId : input.actorUserId,
    owner_email: input.action === "assign" ? input.ownerEmail ?? input.actorEmail ?? null : input.actorEmail ?? null,
    owner_name: input.action === "assign" ? input.ownerName ?? input.actorName ?? null : input.actorName ?? null,
  };

  if (input.action === "assign") {
    return {
      status: "assigned",
      ...owner,
      updated_at: updatedAt,
    };
  }

  if (input.action === "resolve") {
    return {
      status: "resolved",
      ...owner,
      updated_at: updatedAt,
    };
  }

  return {
    status: "snoozed",
    ...owner,
    updated_at: updatedAt,
    snoozed_until: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function incidentCaseOwnerLabel(state?: IncidentCaseState | null): string {
  if (!state?.owner_id) return "unassigned";
  return state.owner_name || state.owner_email || state.owner_id;
}

export function incidentCaseActionLabel(action: IncidentCaseAction): string {
  if (action === "assign") return "assigned";
  if (action === "resolve") return "resolved";
  return "snoozed";
}
