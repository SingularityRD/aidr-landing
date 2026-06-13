import { describe, expect, it } from "vitest";
import {
  approvalProgress,
  canApprovePolicyRequest,
  policyApprovalState,
  policyApprovalStats,
  type PolicyPublishRequestRow,
} from "../policy-approvals";

describe("policy approval helpers", () => {
  const now = new Date("2026-05-06T12:00:00.000Z");
  const rows: PolicyPublishRequestRow[] = [
    {
      id: "pending",
      status: "pending_approval",
      approvals: [{ user_id: "user_1" }],
      required_approvals: 2,
      expires_at: "2026-05-07T12:00:00.000Z",
    },
    { id: "published", status: "published" },
    { id: "expired", status: "pending_approval", expires_at: "2026-05-05T12:00:00.000Z" },
  ];

  it("summarizes publish request states", () => {
    expect(policyApprovalStats(rows, now)).toEqual({
      total: 3,
      pending: 1,
      published: 1,
      expired: 1,
    });
    expect(policyApprovalState(rows[0], now).label).toBe("pending approval");
    expect(approvalProgress(rows[0])).toBe("1/2");
  });

  it("allows only eligible reviewers to approve", () => {
    expect(canApprovePolicyRequest(rows[0], "user_1", now)).toBe(false);
    expect(canApprovePolicyRequest(rows[0], "user_2", now)).toBe(true);
    expect(canApprovePolicyRequest({ ...rows[0], reviewer_user_ids: ["user_3"] }, "user_2", now)).toBe(false);
    expect(canApprovePolicyRequest(rows[2], "user_2", now)).toBe(false);
  });
});
