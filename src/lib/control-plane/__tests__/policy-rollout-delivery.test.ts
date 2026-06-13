import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliverPolicyRolloutReminder, type PolicyRolloutDeliveryDb } from "../policy-rollout-delivery";

class FakeRolloutDeliveryDb implements PolicyRolloutDeliveryDb {
  readonly writes: Array<{ path: string; data: Record<string, unknown> }> = [];
  private readonly docs = new Map<string, Record<string, unknown>>();
  private readonly collections = new Map<string, Array<{ id: string; data: Record<string, unknown> }>>();
  private nextId = 0;

  constructor(settings: Record<string, unknown>) {
    this.docs.set("users/user_1/settings/current", settings);
    this.collections.set("users/user_1/agents", [
      {
        id: "agent_stale",
        data: {
          name: "Cursor workspace",
          runtime: "cursor",
          status: "connected",
          runtime_policy_cache: {
            source: "expired",
            usable: false,
            policy_version: "pol_previous",
            age_seconds: 900,
            ttl_seconds: 0,
          },
        },
      },
      {
        id: "agent_fresh",
        data: {
          name: "Claude Code",
          runtime: "claude-code",
          runtime_policy_cache: {
            source: "valid",
            usable: true,
            policy_version: "pol_current",
            age_seconds: 10,
            ttl_seconds: 50,
          },
        },
      },
    ]);
    this.collections.set("users/user_1/events", []);
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
          set: async (data: Record<string, unknown>) => {
            this.writes.push({ path: fullPath, data });
            this.docs.set(fullPath, data);
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

describe("deliverPolicyRolloutReminder", () => {
  beforeEach(() => {
    delete process.env.AIDR_EXPORT_WEBHOOK_SECRET;
  });

  it("delivers a signed rollout reminder and records evidence", async () => {
    process.env.AIDR_EXPORT_WEBHOOK_SECRET = "rollout-secret";
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const db = new FakeRolloutDeliveryDb({
      runtime_policy_version: "pol_current",
      security_export: {
        enabled: true,
        webhook_url: "https://hooks.example/aidr",
      },
    });

    const result = await deliverPolicyRolloutReminder({
      uid: "user_1",
      actorUserId: "user_1",
      db,
      fetchImpl,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      ok: true,
      attempted: 1,
      delivered: 1,
      failed: 0,
      agent_count: 1,
      event_id: "generated_1",
    });
    const [, init] = fetchImpl.mock.calls[0];
    const body = String(init.body);
    const expectedSignature = `sha256=${createHmac("sha256", "rollout-secret").update(body, "utf8").digest("hex")}`;
    expect(init.headers["x-aidr-event"]).toBe("policy.rollout_reminder");
    expect(init.headers["x-aidr-signature"]).toBe(expectedSignature);
    expect(JSON.parse(body)).toMatchObject({
      type: "policy.rollout_reminder",
      current_policy_version: "pol_current",
      agent_count: 1,
      agents: [{ agent_id: "agent_stale", policy_version: "pol_previous" }],
    });
    expect(db.writes[0]).toMatchObject({
      path: "users/user_1/events/generated_1",
      data: {
        type: "policy_rollout_reminder_delivery",
        verdict: "allow",
        severity: "info",
        payload: {
          category: "policy_rollout",
          agent_count: 1,
          delivery: { attempted: 1, delivered: 1, failed: 0 },
        },
      },
    });
  });

  it("records skipped delivery when webhook export is not configured", async () => {
    const fetchImpl = vi.fn();
    const db = new FakeRolloutDeliveryDb({
      runtime_policy_version: "pol_current",
      security_export: { enabled: false, webhook_url: "" },
    });

    const result = await deliverPolicyRolloutReminder({
      uid: "user_1",
      actorUserId: "user_1",
      db,
      fetchImpl,
    });

    expect(result).toMatchObject({ attempted: 0, delivered: 0, skipped: 1, failed: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(db.writes[0]?.data.payload).toMatchObject({
      delivery: { attempted: 0, delivered: 0, skipped: 1, failed: 0 },
    });
  });

  it("skips rollout reminders when that route is disabled", async () => {
    const fetchImpl = vi.fn();
    const db = new FakeRolloutDeliveryDb({
      runtime_policy_version: "pol_current",
      security_export: {
        enabled: true,
        webhook_url: "https://hooks.example/aidr",
        route_policy_rollout: false,
      },
    });

    const result = await deliverPolicyRolloutReminder({
      uid: "user_1",
      actorUserId: "user_1",
      db,
      fetchImpl,
    });

    expect(result).toMatchObject({ attempted: 0, delivered: 0, skipped: 1, failed: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(db.writes[0]?.data.payload).toMatchObject({
      delivery: { attempted: 0, delivered: 0, skipped: 1, failed: 0 },
    });
  });

  it("delivers rollout reminders to multiple routed destinations", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const db = new FakeRolloutDeliveryDb({
      runtime_policy_version: "pol_current",
      security_export: {
        enabled: true,
        webhook_url: "https://hooks.example/aidr",
        destinations: [
          {
            id: "soc",
            name: "SOC",
            enabled: true,
            webhook_url: "https://soc.example/aidr",
            route_policy_rollout: true,
          },
        ],
      },
    });

    const result = await deliverPolicyRolloutReminder({
      uid: "user_1",
      actorUserId: "user_1",
      db,
      fetchImpl,
    });

    expect(result).toMatchObject({ attempted: 2, delivered: 2, skipped: 0, failed: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1].body))).toMatchObject({
      destination_id: "soc",
      destination_name: "SOC",
      agent_count: 1,
    });
    expect(db.writes[0]?.data.payload).toMatchObject({
      delivery: { attempted: 2, delivered: 2, skipped: 0, failed: 0 },
    });
  });

  it("records retry evidence when rollout reminder webhook fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    const db = new FakeRolloutDeliveryDb({
      runtime_policy_version: "pol_current",
      security_export: {
        enabled: true,
        webhook_url: "https://hooks.example/aidr",
      },
    });

    const result = await deliverPolicyRolloutReminder({
      uid: "user_1",
      actorUserId: "user_1",
      db,
      fetchImpl,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ attempted: 1, delivered: 0, failed: 1, agent_count: 1 });
    expect(db.writes[0]).toMatchObject({
      path: "users/user_1/delivery_failures/generated_2",
      data: {
        channel: "policy_rollout",
        event_type: "policy.rollout_reminder",
        status: "retry_pending",
        reason: "http_502",
        retry: {
          attempt: 1,
          next_retry_at: "2026-05-06T12:01:00.000Z",
        },
      },
    });
    expect(db.writes[1]?.data).toMatchObject({
      type: "policy_rollout_reminder_delivery",
      verdict: "ask",
      severity: "warning",
      payload: {
        delivery: { attempted: 1, delivered: 0, failed: 1 },
      },
    });
  });
});
