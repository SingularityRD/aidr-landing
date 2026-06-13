import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyIncidentCaseEscalations, type IncidentNotificationDb } from "../incident-notifications";

class FakeIncidentNotificationDb implements IncidentNotificationDb {
  readonly writes: Array<{ path: string; data: Record<string, unknown> }> = [];
  private readonly docs = new Map<string, Record<string, unknown>>();
  private readonly collections = new Map<string, Array<{ id: string; data: Record<string, unknown> }>>();
  private nextId = 0;

  constructor(settings: Record<string, unknown>) {
    this.docs.set("users/user_1/settings/current", settings);
    this.collections.set("users/user_1/incident_cases", [
      {
        id: "assigned_overdue",
        data: {
          incident_id: "assigned_overdue",
          agent_id: "aidr_ag_1",
          root_cause: "mcp_tool_call on filesystem",
          status: "assigned",
          owner_id: "user_1",
          owner_email: "dev@example.com",
          owner_name: "Dev Admin",
          case_updated_at: "2026-05-05T10:00:00.000Z",
        },
      },
      {
        id: "snooze_expired",
        data: {
          incident_id: "snooze_expired",
          agent_id: "aidr_ag_2",
          root_cause: "network_egress on paste.example",
          status: "snoozed",
          owner_id: "user_1",
          snoozed_until: "2026-05-06T11:00:00.000Z",
          case_updated_at: "2026-05-06T10:00:00.000Z",
        },
      },
      {
        id: "fresh",
        data: {
          status: "assigned",
          case_updated_at: "2026-05-06T11:30:00.000Z",
        },
      },
      {
        id: "resolved",
        data: {
          status: "resolved",
          case_updated_at: "2026-05-04T11:30:00.000Z",
        },
      },
    ]);
  }

  collection(path: string) {
    return {
      doc: (id?: string) => {
        const docId = id ?? `generated_${++this.nextId}`;
        const fullPath = `${path}/${docId}`;
        return {
          id: docId,
          get: async () => ({
            exists: this.docs.has(fullPath),
            data: () => this.docs.get(fullPath),
          }),
          set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
            this.writes.push({ path: fullPath, data });
            this.docs.set(fullPath, options?.merge ? { ...(this.docs.get(fullPath) ?? {}), ...data } : data);
          },
        };
      },
      get: async () => ({
        docs: (this.collections.get(path) ?? []).map((item) => ({
          id: item.id,
          data: () => item.data,
        })),
      }),
    };
  }
}

describe("notifyIncidentCaseEscalations", () => {
  beforeEach(() => {
    delete process.env.AIDR_EXPORT_WEBHOOK_SECRET;
  });

  it("sends signed incident case escalation notifications and records evidence", async () => {
    process.env.AIDR_EXPORT_WEBHOOK_SECRET = "notify-secret";
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const db = new FakeIncidentNotificationDb({
      security_export: { enabled: true, webhook_url: "https://hooks.example/aidr" },
    });

    const result = await notifyIncidentCaseEscalations({
      uid: "user_1",
      db,
      fetchImpl,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ scanned: 4, notified: 2, delivered: 2, failed: 0 });
    const [, init] = fetchImpl.mock.calls[0];
    const body = String(init.body);
    expect(init.headers["x-aidr-event"]).toBe("incident.case_escalation");
    expect(init.headers["x-aidr-signature"]).toBe(
      `sha256=${createHmac("sha256", "notify-secret").update(body, "utf8").digest("hex")}`,
    );
    expect(JSON.parse(body)).toMatchObject({
      type: "incident.case_escalation",
      count: 2,
      cases: [
        { incident_id: "assigned_overdue", reason: "assigned_sla_overdue", owner_email: "dev@example.com", owner_name: "Dev Admin" },
        { incident_id: "snooze_expired", reason: "snooze_expired" },
      ],
    });
    expect(db.writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "users/user_1/incident_cases/assigned_overdue",
          data: expect.objectContaining({
            escalation_notification: expect.objectContaining({
              status: "delivered",
              destination_origin: "https://hooks.example",
            }),
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            type: "incident_case_escalation_notification",
            payload: expect.objectContaining({
              escalation_count: 2,
              delivered: 2,
              cases: [
                { incident_id: "assigned_overdue", reason: "assigned_sla_overdue" },
                { incident_id: "snooze_expired", reason: "snooze_expired" },
              ],
            }),
          }),
        }),
      ]),
    );
  });

  it("records skipped evidence when routing is not configured", async () => {
    const fetchImpl = vi.fn();
    const db = new FakeIncidentNotificationDb({
      security_export: { enabled: false, webhook_url: "" },
    });

    const result = await notifyIncidentCaseEscalations({
      uid: "user_1",
      db,
      fetchImpl,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ notified: 2, delivered: 0, skipped: 2 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(db.writes[0]).toMatchObject({
      path: "users/user_1/incident_cases/assigned_overdue",
      data: {
        escalation_notification: expect.objectContaining({
          status: "skipped",
          reason: "webhook_not_configured",
        }),
      },
    });
  });

  it("records skipped evidence when incident case routing is disabled", async () => {
    const fetchImpl = vi.fn();
    const db = new FakeIncidentNotificationDb({
      security_export: {
        enabled: true,
        webhook_url: "https://hooks.example/aidr",
        route_incident_cases: false,
      },
    });

    const result = await notifyIncidentCaseEscalations({
      uid: "user_1",
      db,
      fetchImpl,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ notified: 2, delivered: 0, skipped: 2 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(db.writes[0]).toMatchObject({
      path: "users/user_1/incident_cases/assigned_overdue",
      data: {
        escalation_notification: expect.objectContaining({
          status: "skipped",
          destination_origin: null,
          destination_origins: [],
          reason: "route_disabled",
        }),
      },
    });
  });

  it("sends incident escalations to multiple routed destinations", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const db = new FakeIncidentNotificationDb({
      security_export: {
        enabled: true,
        webhook_url: "https://hooks.example/aidr",
        destinations: [
          {
            id: "soc",
            name: "SOC",
            enabled: true,
            webhook_url: "https://soc.example/aidr",
            route_incident_cases: true,
          },
        ],
      },
    });

    const result = await notifyIncidentCaseEscalations({
      uid: "user_1",
      db,
      fetchImpl,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ notified: 2, delivered: 4, skipped: 0, failed: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1].body))).toMatchObject({
      destination_id: "soc",
      destination_name: "SOC",
      count: 2,
    });
    expect(db.writes[0]).toMatchObject({
      path: "users/user_1/incident_cases/assigned_overdue",
      data: {
        escalation_notification: expect.objectContaining({
          status: "delivered",
          destination_origin: "https://hooks.example",
          destination_origins: ["https://hooks.example", "https://soc.example"],
        }),
      },
    });
  });
});
