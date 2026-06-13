import { describe, expect, it } from "vitest";
import { updateDeliveryFailureCase, type DeliveryCaseDb } from "../delivery-case";

class FakeDeliveryCaseDb implements DeliveryCaseDb {
  readonly writes: Array<{ path: string; data: Record<string, unknown> }> = [];
  private readonly docs = new Map<string, Record<string, unknown>>();
  private nextId = 0;

  constructor() {
    this.docs.set("users/user_1/delivery_failures/failure_1", {
      status: "retry_pending",
      reason: "http_502",
    });
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
    };
  }
}

describe("updateDeliveryFailureCase", () => {
  it("assigns a failure with owner and SLA evidence", async () => {
    const db = new FakeDeliveryCaseDb();

    const result = await updateDeliveryFailureCase({
      uid: "user_1",
      actorUserId: "user_1",
      failureId: "failure_1",
      action: "assign",
      db,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ ok: true, action: "assign", status: "retry_pending" });
    expect(db.writes[0]).toMatchObject({
      path: "users/user_1/delivery_failures/failure_1",
      data: {
        owner: { user_id: "user_1", assigned_at: "2026-05-06T12:00:00.000Z" },
        sla: { due_at: "2026-05-07T12:00:00.000Z" },
      },
    });
    expect(db.writes[1]).toMatchObject({
      path: "users/user_1/events/generated_1",
      data: {
        type: "delivery_failure_case_update",
        payload: {
          action: "assign",
          failure_id: "failure_1",
          sla_due_at: "2026-05-07T12:00:00.000Z",
        },
      },
    });
  });

  it("closes and reopens delivery failure cases", async () => {
    const db = new FakeDeliveryCaseDb();

    const closed = await updateDeliveryFailureCase({
      uid: "user_1",
      actorUserId: "user_1",
      failureId: "failure_1",
      action: "close",
      reason: "Receiver fixed and replay delivered.",
      db,
      now: new Date("2026-05-06T12:00:00.000Z"),
    });
    const reopened = await updateDeliveryFailureCase({
      uid: "user_1",
      actorUserId: "user_1",
      failureId: "failure_1",
      action: "reopen",
      nextStatus: "dead_letter",
      db,
      now: new Date("2026-05-06T13:00:00.000Z"),
    });

    expect(closed.status).toBe("closed");
    expect(reopened.status).toBe("dead_letter");
    expect(db.writes.find((write) => write.path === "users/user_1/delivery_failures/failure_1" && write.data.status === "closed")?.data).toMatchObject({
      closed_by: "user_1",
      close_reason: "Receiver fixed and replay delivered.",
    });
    expect(db.writes.find((write) => write.path === "users/user_1/delivery_failures/failure_1" && write.data.status === "dead_letter")?.data).toMatchObject({
      reopened_by: "user_1",
      closed_at: null,
    });
  });
});
