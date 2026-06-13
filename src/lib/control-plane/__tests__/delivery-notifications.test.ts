import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyOverdueDeliveryFailures, type DeliveryNotificationDb } from "../delivery-notifications";

class FakeDeliveryNotificationDb implements DeliveryNotificationDb {
  readonly writes: Array<{ path: string; data: Record<string, unknown> }> = [];
  private readonly docs = new Map<string, Record<string, unknown>>();
  private readonly collections = new Map<string, Array<{ id: string; data: Record<string, unknown> }>>();
  private nextId = 0;

  constructor(settings: Record<string, unknown>) {
    this.docs.set("users/user_1/settings/current", settings);
    this.collections.set("users/user_1/delivery_failures", [
      {
        id: "overdue",
        data: {
          channel: "security_export",
          event_type: "security.events",
          subject: "evt_critical",
          status: "retry_pending",
          reason: "http_503",
          owner: { user_id: "user_1" },
          sla: { due_at: "2026-05-06T11:00:00.000Z" },
        },
      },
      {
        id: "future",
        data: {
          status: "retry_pending",
          sla: { due_at: "2026-05-06T13:00:00.000Z" },
        },
      },
      {
        id: "closed",
        data: {
          status: "closed",
          sla: { due_at: "2026-05-06T10:00:00.000Z" },
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

describe("notifyOverdueDeliveryFailures", () => {
  beforeEach(() => {
    delete process.env.AIDR_EXPORT_WEBHOOK_SECRET;
  });

  it("sends signed overdue case notifications and records evidence", async () => {
    process.env.AIDR_EXPORT_WEBHOOK_SECRET = "notify-secret";
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const db = new FakeDeliveryNotificationDb({
      security_export: { enabled: true, webhook_url: "https://hooks.example/aidr" },
    });

    const result = await notifyOverdueDeliveryFailures({
      uid: "user_1",
      db,
      fetchImpl,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ scanned: 3, notified: 1, delivered: 1, failed: 0 });
    const [, init] = fetchImpl.mock.calls[0];
    const body = String(init.body);
    expect(init.headers["x-aidr-event"]).toBe("delivery.failure_overdue");
    expect(init.headers["x-aidr-signature"]).toBe(
      `sha256=${createHmac("sha256", "notify-secret").update(body, "utf8").digest("hex")}`,
    );
    expect(JSON.parse(body)).toMatchObject({
      type: "delivery.failure_overdue",
      count: 1,
      cases: [{ failure_id: "overdue", owner_user_id: "user_1" }],
    });
    expect(db.writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "users/user_1/delivery_failures/overdue",
          data: expect.objectContaining({
            overdue_notification: expect.objectContaining({
              status: "delivered",
              destination_origin: "https://hooks.example",
            }),
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            type: "delivery_failure_overdue_notification",
            payload: expect.objectContaining({
              overdue_count: 1,
              delivered: 1,
              cases: ["overdue"],
            }),
          }),
        }),
      ]),
    );
  });

  it("records skipped evidence when routing is not configured", async () => {
    const fetchImpl = vi.fn();
    const db = new FakeDeliveryNotificationDb({
      security_export: { enabled: false, webhook_url: "" },
    });

    const result = await notifyOverdueDeliveryFailures({
      uid: "user_1",
      db,
      fetchImpl,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ notified: 1, delivered: 0, skipped: 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(db.writes[0]).toMatchObject({
      path: "users/user_1/delivery_failures/overdue",
      data: {
        overdue_notification: expect.objectContaining({
          status: "skipped",
          reason: "webhook_not_configured",
        }),
      },
    });
  });

  it("records skipped evidence when delivery failure routing is disabled", async () => {
    const fetchImpl = vi.fn();
    const db = new FakeDeliveryNotificationDb({
      security_export: {
        enabled: true,
        webhook_url: "https://hooks.example/aidr",
        route_delivery_failures: false,
      },
    });

    const result = await notifyOverdueDeliveryFailures({
      uid: "user_1",
      db,
      fetchImpl,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ notified: 1, delivered: 0, skipped: 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(db.writes[0]).toMatchObject({
      path: "users/user_1/delivery_failures/overdue",
      data: {
        overdue_notification: expect.objectContaining({
          status: "skipped",
          destination_origin: null,
          destination_origins: [],
          reason: "route_disabled",
        }),
      },
    });
  });

  it("sends overdue notifications to multiple routed destinations", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const db = new FakeDeliveryNotificationDb({
      security_export: {
        enabled: true,
        webhook_url: "https://hooks.example/aidr",
        destinations: [
          {
            id: "soc",
            name: "SOC",
            enabled: true,
            webhook_url: "https://soc.example/aidr",
            route_delivery_failures: true,
          },
        ],
      },
    });

    const result = await notifyOverdueDeliveryFailures({
      uid: "user_1",
      db,
      fetchImpl,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ notified: 1, delivered: 2, skipped: 0, failed: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1].body))).toMatchObject({
      destination_id: "soc",
      destination_name: "SOC",
      count: 1,
    });
    expect(db.writes[0]).toMatchObject({
      path: "users/user_1/delivery_failures/overdue",
      data: {
        overdue_notification: expect.objectContaining({
          status: "delivered",
          destination_origin: "https://hooks.example",
          destination_origins: ["https://hooks.example", "https://soc.example"],
        }),
      },
    });
  });
});
