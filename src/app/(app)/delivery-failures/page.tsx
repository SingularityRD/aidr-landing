"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSession } from "@/lib/auth/session";
import {
  deliveryFailureStats,
  deliveryFailureSlaState,
  deliveryFailureTone,
  filterDeliveryFailures,
  replayHrefForDeliveryFailure,
  type DeliveryFailureRow,
} from "@/lib/delivery-failures";
import { isDemoMode } from "@/lib/demo";
import { demoDeliveryFailures } from "@/lib/demo-data";
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

function formatTime(value?: string | null) {
  if (!value) return "none";
  return new Date(value).toLocaleString();
}

export default function DeliveryFailuresPage() {
  const [failures, setFailures] = useState<DeliveryFailureRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "retry_pending" | "dead_letter" | "closed">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [caseUpdatingId, setCaseUpdatingId] = useState<string | null>(null);
  const [replayNotice, setReplayNotice] = useState<string | null>(null);
  const [caseNotice, setCaseNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const session = await getSession();
        if (!session?.user) {
          if (!cancelled) setError("Please sign in to view delivery failures.");
          return;
        }
        if (isDemoMode()) {
          if (!cancelled) setFailures(demoDeliveryFailures);
          return;
        }
        const uid = session.user.id;
        const snap = await getDocs(
          query(
            getUserCollectionRef(uid, "delivery_failures"),
            orderBy("updated_at", "desc"),
            limit(100)
          )
        );
        if (cancelled) return;
        setFailures(snap.docs.map((item) => ({ id: item.id, ...item.data() })) as DeliveryFailureRow[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load delivery failures.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => deliveryFailureStats(failures), [failures]);
  const filtered = useMemo(() => filterDeliveryFailures(failures, statusFilter), [failures, statusFilter]);

  async function replayFailure(failure: DeliveryFailureRow) {
    setReplayNotice(null);
    setError(null);
    setReplayingId(failure.id);
    try {
      if (isDemoMode()) {
        setFailures((current) =>
          current.map((item) => (item.id === failure.id ? { ...item, status: "replay_delivered" } : item))
        );
        setReplayNotice("Demo replay marked as delivered.");
        return;
      }

      const session = await getSession();
      const response = await fetch("/api/v1/delivery-failure-replay", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
        },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ failure_id: failure.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: DeliveryFailureRow["status"];
        attempted?: number;
        delivered?: number;
        failed?: number;
        skipped?: number;
      };
      if (!response.ok) throw new Error(payload.error ?? `Replay failed (${response.status})`);

      setFailures((current) =>
        current.map((item) => (item.id === failure.id ? { ...item, status: payload.status ?? item.status } : item))
      );
      setReplayNotice(
        `Replay ${payload.status ?? "finished"}: ${payload.delivered ?? 0} delivered, ${payload.failed ?? 0} failed, ${payload.skipped ?? 0} skipped.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Manual replay failed.");
    } finally {
      setReplayingId(null);
    }
  }

  async function updateCase(failure: DeliveryFailureRow, action: "assign" | "close" | "reopen") {
    setCaseNotice(null);
    setError(null);
    setCaseUpdatingId(failure.id);
    try {
      if (isDemoMode()) {
        const now = new Date().toISOString();
        setFailures((current) =>
          current.map((item) => {
            if (item.id !== failure.id) return item;
            if (action === "assign") {
              return {
                ...item,
                owner: { user_id: "demo-user-001", assigned_at: now },
                sla: { due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
              };
            }
            if (action === "close") {
              return {
                ...item,
                status: "closed",
                closed_at: now,
                close_reason: "Closed after operator review.",
              };
            }
            return { ...item, status: item.retry?.dead_letter_at ? "dead_letter" : "retry_pending", closed_at: null, close_reason: null };
          })
        );
        setCaseNotice(`Demo case ${action} recorded.`);
        return;
      }

      const session = await getSession();
      const response = await fetch("/api/v1/delivery-failure-case", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
        },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ failure_id: failure.id, action }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: DeliveryFailureRow["status"];
      };
      if (!response.ok) throw new Error(payload.error ?? `Case update failed (${response.status})`);
      setFailures((current) =>
        current.map((item) => (item.id === failure.id ? { ...item, status: payload.status ?? item.status } : item))
      );
      setCaseNotice(`Case ${action} recorded.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Case update failed.");
    } finally {
      setCaseUpdatingId(null);
    }
  }

  return (
    <div style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
      <section style={{ ...panelStyle(), padding: 28 }}>
        <div style={{ color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em" }}>DELIVERY FAILURES</div>
        <h1 style={{ margin: "10px 0 12px", fontSize: 36, lineHeight: "42px", color: "var(--text-primary)" }}>
          Keep failed exports visible until someone closes the loop.
        </h1>
        <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: "26px", maxWidth: 820 }}>
          Failed SIEM exports and policy rollout reminders leave retry/dead-letter evidence with destination
          origin, backoff metadata, and replay entry points.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
          <Link href="/policy-rollout" style={{ color: "var(--text-primary)" }}>
            Policy rollout
          </Link>
          <Link href="/settings#security-export" style={{ color: "var(--text-primary)" }}>
            Security export settings
          </Link>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginTop: 18,
        }}
      >
        {[
          ["total", stats.total],
          ["retry pending", stats.retryPending],
          ["dead-letter", stats.deadLetter],
          ["replayed", stats.replayDelivered],
          ["closed", stats.closed],
          ["SLA overdue", stats.overdue],
          ["security export", stats.securityExport],
          ["policy rollout", stats.policyRollout],
        ].map(([label, value]) => (
          <div key={label} style={{ ...panelStyle(), padding: 18 }}>
            <div className="mono" style={{ color: "var(--text-faint)", fontSize: 11 }}>
              {label}
            </div>
            <div style={{ marginTop: 8, color: "var(--text-primary)", fontSize: 24, fontWeight: 700 }}>
              {value}
            </div>
          </div>
        ))}
      </section>

      <section style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Failure queue</div>
            <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13 }}>
              Review retry status, dead-letter evidence, and replay destination.
            </div>
          </div>
          <label style={{ alignSelf: "center" }}>
            <span style={{ color: "var(--text-faint)", fontSize: 12, marginRight: 6 }}>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              style={{
                padding: "9px 12px",
                borderRadius: 12,
                border: "1px solid var(--panel-border)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
              }}
            >
              <option value="all">All</option>
              <option value="retry_pending">Retry pending</option>
              <option value="dead_letter">Dead-letter</option>
              <option value="closed">Closed</option>
            </select>
          </label>
        </div>

        {loading ? <div style={{ marginTop: 18, color: "var(--text-secondary)" }}>Loading delivery failures…</div> : null}
        {error ? <div style={{ marginTop: 18 }} className="mono">{error}</div> : null}
        {replayNotice ? <div style={{ marginTop: 18, color: "var(--text-secondary)" }} className="mono">{replayNotice}</div> : null}
        {caseNotice ? <div style={{ marginTop: 18, color: "var(--text-secondary)" }} className="mono">{caseNotice}</div> : null}

        {!loading && !error ? (
          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: 20,
                  borderRadius: 14,
                  border: "1px dashed var(--panel-border)",
                  color: "var(--text-secondary)",
                }}
              >
                No delivery failures match this filter.
              </div>
            ) : (
              filtered.map((failure) => {
                const tone = deliveryFailureTone(failure.status);
                const sla = deliveryFailureSlaState(failure);
                return (
                  <article
                    key={failure.id}
                    style={{
                      padding: 18,
                      borderRadius: 16,
                      border: "1px solid var(--panel-border)",
                      background: "var(--panel-bg)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                          {failure.event_type ?? "delivery"}
                        </div>
                        <div style={{ marginTop: 4, color: "var(--text-faint)", fontSize: 12 }}>
                          <span className="mono">{failure.channel ?? "unknown"}</span> ·{" "}
                          <span className="mono">{failure.subject ?? "unknown-subject"}</span>
                        </div>
                      </div>
                      <span
                        style={{
                          color: tone.color,
                          background: tone.background,
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          alignSelf: "center",
                        }}
                      >
                        {tone.label}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                        gap: 10,
                        marginTop: 14,
                      }}
                    >
                      {[
                        ["destination", failure.destination_origin ?? "unknown"],
                        ["reason", failure.reason ?? "unknown"],
                        ["owner", failure.owner?.user_id ?? "unassigned"],
                        ["SLA", `${sla.label}${failure.sla?.due_at ? ` · ${formatTime(failure.sla.due_at)}` : ""}`],
                        ["attempt", `${failure.retry?.attempt ?? 0}/${failure.retry?.max_attempts ?? 0}`],
                        ["next retry", formatTime(failure.retry?.next_retry_at)],
                        ["dead-letter", formatTime(failure.retry?.dead_letter_at)],
                      ].map(([label, value]) => (
                        <div key={label} style={{ padding: 12, borderRadius: 12, background: "var(--bg-secondary)" }}>
                          <div style={{ color: "var(--text-faint)", fontSize: 12 }}>{label}</div>
                          <div className="mono" style={{ marginTop: 4, color: "var(--text-primary)", fontSize: 12, wordBreak: "break-word" }}>
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                      <button
                        type="button"
                        onClick={() => updateCase(failure, "assign")}
                        disabled={caseUpdatingId === failure.id || failure.status === "closed"}
                        style={{
                          border: 0,
                          padding: 0,
                          background: "transparent",
                          color: "var(--text-primary)",
                          fontSize: 12,
                          cursor: caseUpdatingId === failure.id || failure.status === "closed" ? "default" : "pointer",
                          opacity: caseUpdatingId === failure.id || failure.status === "closed" ? 0.55 : 1,
                        }}
                      >
                        Assign to me
                      </button>
                      <button
                        type="button"
                        onClick={() => replayFailure(failure)}
                        disabled={replayingId === failure.id || failure.status === "replay_delivered"}
                        style={{
                          border: 0,
                          padding: 0,
                          background: "transparent",
                          color: "var(--text-primary)",
                          fontSize: 12,
                          cursor: replayingId === failure.id || failure.status === "replay_delivered" ? "default" : "pointer",
                          opacity: replayingId === failure.id || failure.status === "replay_delivered" ? 0.55 : 1,
                        }}
                      >
                        Manual replay action
                      </button>
                      {failure.status === "closed" ? (
                        <button
                          type="button"
                          onClick={() => updateCase(failure, "reopen")}
                          disabled={caseUpdatingId === failure.id}
                          style={{
                            border: 0,
                            padding: 0,
                            background: "transparent",
                            color: "var(--text-primary)",
                            fontSize: 12,
                            cursor: caseUpdatingId === failure.id ? "default" : "pointer",
                            opacity: caseUpdatingId === failure.id ? 0.55 : 1,
                          }}
                        >
                          Reopen case
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => updateCase(failure, "close")}
                          disabled={caseUpdatingId === failure.id}
                          style={{
                            border: 0,
                            padding: 0,
                            background: "transparent",
                            color: "var(--text-primary)",
                            fontSize: 12,
                            cursor: caseUpdatingId === failure.id ? "default" : "pointer",
                            opacity: caseUpdatingId === failure.id ? 0.55 : 1,
                          }}
                        >
                          Close case
                        </button>
                      )}
                      <Link href={replayHrefForDeliveryFailure(failure)} style={{ color: "var(--text-primary)", fontSize: 12 }}>
                        Replay settings
                      </Link>
                      <Link href="/events?class=remediation" style={{ color: "var(--text-primary)", fontSize: 12 }}>
                        Remediation events
                      </Link>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
