import type { RuntimePolicyDiff } from "./policy-settings";

export type PolicyPublishApproval = {
  user_id?: string | null;
  approved_at?: string | null;
  signature?: string | null;
};

export type PolicyPublishRequestRow = {
  id: string;
  status?: "pending_approval" | "published" | "expired" | string | null;
  policy_version?: string | null;
  policy_hash?: string | null;
  policy_signature?: string | null;
  requested_by?: string | null;
  requested_at?: string | null;
  expires_at?: string | null;
  reviewer_user_ids?: string[] | null;
  approvals?: PolicyPublishApproval[] | null;
  required_approvals?: number | null;
  diff_count?: number | null;
  diff?: RuntimePolicyDiff[] | null;
  approval_note?: string | null;
};

function parseTime(value?: string | null) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function policyApprovalStats(rows: PolicyPublishRequestRow[], now = new Date()) {
  return {
    total: rows.length,
    pending: rows.filter((row) => policyApprovalState(row, now).state === "pending").length,
    published: rows.filter((row) => policyApprovalState(row, now).state === "published").length,
    expired: rows.filter((row) => policyApprovalState(row, now).state === "expired").length,
  };
}

export function policyApprovalState(row: PolicyPublishRequestRow, now = new Date()) {
  if (row.status === "published") return { state: "published" as const, label: "published" };
  const expiresAt = parseTime(row.expires_at);
  if (expiresAt !== null && expiresAt <= now.getTime()) return { state: "expired" as const, label: "expired" };
  return { state: "pending" as const, label: "pending approval" };
}

export function canApprovePolicyRequest(row: PolicyPublishRequestRow, userId: string, now = new Date()) {
  if (!userId) return false;
  if (policyApprovalState(row, now).state !== "pending") return false;
  if (row.approvals?.some((approval) => approval.user_id === userId)) return false;
  const reviewers = row.reviewer_user_ids ?? [];
  return reviewers.length === 0 || reviewers.includes(userId);
}

export function approvalProgress(row: PolicyPublishRequestRow) {
  const approvals = row.approvals?.length ?? 0;
  const required = Math.max(1, Math.floor(row.required_approvals ?? 2));
  return `${approvals}/${required}`;
}
