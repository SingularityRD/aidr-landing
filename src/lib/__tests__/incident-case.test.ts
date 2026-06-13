import { describe, expect, it } from "vitest";
import {
  incidentCaseDocId,
  incidentCaseActionLabel,
  incidentCaseOwnerLabel,
  nextIncidentCaseState,
  normalizeIncidentCaseState,
  normalizeIncidentCaseStatus,
  normalizeIncidentCaseAction,
} from "../incident-case";

describe("incident case helpers", () => {
  const now = new Date("2026-05-06T10:00:00.000Z");

  it("normalizes supported actions and rejects unknown actions", () => {
    expect(normalizeIncidentCaseAction("assign")).toBe("assign");
    expect(normalizeIncidentCaseAction("resolve")).toBe("resolve");
    expect(normalizeIncidentCaseAction("snooze")).toBe("snooze");
    expect(() => normalizeIncidentCaseAction("close")).toThrow("invalid_incident_case_action");
  });

  it("normalizes case ids and persisted state", () => {
    expect(incidentCaseDocId("agent:type:https://paste.example/upload")).toBe("agent:type:https:__paste.example_upload");
    expect(normalizeIncidentCaseStatus("resolved")).toBe("resolved");
    expect(normalizeIncidentCaseStatus("unknown")).toBe("open");
    expect(normalizeIncidentCaseState({
      status: "snoozed",
      owner_id: "user_1",
      owner_email: "dev@example.com",
      owner_name: "Dev Admin",
      case_updated_at: "2026-05-06T10:00:00.000Z",
      snoozed_until: "2026-05-07T10:00:00.000Z",
    })).toEqual({
      status: "snoozed",
      owner_id: "user_1",
      owner_email: "dev@example.com",
      owner_name: "Dev Admin",
      updated_at: "2026-05-06T10:00:00.000Z",
      snoozed_until: "2026-05-07T10:00:00.000Z",
    });
    expect(normalizeIncidentCaseState(null)).toBeNull();
  });

  it("builds deterministic operator case state", () => {
    expect(nextIncidentCaseState({
      action: "assign",
      actorUserId: "user_1",
      actorEmail: "dev@example.com",
      actorName: "Dev Admin",
      now,
    })).toEqual({
      status: "assigned",
      owner_id: "user_1",
      owner_email: "dev@example.com",
      owner_name: "Dev Admin",
      updated_at: "2026-05-06T10:00:00.000Z",
    });
    expect(nextIncidentCaseState({
      action: "assign",
      actorUserId: "user_1",
      actorEmail: "dev@example.com",
      actorName: "Dev Admin",
      ownerUserId: "security_lead",
      ownerEmail: "security@example.com",
      ownerName: "Security Lead",
      now,
    })).toEqual({
      status: "assigned",
      owner_id: "security_lead",
      owner_email: "security@example.com",
      owner_name: "Security Lead",
      updated_at: "2026-05-06T10:00:00.000Z",
    });
    expect(nextIncidentCaseState({
      action: "resolve",
      actorUserId: "user_1",
      ownerUserId: "security_lead",
      now,
    })).toMatchObject({
      status: "resolved",
      owner_id: "user_1",
    });
    expect(nextIncidentCaseState({ action: "snooze", actorUserId: "user_1", now })).toEqual({
      status: "snoozed",
      owner_id: "user_1",
      owner_email: null,
      owner_name: null,
      updated_at: "2026-05-06T10:00:00.000Z",
      snoozed_until: "2026-05-07T10:00:00.000Z",
    });
  });

  it("renders owner labels from profile snapshots", () => {
    expect(incidentCaseOwnerLabel(null)).toBe("unassigned");
    expect(incidentCaseOwnerLabel({ status: "assigned", owner_id: "user_1" })).toBe("user_1");
    expect(incidentCaseOwnerLabel({ status: "assigned", owner_id: "user_1", owner_email: "dev@example.com" })).toBe("dev@example.com");
    expect(incidentCaseOwnerLabel({ status: "assigned", owner_id: "user_1", owner_email: "dev@example.com", owner_name: "Dev Admin" })).toBe("Dev Admin");
  });

  it("renders action labels for audit evidence", () => {
    expect(incidentCaseActionLabel("assign")).toBe("assigned");
    expect(incidentCaseActionLabel("resolve")).toBe("resolved");
    expect(incidentCaseActionLabel("snooze")).toBe("snoozed");
  });
});
