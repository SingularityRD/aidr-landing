import { describe, expect, it } from "vitest";
import { updateIncidentCase, type IncidentCaseDb } from "../incident-case";

class FakeIncidentCaseDb implements IncidentCaseDb {
  readonly writes: Array<{ path: string; data: Record<string, unknown> }> = [];
  private nextId = 0;

  collection(path: string) {
    return {
      doc: (id?: string) => {
        const docId = id ?? `generated_${++this.nextId}`;
        return {
          id: docId,
          set: async (data: Record<string, unknown>) => {
            this.writes.push({ path: `${path}/${docId}`, data });
          },
        };
      },
    };
  }
}

describe("updateIncidentCase", () => {
  it("assigns incidents and writes case-management evidence", async () => {
    const db = new FakeIncidentCaseDb();

    const result = await updateIncidentCase({
      uid: "user_1",
      actorUserId: "user_1",
      actorEmail: "dev@example.com",
      actorName: "Dev Admin",
      incidentId: "incident:policy_rollout",
      action: "assign",
      agentId: "aidr_ag_cursor",
      rootCause: "policy_rollout on aidr_ag_cursor",
      db,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      ok: true,
      incident_id: "incident:policy_rollout",
      action: "assign",
      status: "assigned",
      event_id: "generated_1",
    });
    expect(db.writes[0]).toMatchObject({
      path: "users/user_1/incident_cases/incident:policy_rollout",
      data: {
        incident_id: "incident:policy_rollout",
        agent_id: "aidr_ag_cursor",
        root_cause: "policy_rollout on aidr_ag_cursor",
        status: "assigned",
        owner_id: "user_1",
        owner_email: "dev@example.com",
        owner_name: "Dev Admin",
        owner: {
          user_id: "user_1",
          email: "dev@example.com",
          name: "Dev Admin",
          assigned_at: "2026-05-06T12:00:00.000Z",
        },
        case_updated_at: "2026-05-06T12:00:00.000Z",
      },
    });
    expect(db.writes[1]).toMatchObject({
      path: "users/user_1/events/generated_1",
      data: {
        type: "incident_case_update",
        payload: {
          category: "incident_case",
          action: "assign",
          status: "assigned",
          owner_email: "dev@example.com",
          owner_name: "Dev Admin",
          summary: "Incident assigned by operator.",
        },
      },
    });
  });

  it("sanitizes incident ids and supports snooze evidence", async () => {
    const db = new FakeIncidentCaseDb();

    const result = await updateIncidentCase({
      uid: "user_1",
      actorUserId: "user_1",
      incidentId: "incident id/with spaces",
      action: "snooze",
      db,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      incident_id: "incident_id_with_spaces",
      status: "snoozed",
      snoozed_until: "2026-05-07T12:00:00.000Z",
    });
    expect(db.writes[0]).toMatchObject({
      path: "users/user_1/incident_cases/incident_id_with_spaces",
      data: {
        snoozed_until: "2026-05-07T12:00:00.000Z",
      },
    });
  });

  it("assigns incidents to a selected team member while preserving actor evidence", async () => {
    const db = new FakeIncidentCaseDb();

    const result = await updateIncidentCase({
      uid: "user_1",
      actorUserId: "user_1",
      actorEmail: "dev@example.com",
      actorName: "Dev Admin",
      ownerUserId: "security_lead",
      ownerEmail: "security@example.com",
      ownerName: "Security Lead",
      incidentId: "incident:mcp_exfiltration",
      action: "assign",
      db,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "assigned",
      owner_id: "security_lead",
      owner_email: "security@example.com",
      owner_name: "Security Lead",
      assigned_by: "user_1",
    });
    expect(db.writes[0]).toMatchObject({
      path: "users/user_1/incident_cases/incident:mcp_exfiltration",
      data: {
        owner_id: "security_lead",
        owner_email: "security@example.com",
        owner_name: "Security Lead",
        owner: {
          user_id: "security_lead",
          email: "security@example.com",
          name: "Security Lead",
          assigned_at: "2026-05-06T12:00:00.000Z",
        },
        case_updated_by: "user_1",
        assigned_by: "user_1",
      },
    });
    expect(db.writes[1]).toMatchObject({
      data: {
        payload: {
          action: "assign",
          owner_id: "security_lead",
          owner_email: "security@example.com",
          owner_name: "Security Lead",
          assigned_by: "user_1",
        },
      },
    });
  });

  it("ignores selected assignees for resolve actions", async () => {
    const db = new FakeIncidentCaseDb();

    const result = await updateIncidentCase({
      uid: "user_1",
      actorUserId: "user_1",
      actorEmail: "dev@example.com",
      actorName: "Dev Admin",
      ownerUserId: "security_lead",
      ownerEmail: "security@example.com",
      ownerName: "Security Lead",
      incidentId: "incident:mcp_exfiltration",
      action: "resolve",
      db,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "resolved",
      owner_id: "user_1",
      owner_email: "dev@example.com",
      owner_name: "Dev Admin",
      assigned_by: null,
    });
    expect(db.writes[0]).toMatchObject({
      data: {
        status: "resolved",
        owner_id: "user_1",
        owner_email: "dev@example.com",
        owner_name: "Dev Admin",
        assigned_by: null,
      },
    });
    expect(db.writes[1]).toMatchObject({
      data: {
        payload: {
          action: "resolve",
          status: "resolved",
          owner_id: "user_1",
          assigned_by: null,
        },
      },
    });
  });
});
