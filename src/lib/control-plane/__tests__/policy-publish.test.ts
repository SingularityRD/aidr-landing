import { beforeEach, describe, expect, it } from "vitest";
import { buildRuntimePolicyAsCode } from "@/lib/policy-settings";
import {
  approvePolicyPublishRequest,
  createPolicyPublishRequest,
  publishRuntimePolicy,
  type PolicyPublishDb,
} from "../policy-publish";

class FakePolicyPublishDb implements PolicyPublishDb {
  readonly writes: Array<{ path: string; data: Record<string, unknown>; merge?: boolean }> = [];
  private readonly docs = new Map<string, Record<string, unknown>>();
  private nextId = 0;

  constructor() {
    this.docs.set("users/user_1/settings/current", {
      runtime_policy: {
        command_default: "ask",
        file_default: "ask",
        url_default: "ask",
        package_default: "ask",
        output_default: "allow",
        mcp_unknown: "ask",
        mcp_risky: "deny",
        mcp_allow_servers: ["github"],
        mcp_require_approval_servers: [],
        mcp_deny_servers: [],
      },
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
            this.writes.push({ path: fullPath, data, merge: options?.merge });
            this.docs.set(fullPath, options?.merge ? { ...(this.docs.get(fullPath) ?? {}), ...data } : data);
          },
        };
      },
    };
  }
}

describe("publishRuntimePolicy", () => {
  beforeEach(() => {
    process.env.AIDR_POLICY_SIGNING_SECRET = "policy-signing-secret";
  });

  it("publishes imported policy-as-code with diff evidence and signed version", async () => {
    const db = new FakePolicyPublishDb();
    const result = await publishRuntimePolicy({
      uid: "user_1",
      actorUserId: "user_1",
      db,
      policyAsCode: buildRuntimePolicyAsCode({
        command_default: "deny",
        file_default: "ask",
        url_default: "ask",
        package_default: "deny",
        output_default: "allow",
        mcp_unknown: "ask",
        mcp_risky: "deny",
        mcp_allow_servers: ["github", "filesystem"],
        mcp_require_approval_servers: [],
        mcp_deny_servers: [],
      }),
      approvalNote: "Ship locked down defaults.",
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      ok: true,
      policy_version: "pol_20260506120000",
      policy_hash: expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
      policy_signature: expect.stringMatching(/^hmac-sha256=[a-f0-9]{64}$/),
      diff_count: 3,
    });
    expect(db.writes[0]).toMatchObject({
      path: "users/user_1/settings/current",
      merge: true,
      data: {
        runtime_policy_version: "pol_20260506120000",
        runtime_policy_published_by: "user_1",
      },
    });
    expect(db.writes[1]).toMatchObject({
      path: "users/user_1/events/generated_1",
      data: {
        type: "runtime_policy_publish",
        payload: {
          approval_note: "Ship locked down defaults.",
          diff_count: 3,
          diff: expect.arrayContaining([
            { field: "command_default", before: "ask", after: "deny" },
            { field: "package_default", before: "ask", after: "deny" },
          ]),
        },
      },
    });
  });

  it("rejects invalid policy-as-code before writes", async () => {
    const db = new FakePolicyPublishDb();
    await expect(
      publishRuntimePolicy({
        uid: "user_1",
        actorUserId: "user_1",
        db,
        policyAsCode: { schema_version: "aidr.policy.v0" },
      }),
    ).rejects.toThrow("invalid_policy_as_code");
    expect(db.writes).toEqual([]);
  });

  it("creates a two-person publish request with signed approver identity", async () => {
    const db = new FakePolicyPublishDb();
    const result = await createPolicyPublishRequest({
      uid: "user_1",
      actorUserId: "user_1",
      db,
      policyAsCode: buildRuntimePolicyAsCode({ command_default: "deny" }),
      reviewerUserIds: ["user_2", "user_2", ""],
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      ok: true,
      status: "pending_approval",
      request_id: "generated_1",
      required_approvals: 2,
      approvals: 1,
    });
    expect(db.writes[0]).toMatchObject({
      path: "users/user_1/policy_publish_requests/generated_1",
      data: {
        status: "pending_approval",
        required_approvals: 2,
        reviewer_user_ids: ["user_2"],
        expires_at: "2026-05-07T12:00:00.000Z",
        approvals: [
          {
            user_id: "user_1",
            signature: expect.stringMatching(/^hmac-sha256=[a-f0-9]{64}$/),
          },
        ],
      },
    });
    expect(db.writes[1]).toMatchObject({
      path: "users/user_1/events/generated_2",
      data: { type: "runtime_policy_publish_request" },
    });
  });

  it("requires a different approver before publishing a pending request", async () => {
    const db = new FakePolicyPublishDb();
    await createPolicyPublishRequest({
      uid: "user_1",
      actorUserId: "user_1",
      db,
      policyAsCode: buildRuntimePolicyAsCode({ command_default: "deny" }),
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    await expect(
      approvePolicyPublishRequest({
        uid: "user_1",
        actorUserId: "user_1",
        requestId: "generated_1",
        db,
        now: new Date("2026-05-06T12:05:00.000Z"),
      }),
    ).rejects.toThrow("policy_publish_self_approval_rejected");

    const result = await approvePolicyPublishRequest({
      uid: "user_1",
      actorUserId: "user_2",
      requestId: "generated_1",
      db,
      now: new Date("2026-05-06T12:05:00.000Z"),
    });

    expect(result).toMatchObject({
      ok: true,
      status: "published",
      request_id: "generated_1",
      approvals: 2,
      policy_version: "pol_20260506120000",
    });
    expect(db.writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "users/user_1/settings/current",
          data: expect.objectContaining({
            runtime_policy_version: "pol_20260506120000",
            runtime_policy_published_by: "user_2",
          }),
        }),
        expect.objectContaining({
          path: "users/user_1/events/generated_3",
          data: expect.objectContaining({
            type: "runtime_policy_publish",
            payload: expect.objectContaining({
              approvals: 2,
              required_approvals: 2,
            }),
          }),
        }),
      ]),
    );
  });

  it("rejects expired publish requests before approval", async () => {
    const db = new FakePolicyPublishDb();
    await createPolicyPublishRequest({
      uid: "user_1",
      actorUserId: "user_1",
      db,
      policyAsCode: buildRuntimePolicyAsCode({ command_default: "deny" }),
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    await expect(
      approvePolicyPublishRequest({
        uid: "user_1",
        actorUserId: "user_2",
        requestId: "generated_1",
        db,
        now: new Date("2026-05-08T12:00:00.000Z"),
      }),
    ).rejects.toThrow("policy_publish_request_expired");
  });

  it("rejects approvals from users outside the reviewer assignment", async () => {
    const db = new FakePolicyPublishDb();
    await createPolicyPublishRequest({
      uid: "user_1",
      actorUserId: "user_1",
      db,
      policyAsCode: buildRuntimePolicyAsCode({ command_default: "deny" }),
      reviewerUserIds: ["user_3"],
      now: new Date("2026-05-06T12:00:00.000Z"),
    });

    await expect(
      approvePolicyPublishRequest({
        uid: "user_1",
        actorUserId: "user_2",
        requestId: "generated_1",
        db,
        now: new Date("2026-05-06T13:00:00.000Z"),
      }),
    ).rejects.toThrow("policy_publish_reviewer_not_assigned");
  });
});
