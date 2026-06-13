"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { demoPolicyPublishRequests } from "@/lib/demo-data";
import {
  approvalProgress,
  canApprovePolicyRequest,
  policyApprovalState,
  policyApprovalStats,
  type PolicyPublishRequestRow,
} from "@/lib/policy-approvals";
import {
  getUserCollectionRef,
  getDocs,
  query,
  orderBy,
  limit,
} from "@/lib/firebase/database-client";

function panelStyle(): React.CSSProperties {
  return {
    border: "1px solid var(--panel-border)",
    borderRadius: 18,
    background: "var(--panel-bg)",
    boxShadow: "0 12px 36px var(--shadow-color)",
  };
}

function statusTone(state: ReturnType<typeof policyApprovalState>["state"]) {
  if (state === "published") return { background: "rgba(34,197,94,0.12)", color: "#22c55e" };
  if (state === "expired") return { background: "rgba(239,68,68,0.12)", color: "#ef4444" };
  return { background: "rgba(234,179,8,0.12)", color: "#eab308" };
}

function formatTime(value?: string | null) {
  if (!value) return "none";
  return new Date(value).toLocaleString();
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "none";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function reviewerLabel(row: PolicyPublishRequestRow) {
  const reviewers = row.reviewer_user_ids ?? [];
  if (reviewers.length === 0) return "unassigned pool";
  return reviewers.join(", ");
}

export default function PolicyApprovalsPage() {
  const [requests, setRequests] = useState<PolicyPublishRequestRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const session = await getSession();
        if (!session?.user) {
          if (!cancelled) setError("Please sign in to view policy approvals.");
          return;
        }
        if (!cancelled) setCurrentUserId(session.user.id);
        if (isDemoMode()) {
          if (!cancelled) setRequests(demoPolicyPublishRequests);
          return;
        }

        const snap = await getDocs(
          query(
            getUserCollectionRef(session.user.id, "policy_publish_requests"),
            orderBy("updated_at", "desc"),
            limit(100)
          )
        );
        if (cancelled) return;
        setRequests(snap.docs.map((item) => ({ id: item.id, ...item.data() })) as PolicyPublishRequestRow[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load policy approvals.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const now = useMemo(() => new Date(), []);
  const stats = useMemo(() => policyApprovalStats(requests, now), [requests, now]);

  async function approveRequest(row: PolicyPublishRequestRow) {
    setNotice(null);
    setError(null);
    setApprovingId(row.id);
    try {
      if (isDemoMode()) {
        throw new Error("Demo request already has the requester approval. Needs another reviewer.");
      }

      const session = await getSession();
      const response = await fetch("/api/v1/policy-publish-approve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
        },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ request_id: row.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: PolicyPublishRequestRow["status"];
        approvals?: number;
      };
      if (!response.ok) throw new Error(payload.error ?? `Approval failed (${response.status})`);

      setRequests((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                status: payload.status ?? item.status,
                approvals: [
                  ...(item.approvals ?? []),
                  { user_id: currentUserId, approved_at: new Date().toISOString(), signature: null },
                ].slice(0, payload.approvals ?? item.required_approvals ?? 2),
              }
            : item
        )
      );
      setNotice(payload.status === "published" ? "Policy request published." : "Approval recorded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Policy approval failed.");
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <div style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
      <section style={{ ...panelStyle(), padding: 28 }}>
        <div style={{ color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em" }}>POLICY APPROVALS</div>
        <h1 style={{ margin: "10px 0 12px", fontSize: 36, lineHeight: "42px", color: "var(--text-primary)" }}>
          Policy publish approvals
        </h1>
        <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: "26px", maxWidth: 820 }}>
          Review signed policy-as-code requests before they change local agent enforcement across commands,
          packages, output scanning, and MCP tool calls.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
          <Link href="/settings#policy-as-code" style={{ color: "var(--text-primary)" }}>
            Policy editor
          </Link>
          <Link href="/policy-rollout" style={{ color: "var(--text-primary)" }}>
            Rollout state
          </Link>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 14,
          marginTop: 18,
        }}
      >
        {[
          ["Total", stats.total],
          ["Pending", stats.pending],
          ["Published", stats.published],
          ["Expired", stats.expired],
        ].map(([label, value]) => (
          <div key={label} style={{ ...panelStyle(), padding: 18 }}>
            <div style={{ color: "var(--text-faint)", fontSize: 12 }}>{label}</div>
            <div style={{ marginTop: 8, color: "var(--text-primary)", fontSize: 26, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </section>

      {error ? (
        <div style={{ ...panelStyle(), marginTop: 18, padding: 16, color: "#ef4444" }}>{error}</div>
      ) : null}
      {notice ? (
        <div className="mono" style={{ ...panelStyle(), marginTop: 18, padding: 16, color: "var(--text-secondary)" }}>
          {notice}
        </div>
      ) : null}

      <section style={{ display: "grid", gap: 14, marginTop: 18 }}>
        {loading ? (
          <div style={{ ...panelStyle(), padding: 24, color: "var(--text-secondary)" }}>Loading policy approvals...</div>
        ) : requests.length === 0 ? (
          <div style={{ ...panelStyle(), padding: 24 }}>
            <div style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 600 }}>No pending policy requests.</div>
            <p style={{ margin: "8px 0 0", color: "var(--text-secondary)", lineHeight: "24px" }}>
              Two-person approvals created from the policy-as-code editor will appear here with reviewer assignment,
              expiry, signatures, and diff evidence.
            </p>
          </div>
        ) : (
          requests.map((row) => {
            const state = policyApprovalState(row, now);
            const tone = statusTone(state.state);
            const canApprove = canApprovePolicyRequest(row, currentUserId, now);
            const alreadyApproved = row.approvals?.some((approval) => approval.user_id === currentUserId) ?? false;
            const blockedReason = alreadyApproved ? "Needs another reviewer" : "Reviewer assignment required";

            return (
              <article key={row.id} style={{ ...panelStyle(), padding: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                  <div>
                    <div className="mono" style={{ color: "var(--text-faint)", fontSize: 12 }}>{row.id}</div>
                    <h2 style={{ margin: "8px 0 0", color: "var(--text-primary)", fontSize: 22 }}>
                      {row.policy_version ?? "draft policy"}
                    </h2>
                  </div>
                  <span
                    style={{
                      ...tone,
                      alignSelf: "flex-start",
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {state.label}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                    gap: 12,
                    marginTop: 18,
                  }}
                >
                  {[
                    ["Approvals", approvalProgress(row)],
                    ["Reviewers", reviewerLabel(row)],
                    ["Requested by", row.requested_by ?? "unknown"],
                    ["Expires", formatTime(row.expires_at)],
                    ["Diffs", row.diff_count ?? row.diff?.length ?? 0],
                    ["Hash", row.policy_hash ?? "missing"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        border: "1px solid var(--panel-border)",
                        borderRadius: 14,
                        padding: 12,
                        background: "var(--bg-secondary)",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ color: "var(--text-faint)", fontSize: 12 }}>{label}</div>
                      <div
                        className={label === "Hash" ? "mono" : undefined}
                        style={{
                          marginTop: 6,
                          color: "var(--text-primary)",
                          fontSize: 13,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {String(value)}
                      </div>
                    </div>
                  ))}
                </div>

                {row.approval_note ? (
                  <p style={{ margin: "16px 0 0", color: "var(--text-secondary)", lineHeight: "24px" }}>
                    {row.approval_note}
                  </p>
                ) : null}

                {row.diff?.length ? (
                  <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
                    {row.diff.map((item) => (
                      <div
                        key={`${item.field}-${formatValue(item.before)}-${formatValue(item.after)}`}
                        className="mono"
                        style={{
                          border: "1px solid var(--panel-border)",
                          borderRadius: 12,
                          padding: 12,
                          background: "rgba(148,163,184,0.08)",
                          color: "var(--text-secondary)",
                          fontSize: 12,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {item.field}: {formatValue(item.before)} -&gt; {formatValue(item.after)}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={!canApprove || approvingId === row.id}
                    onClick={() => approveRequest(row)}
                    style={{
                      padding: "9px 12px",
                      borderRadius: 12,
                      border: canApprove ? "1px solid var(--text-primary)" : "1px solid var(--panel-border)",
                      background: canApprove ? "var(--text-primary)" : "transparent",
                      color: canApprove ? "var(--bg-primary)" : "var(--text-secondary)",
                      cursor: canApprove ? "pointer" : "not-allowed",
                      opacity: approvingId === row.id ? 0.65 : 1,
                    }}
                  >
                    {approvingId === row.id ? "Approving..." : "Approve policy"}
                  </button>
                  {!canApprove && state.state === "pending" ? (
                    <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{blockedReason}</span>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
