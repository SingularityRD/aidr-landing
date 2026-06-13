"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { demoAgents, demoEvents } from "@/lib/demo-data";
import {
	getUserCollectionRef,
  getUserDocRef,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  where,
} from "@/lib/firebase/database-client";

type AgentRow = {
  id: string;
  name?: string | null;
  runtime?: string | null;
  runtime_version?: string | null;
  status?: string | null;
  last_seen_at?: string | null;
  created_at?: string | null;
  runtime_policy_cache?: {
    source?: string | null;
    usable?: boolean | null;
    present?: boolean | null;
    policy_version?: string | null;
    cached_at?: string | null;
    expires_at?: string | null;
    age_seconds?: number | null;
    ttl_seconds?: number | null;
    key_matches?: boolean | null;
  } | null;
};

type EventRow = {
  id: string;
  type?: string | null;
  verdict?: string | null;
  severity?: string | null;
  created_at?: string | null;
};

function panelStyle(): React.CSSProperties {
  return {
    border: "1px solid var(--panel-border)",
    borderRadius: 18,
    background: "var(--panel-bg)",
    boxShadow: "0 12px 36px var(--shadow-color)",
  };
}

function statusTone(status?: string | null) {
  const value = (status ?? "unknown").toLowerCase();
  if (value === "connected") return { background: "rgba(34,197,94,0.12)", color: "#22c55e" };
  if (value === "pending") return { background: "rgba(234,179,8,0.12)", color: "#eab308" };
  if (value === "offline" || value === "disconnected") return { background: "rgba(239,68,68,0.12)", color: "#ef4444" };
  return { background: "rgba(148,163,184,0.12)", color: "var(--text-secondary)" };
}

function formatTime(value?: string | null) {
  if (!value) return "never";
  return new Date(value).toLocaleString();
}

function policyStatus(cache?: AgentRow["runtime_policy_cache"]) {
  const source = cache?.source ?? "missing";
  if (cache?.usable || source === "valid") return { label: "Fresh", color: "#22c55e", background: "rgba(34,197,94,0.12)" };
  if (source === "expired") return { label: "Stale", color: "#eab308", background: "rgba(234,179,8,0.12)" };
  if (source === "mismatched" || source === "invalid") return { label: "Needs attention", color: "#ef4444", background: "rgba(239,68,68,0.12)" };
  return { label: "Unknown", color: "var(--text-secondary)", background: "rgba(148,163,184,0.12)" };
}

function formatSeconds(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  if (value < 120) return `${Math.max(0, Math.round(value))}s`;
  const minutes = Math.round(value / 60);
  if (minutes < 120) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = (params?.id ?? "").toString();
  const [agent, setAgent] = useState<AgentRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const session = await getSession();
        if (!session?.user) {
          if (!cancelled) setError("Please sign in to view agent details.");
          return;
        }
        if (isDemoMode()) {
          if (!cancelled) {
            setAgent((demoAgents.find((item) => item.id === id) as AgentRow | undefined) ?? null);
            setEvents(
              demoEvents
                .filter((event) => event.agent_id === id)
                .map((event) => ({ ...event }))
            );
          }
          return;
        }
        const uid = session.user.id;
        const [agentSnap, eventsSnap] = await Promise.all([
          getDoc(getUserDocRef(uid, "agents", id)),
          getDocs(
            query(
              getUserCollectionRef(uid, "events"),
              where("agent_id", "==", id),
              orderBy("created_at", "desc"),
              limit(50)
            )
          ),
        ]);
        if (cancelled) return;
        setAgent(
          agentSnap.exists()
            ? ({ id: agentSnap.id, ...agentSnap.data() } as AgentRow)
            : null
        );
        setEvents(
          eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as EventRow[]
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load agent.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const tone = useMemo(() => statusTone(agent?.status), [agent?.status]);
  const policy = useMemo(() => policyStatus(agent?.runtime_policy_cache), [agent?.runtime_policy_cache]);

  return (
    <div style={{ padding: 40, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/agents" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>
          Back to agents
        </Link>
      </div>

      {loading ? (
        <div style={panelStyle()}>
          <div style={{ padding: 28, color: "var(--text-secondary)" }}>Loading agent detail…</div>
        </div>
      ) : error ? (
        <div style={panelStyle()}>
          <div style={{ padding: 28 }}>
            <div className="mono">{error}</div>
          </div>
        </div>
      ) : !agent ? (
        <div style={panelStyle()}>
          <div style={{ padding: 28, color: "var(--text-secondary)" }}>Agent not found.</div>
        </div>
      ) : (
        <>
          <section style={{ ...panelStyle(), padding: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
              <div style={{ maxWidth: 720 }}>
                <div style={{ color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em" }}>AGENT DETAIL</div>
                <h1 style={{ margin: "10px 0 10px", fontSize: 34, lineHeight: "40px", color: "var(--text-primary)" }}>
                  {agent.name ?? "Unnamed agent"}
                </h1>
                <div style={{ color: "var(--text-secondary)", lineHeight: "24px" }}>
                  <span className="mono">{agent.id}</span>
                  {agent.runtime ? (
                    <>
                      {" "}
                      · runtime <span className="mono">{agent.runtime}</span>
                    </>
                  ) : null}
                  {agent.runtime_version ? (
                    <>
                      {" "}
                      <span className="mono">({agent.runtime_version})</span>
                    </>
                  ) : null}
                </div>
              </div>
              <div style={{ minWidth: 220, textAlign: "right" }}>
                <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Status</div>
                <div
                  style={{
                    ...tone,
                    display: "inline-flex",
                    alignItems: "center",
                    marginTop: 8,
                    padding: "8px 12px",
                    borderRadius: 999,
                    fontWeight: 600,
                    textTransform: "capitalize",
                  }}
                >
                  {agent.status ?? "unknown"}
                </div>
                <div style={{ marginTop: 12, color: "var(--text-faint)", fontSize: 12 }}>
                  Last seen <span className="mono">{formatTime(agent.last_seen_at)}</span>
                </div>
              </div>
            </div>
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginTop: 18,
            }}
          >
            {[
              { label: "Connected", value: agent.status === "connected" ? "yes" : "no" },
              { label: "Runtime", value: agent.runtime ?? "unknown" },
              { label: "Version", value: agent.runtime_version ?? "n/a" },
              { label: "Events", value: events.length },
              { label: "Policy", value: agent.runtime_policy_cache?.policy_version ?? "unknown" },
            ].map((item) => (
              <div key={item.label} style={{ ...panelStyle(), padding: 18 }}>
                <div style={{ color: "var(--text-faint)", fontSize: 12 }}>{item.label}</div>
                <div className="mono" style={{ marginTop: 8, fontSize: 22, color: "var(--text-primary)" }}>
                  {item.value}
                </div>
              </div>
            ))}
          </section>

          <section id="runtime-policy-cache" style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Runtime policy cache</div>
                <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13, lineHeight: "22px" }}>
                  Shows the last policy snapshot this endpoint reported from its local cache.
                </div>
              </div>
              <span
                style={{
                  ...policy,
                  alignSelf: "flex-start",
                  padding: "7px 11px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {policy.label}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 10,
                marginTop: 16,
              }}
            >
              {[
                { label: "Source", value: agent.runtime_policy_cache?.source ?? "missing" },
                { label: "Version", value: agent.runtime_policy_cache?.policy_version ?? "unknown" },
                { label: "Age", value: formatSeconds(agent.runtime_policy_cache?.age_seconds) },
                { label: "TTL", value: formatSeconds(agent.runtime_policy_cache?.ttl_seconds) },
                { label: "Cached", value: formatTime(agent.runtime_policy_cache?.cached_at) },
                { label: "Expires", value: formatTime(agent.runtime_policy_cache?.expires_at) },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid var(--panel-border)",
                    background: "var(--bg-secondary)",
                  }}
                >
                  <div style={{ color: "var(--text-faint)", fontSize: 12 }}>{item.label}</div>
                  <div className="mono" style={{ marginTop: 8, color: "var(--text-primary)", fontSize: 13 }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Recent events</div>
                <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13 }}>
                  Each decision contributes to the audit trail for this installation.
                </div>
              </div>
              <Link href="/events" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>
                Open events feed
              </Link>
            </div>

            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              {events.length === 0 ? (
                <div
                  style={{
                    padding: 20,
                    borderRadius: 14,
                    border: "1px dashed var(--panel-border)",
                    color: "var(--text-secondary)",
                  }}
                >
                  No events yet. Once the agent sends its first heartbeat, the timeline will appear here.
                </div>
              ) : (
                events.map((event) => (
                  <article
                    key={event.id}
                    style={{
                      padding: 16,
                      borderRadius: 14,
                      border: "1px solid var(--panel-border)",
                      background: "var(--panel-bg)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                          {event.type ?? "event"}
                        </div>
                        <div style={{ marginTop: 4, color: "var(--text-faint)", fontSize: 12 }}>
                          created {formatTime(event.created_at)}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="mono">{event.verdict ?? "allow"}</div>
                        <div style={{ marginTop: 4, color: "var(--text-faint)", fontSize: 12 }}>
                          {event.severity ?? "info"}
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
