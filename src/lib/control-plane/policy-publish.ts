import { FieldValue } from "firebase-admin/firestore";
import {
  buildRuntimePolicyAsCode,
  diffRuntimePolicySettings,
  importRuntimePolicyAsCode,
  normalizeRuntimePolicySettings,
  type RuntimePolicySettings,
} from "@/lib/policy-settings";
import { runtimePolicyHash, signRuntimePolicyVersion } from "./policy";

type FirestoreSnapshot = {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
};

type FirestoreDocRef = {
  id?: string;
  get(): Promise<FirestoreSnapshot>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
};

export type PolicyPublishDb = {
  collection(path: string): {
    doc(id?: string): FirestoreDocRef;
  };
};

export type PolicyPublishResult = {
  ok: true;
  policy_version: string;
  policy_hash: string;
  policy_signature: string | null;
  diff_count: number;
  event_id: string;
};

export type PolicyPublishApprovalResult =
  | {
      ok: true;
      status: "pending_approval";
      request_id: string;
      policy_version: string;
      policy_hash: string;
      required_approvals: number;
      approvals: number;
      event_id: string;
    }
  | ({
      status: "published";
      request_id: string;
      approvals: number;
    } & PolicyPublishResult);

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getApprovals(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>> : [];
}

function getReviewerIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const reviewers: string[] = [];
  for (const item of value) {
    const id = getString(item).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    reviewers.push(id);
  }
  return reviewers.slice(0, 10);
}

function policyVersionFromDate(now: Date) {
  return `pol_${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

function signApprover(input: {
  userId: string;
  policyVersion: string;
  policyHash: string;
  approvedAt: string;
}) {
  return signRuntimePolicyVersion({
    policyVersion: `${input.policyVersion}.${input.userId}.${input.approvedAt}`,
    policyHash: input.policyHash,
    secret: process.env.AIDR_POLICY_SIGNING_SECRET,
  });
}

function buildApproval(input: {
  userId: string;
  policyVersion: string;
  policyHash: string;
  approvedAt: string;
}) {
  return {
    user_id: input.userId,
    approved_at: input.approvedAt,
    signature: signApprover(input),
  };
}

function buildPolicyPublishArtifacts(input: {
  previousPolicy: RuntimePolicySettings;
  nextPolicy: RuntimePolicySettings;
  now: Date;
}) {
  const diff = diffRuntimePolicySettings(input.previousPolicy, input.nextPolicy);
  const policyVersion = policyVersionFromDate(input.now);
  const policyAsCode = buildRuntimePolicyAsCode(input.nextPolicy);
  const policyHash = runtimePolicyHash(policyAsCode);
  const policySignature = signRuntimePolicyVersion({
    policyVersion,
    policyHash,
    secret: process.env.AIDR_POLICY_SIGNING_SECRET,
  });
  return { diff, policyVersion, policyAsCode, policyHash, policySignature };
}

export async function publishRuntimePolicy(input: {
  uid: string;
  actorUserId: string;
  policyAsCode: unknown;
  approvalNote?: unknown;
  db: PolicyPublishDb;
  now?: Date;
}): Promise<PolicyPublishResult> {
  const imported = importRuntimePolicyAsCode(input.policyAsCode);
  if (!imported.ok) throw new Error(`invalid_policy_as_code:${imported.errors.join("|")}`);

  const now = input.now ?? new Date();
  const settingsRef = input.db.collection(`users/${input.uid}/settings`).doc("current");
  const snap = await settingsRef.get();
  const existing = snap.exists ? (snap.data() ?? {}) : {};
  const previousPolicy = normalizeRuntimePolicySettings(existing.runtime_policy);
  const nextPolicy: RuntimePolicySettings = imported.settings;
  const { diff, policyVersion, policyHash, policySignature } = buildPolicyPublishArtifacts({
    previousPolicy,
    nextPolicy,
    now,
  });

  await settingsRef.set(
    {
      runtime_policy: nextPolicy,
      runtime_policy_version: policyVersion,
      runtime_policy_hash: policyHash,
      runtime_policy_signature: policySignature,
      runtime_policy_published_at: now.toISOString(),
      runtime_policy_published_by: input.actorUserId,
      updated_at: now.toISOString(),
    },
    { merge: true },
  );

  const eventRef = input.db.collection(`users/${input.uid}/events`).doc();
  const eventId = eventRef.id ?? `policy_publish_${now.getTime()}`;
  await eventRef.set({
    event_id: eventId,
    agent_id: null,
    type: "runtime_policy_publish",
    verdict: "allow",
    severity: diff.length > 0 ? "warning" : "info",
    payload: {
      category: "policy_as_code",
      artifact: policyVersion,
      actor_user_id: input.actorUserId,
      approval_note: getString(input.approvalNote, "Approved in dashboard."),
      policy_version: policyVersion,
      policy_hash: policyHash,
      policy_signature: policySignature,
      diff_count: diff.length,
      diff,
    },
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    policy_version: policyVersion,
    policy_hash: policyHash,
    policy_signature: policySignature,
    diff_count: diff.length,
    event_id: eventId,
  };
}

export async function createPolicyPublishRequest(input: {
  uid: string;
  actorUserId: string;
  policyAsCode: unknown;
  approvalNote?: unknown;
  requiredApprovals?: unknown;
  reviewerUserIds?: unknown;
  db: PolicyPublishDb;
  now?: Date;
}): Promise<PolicyPublishApprovalResult> {
  const imported = importRuntimePolicyAsCode(input.policyAsCode);
  if (!imported.ok) throw new Error(`invalid_policy_as_code:${imported.errors.join("|")}`);

  const now = input.now ?? new Date();
  const settingsSnap = await input.db.collection(`users/${input.uid}/settings`).doc("current").get();
  const existing = settingsSnap.exists ? (settingsSnap.data() ?? {}) : {};
  const previousPolicy = normalizeRuntimePolicySettings(existing.runtime_policy);
  const nextPolicy = imported.settings;
  const { diff, policyVersion, policyAsCode, policyHash, policySignature } = buildPolicyPublishArtifacts({
    previousPolicy,
    nextPolicy,
    now,
  });
  const requiredApprovals = Math.max(2, Math.min(5, Math.floor(getNumber(input.requiredApprovals, 2))));
  const approvedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const reviewerUserIds = getReviewerIds(input.reviewerUserIds);
  const approvals = [
    buildApproval({
      userId: input.actorUserId,
      policyVersion,
      policyHash,
      approvedAt,
    }),
  ];

  const requestRef = input.db.collection(`users/${input.uid}/policy_publish_requests`).doc();
  const requestId = requestRef.id ?? `policy_publish_request_${now.getTime()}`;
  await requestRef.set({
    id: requestId,
    status: "pending_approval",
    policy_version: policyVersion,
    policy_hash: policyHash,
    policy_signature: policySignature,
    runtime_policy: nextPolicy,
    policy_as_code: policyAsCode,
    approval_note: getString(input.approvalNote, "Approved in dashboard."),
    required_approvals: requiredApprovals,
    reviewer_user_ids: reviewerUserIds,
    approvals,
    diff_count: diff.length,
    diff,
    requested_by: input.actorUserId,
    requested_at: approvedAt,
    expires_at: expiresAt,
    updated_at: FieldValue.serverTimestamp(),
  });

  const eventRef = input.db.collection(`users/${input.uid}/events`).doc();
  const eventId = eventRef.id ?? `policy_publish_request_event_${now.getTime()}`;
  await eventRef.set({
    event_id: eventId,
    agent_id: null,
    type: "runtime_policy_publish_request",
    verdict: "ask",
    severity: "warning",
    payload: {
      category: "policy_as_code",
      artifact: policyVersion,
      actor_user_id: input.actorUserId,
      request_id: requestId,
      required_approvals: requiredApprovals,
      reviewer_user_ids: reviewerUserIds,
      expires_at: expiresAt,
      approvals: approvals.length,
      policy_hash: policyHash,
      policy_signature: policySignature,
      diff_count: diff.length,
      diff,
    },
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    status: "pending_approval",
    request_id: requestId,
    policy_version: policyVersion,
    policy_hash: policyHash,
    required_approvals: requiredApprovals,
    approvals: approvals.length,
    event_id: eventId,
  };
}

export async function approvePolicyPublishRequest(input: {
  uid: string;
  actorUserId: string;
  requestId: string;
  db: PolicyPublishDb;
  now?: Date;
}): Promise<PolicyPublishApprovalResult> {
  const requestId = input.requestId.trim();
  if (!requestId) throw new Error("missing_policy_publish_request_id");

  const now = input.now ?? new Date();
  const requestRef = input.db.collection(`users/${input.uid}/policy_publish_requests`).doc(requestId);
  const snap = await requestRef.get();
  if (!snap.exists) throw new Error("policy_publish_request_not_found");
  const request = snap.data() ?? {};
  if (request.status !== "pending_approval") throw new Error("policy_publish_request_not_pending");

  const policyVersion = getString(request.policy_version);
  const policyHash = getString(request.policy_hash);
  const expiresAt = getString(request.expires_at);
  if (expiresAt) {
    const expiresTime = Date.parse(expiresAt);
    if (Number.isFinite(expiresTime) && expiresTime <= now.getTime()) {
      throw new Error("policy_publish_request_expired");
    }
  }
  const existingApprovals = getApprovals(request.approvals);
  if (existingApprovals.some((approval) => approval.user_id === input.actorUserId)) {
    throw new Error("policy_publish_self_approval_rejected");
  }
  const reviewerUserIds = getReviewerIds(request.reviewer_user_ids);
  if (reviewerUserIds.length > 0 && !reviewerUserIds.includes(input.actorUserId)) {
    throw new Error("policy_publish_reviewer_not_assigned");
  }

  const approvedAt = now.toISOString();
  const approvals = [
    ...existingApprovals,
    buildApproval({
      userId: input.actorUserId,
      policyVersion,
      policyHash,
      approvedAt,
    }),
  ];
  const requiredApprovals = Math.max(2, Math.floor(getNumber(request.required_approvals, 2)));
  const published = approvals.length >= requiredApprovals;

  await requestRef.set(
    {
      status: published ? "published" : "pending_approval",
      approvals,
      approved_at: published ? approvedAt : null,
      approved_by: published ? input.actorUserId : null,
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  if (!published) {
    const eventRef = input.db.collection(`users/${input.uid}/events`).doc();
    const eventId = eventRef.id ?? `policy_publish_approval_${now.getTime()}`;
    await eventRef.set({
      event_id: eventId,
      agent_id: null,
      type: "runtime_policy_publish_approval",
      verdict: "ask",
      severity: "warning",
      payload: {
        category: "policy_as_code",
        artifact: policyVersion,
        actor_user_id: input.actorUserId,
        request_id: requestId,
        approvals: approvals.length,
        required_approvals: requiredApprovals,
        policy_hash: policyHash,
      },
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    return {
      ok: true,
      status: "pending_approval",
      request_id: requestId,
      policy_version: policyVersion,
      policy_hash: policyHash,
      required_approvals: requiredApprovals,
      approvals: approvals.length,
      event_id: eventId,
    };
  }

  const runtimePolicy = normalizeRuntimePolicySettings(request.runtime_policy);
  const policySignature = getString(request.policy_signature) || null;
  const settingsRef = input.db.collection(`users/${input.uid}/settings`).doc("current");
  await settingsRef.set(
    {
      runtime_policy: runtimePolicy,
      runtime_policy_version: policyVersion,
      runtime_policy_hash: policyHash,
      runtime_policy_signature: policySignature,
      runtime_policy_published_at: approvedAt,
      runtime_policy_published_by: input.actorUserId,
      updated_at: approvedAt,
    },
    { merge: true },
  );

  const eventRef = input.db.collection(`users/${input.uid}/events`).doc();
  const eventId = eventRef.id ?? `policy_publish_${now.getTime()}`;
  await eventRef.set({
    event_id: eventId,
    agent_id: null,
    type: "runtime_policy_publish",
    verdict: "allow",
    severity: "warning",
    payload: {
      category: "policy_as_code",
      artifact: policyVersion,
      actor_user_id: input.actorUserId,
      request_id: requestId,
      approval_note: getString(request.approval_note, "Approved in dashboard."),
      policy_version: policyVersion,
      policy_hash: policyHash,
      policy_signature: policySignature,
      approvals: approvals.length,
      required_approvals: requiredApprovals,
      diff_count: getNumber(request.diff_count, 0),
      diff: Array.isArray(request.diff) ? request.diff : [],
    },
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    status: "published",
    request_id: requestId,
    approvals: approvals.length,
    policy_version: policyVersion,
    policy_hash: policyHash,
    policy_signature: policySignature,
    diff_count: getNumber(request.diff_count, 0),
    event_id: eventId,
  };
}
