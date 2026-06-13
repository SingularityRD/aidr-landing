import { describe, expect, it } from "vitest";
import {
  acknowledgePolicyDrift,
  buildPolicyDriftAcknowledgementEvent,
  normalizePolicyDriftAction,
  sanitizePolicyCacheForAcknowledgement,
} from "../policy-drift";

class FakePolicyDriftDb {
  readonly writes: Array<{ path: string; data: Record<string, unknown>; merge?: boolean }> = [];
  private readonly docs = new Map<string, Record<string, unknown>>();
  private nextId = 0;

  constructor() {
    this.docs.set("users/user_1/agents/agent_1", { name: "Claude Code" });
  }

  collection(path: string) {
    return {
      doc: (id?: string) => {
        const docId = id ?? `generated_${++this.nextId}`;
        const fullPath = `${path}/${docId}`;
        return {
          get: async () => ({
            exists: this.docs.has(fullPath),
            data: () => this.docs.get(fullPath),
          }),
          set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
            this.writes.push({ path: fullPath, data, merge: options?.merge });
            const existing = this.docs.get(fullPath) ?? {};
            this.docs.set(fullPath, options?.merge ? { ...existing, ...data } : data);
          },
        };
      },
    };
  }
}

describe("policy drift acknowledgement", () => {
  it("normalizes unsupported actions to a safe reviewed action", () => {
    expect(normalizePolicyDriftAction("reconnect_requested")).toBe("reconnect_requested");
    expect(normalizePolicyDriftAction("delete_agent")).toBe("mark_reviewed");
  });

  it("sanitizes policy cache metadata without preserving unrelated payload fields", () => {
    expect(
      sanitizePolicyCacheForAcknowledgement({
        source: "valid",
        usable: true,
        policy_version: "pol_1",
        cached_at: "2026-05-06T10:00:00.000Z",
        expires_at: "2026-05-06T10:01:00.000Z",
        age_seconds: 10,
        ttl_seconds: 50,
        token: "aidr_secret",
        path: "C:/Users/anil/.singularity-aidr/runtime-policy-cache.json",
      })
    ).toEqual({
      source: "valid",
      usable: true,
      policy_version: "pol_1",
      cached_at: "2026-05-06T10:00:00.000Z",
      expires_at: "2026-05-06T10:01:00.000Z",
      age_seconds: 10,
      ttl_seconds: 50,
    });
  });

  it("builds a flight-recorder event for admin remediation", () => {
    const event = buildPolicyDriftAcknowledgementEvent({
      uid: "user_1",
      agentId: "agent_1",
      actorUserId: "user_1",
      action: "reconnect_requested",
      currentPolicyVersion: "pol_current",
      alertLabel: "stale",
      reason: "Policy cache is stale.",
      requestId: "req_1",
      runtimePolicyCache: {
        source: "expired",
        usable: false,
        policy_version: "pol_previous",
        age_seconds: 900,
        ttl_seconds: 0,
      },
    });

    expect(event).toMatchObject({
      agent_id: "agent_1",
      type: "policy_drift_acknowledgement",
      verdict: "allow",
      severity: "warning",
      request_id: "req_1",
      payload: {
        category: "policy_rollout",
        artifact: "agent_1",
        action: "reconnect_requested",
        actor_user_id: "user_1",
        current_policy_version: "pol_current",
        alert_label: "stale",
        reason: "Policy cache is stale.",
        runtime_policy_cache: {
          source: "expired",
          usable: false,
          policy_version: "pol_previous",
        },
      },
    });
  });

  it("writes an event and agent acknowledgement metadata", async () => {
    const db = new FakePolicyDriftDb();

    await acknowledgePolicyDrift({
      db,
      uid: "user_1",
      agentId: "agent_1",
      actorUserId: "user_1",
      action: "mark_reviewed",
      currentPolicyVersion: "pol_current",
      alertLabel: "stale",
      reason: "Reviewed stale cache.",
      runtimePolicyCache: { source: "expired", usable: false },
    });

    expect(db.writes.map((write) => write.path)).toEqual([
      "users/user_1/events/generated_1",
      "users/user_1/agents/agent_1",
    ]);
    expect(db.writes[0]?.data).toMatchObject({
      type: "policy_drift_acknowledgement",
      agent_id: "agent_1",
      payload: {
        action: "mark_reviewed",
        current_policy_version: "pol_current",
      },
    });
    expect(db.writes[1]?.merge).toBe(true);
    expect(db.writes[1]?.data.policy_drift_acknowledgement).toMatchObject({
      action: "mark_reviewed",
      actor_user_id: "user_1",
      current_policy_version: "pol_current",
    });
  });

  it("rejects acknowledgement for agents outside the account", async () => {
    await expect(
      acknowledgePolicyDrift({
        db: new FakePolicyDriftDb(),
        uid: "user_1",
        agentId: "agent_missing",
        actorUserId: "user_1",
        action: "mark_reviewed",
        currentPolicyVersion: "pol_current",
      })
    ).rejects.toThrow("agent_not_found");
  });
});
