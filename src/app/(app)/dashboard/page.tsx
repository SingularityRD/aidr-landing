"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { demoAgents, demoEvents } from "@/lib/demo-data";
import {
  getUserCollectionRef,
  getDocs,
  query,
  orderBy,
  limit,
} from "@/lib/firebase/database-client";

type AgentRow = {
  id: string;
  name?: string | null;
  runtime?: string | null;
  status?: string | null;
  last_seen_at?: string | null;
};

type EventRow = {
  id: string;
  agent_id?: string | null;
  type?: string | null;
  verdict?: string | null;
  severity?: string | null;
  created_at?: string | null;
};

function formatTime(value?: string | null) {
  if (!value) return "never";
  return new Date(value).toLocaleString();
}

function surfaceStyle(variant: "default" | "soft" = "default"): React.CSSProperties {
  return {
    border: "1px solid var(--panel-border)",
    borderRadius: 18,
    background: variant === "soft" ? "var(--bg-secondary)" : "var(--panel-bg)",
    boxShadow: "0 12px 36px var(--shadow-color)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  };
}

export default function DashboardPage() {
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const session = await getSession();
        if (!session?.user) {
          setError("Please sign in to open the dashboard.");
          return;
        }

        setUserEmail(session.user.email ?? "");

        if (isDemoMode()) {
          if (cancelled) return;
          setAgents(demoAgents);
          setEvents(demoEvents);
          return;
        }

        const uid = session.user.id;
        const [agentsSnap, eventsSnap] = await Promise.all([
          getDocs(
            query(
              getUserCollectionRef(uid, "agents"),
              orderBy("updated_at", "desc"),
              limit(100)
            )
          ),
          getDocs(
            query(
              getUserCollectionRef(uid, "events"),
              orderBy("created_at", "desc"),
              limit(100)
            )
          ),
        ]);

        if (cancelled) return;

        setAgents(
          agentsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as AgentRow[]
        );
        setEvents(
          eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as EventRow[]
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const connected = agents.filter((agent) => (agent.status ?? "unknown") === "connected").length;
    const pending = agents.filter((agent) => (agent.status ?? "unknown") === "pending").length;
    const denies = events.filter((event) => (event.verdict ?? "allow") === "deny").length;
    const asks = events.filter((event) => (event.verdict ?? "allow") === "ask").length;
    return {
      totalAgents: agents.length,
      connected,
      pending,
      totalEvents: events.length,
      denies,
      asks,
      lastEventAt: events[0]?.created_at ?? null,
      lastAgentSeen: agents.find((agent) => agent.last_seen_at)?.last_seen_at ?? null,
    };
  }, [agents, events]);

  const recentEvents = events.slice(0, 6);
  const liveAgents = agents.slice(0, 6);

  if (loading) {
    return (
      <div style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
        <div style={surfaceStyle()} className="card">
          <div style={{ padding: 28, color: "var(--text-secondary)" }}>Loading dashboard…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
        <div style={surfaceStyle()} className="card">
          <div style={{ padding: 28 }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: "var(--text-primary)" }}>Dashboard</div>
            <div className="mono" style={{ marginTop: 12, color: "var(--text-secondary)" }}>
              {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
      <section style={{ ...surfaceStyle(), padding: 28 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div style={{ maxWidth: 680 }}>
            <div style={{ color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em" }}>
              AIDR CONTROL PLANE
            </div>
            <h1 style={{ fontSize: 40, lineHeight: "46px", margin: "10px 0 12px", color: "var(--text-primary)" }}>
              Observe every agent decision from one secure dashboard.
            </h1>
            <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: "26px", fontSize: 16 }}>
              Start with prompt-based onboarding, approve a device code once, then track agent health,
              policy verdicts, and risky actions as they happen.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
              <Link
                href="/onboarding"
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--text-primary)",
                  background: "var(--text-primary)",
                  color: "var(--bg-primary)",
                  textDecoration: "none",
                }}
              >
                Connect agent
              </Link>
              <Link
                href="/verify"
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--panel-border)",
                  color: "var(--text-primary)",
                  textDecoration: "none",
                }}
              >
                Verify code
              </Link>
              <Link
                href="/settings"
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--panel-border)",
                  color: "var(--text-secondary)",
                  textDecoration: "none",
                }}
              >
                Privacy settings
              </Link>
            </div>
          </div>

          <div
            style={{
              minWidth: 280,
              padding: 18,
              borderRadius: 16,
              border: "1px solid var(--panel-border)",
              background: "linear-gradient(180deg, rgba(56,98,232,0.10), rgba(56,98,232,0.03))",
            }}
          >
            <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Signed in as</div>
            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
              {userEmail || "Account user"}
            </div>
            <div style={{ marginTop: 14, color: "var(--text-faint)", fontSize: 12 }}>Latest heartbeat</div>
            <div className="mono" style={{ marginTop: 6, color: "var(--text-primary)" }}>
              {formatTime(stats.lastAgentSeen || stats.lastEventAt)}
            </div>
          </div>
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
          { label: "Agents", value: stats.totalAgents },
          { label: "Connected", value: stats.connected },
          { label: "Pending", value: stats.pending },
          { label: "Events", value: stats.totalEvents },
          { label: "Deny", value: stats.denies },
          { label: "Ask", value: stats.asks },
        ].map((item) => (
          <div key={item.label} style={{ ...surfaceStyle(), padding: 18 }}>
            <div style={{ color: "var(--text-faint)", fontSize: 12 }}>{item.label}</div>
            <div className="mono" style={{ fontSize: 26, marginTop: 8, color: "var(--text-primary)" }}>
              {item.value}
            </div>
          </div>
        ))}
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: 18,
          marginTop: 18,
        }}
      >
        <div style={{ ...surfaceStyle(), padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Live agents</div>
              <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13 }}>
                Connected installations and their current health.
              </div>
            </div>
            <Link href="/agents" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>
              View all
            </Link>
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            {liveAgents.length === 0 ? (
              <div
                style={{
                  padding: 20,
                  borderRadius: 14,
                  border: "1px dashed var(--panel-border)",
                  color: "var(--text-secondary)",
                }}
              >
                No agents connected yet. Copy the prompt, run it in your agent, then approve the device code.
              </div>
            ) : (
              liveAgents.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/agents/${encodeURIComponent(agent.id)}`}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    borderRadius: 14,
                    border: "1px solid var(--panel-border)",
                    background: "var(--panel-bg)",
                    padding: 16,
                    display: "block",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {agent.name ?? "Unnamed agent"}
                      </div>
                      <div style={{ marginTop: 4, color: "var(--text-faint)", fontSize: 12 }}>
                        <span className="mono">{agent.id}</span>
                        {agent.runtime ? (
                          <>
                            {" "}
                            · <span className="mono">{agent.runtime}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Status</div>
                      <div className="mono" style={{ marginTop: 4 }}>
                        {agent.status ?? "unknown"}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, color: "var(--text-faint)", fontSize: 12 }}>
                    Last seen {formatTime(agent.last_seen_at)}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div style={{ ...surfaceStyle(), padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Recent events</div>
              <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13 }}>
                The latest allow, ask, and deny decisions from your agents.
              </div>
            </div>
            <Link href="/events" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>
              View all
            </Link>
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            {recentEvents.length === 0 ? (
              <div
                style={{
                  padding: 20,
                  borderRadius: 14,
                  border: "1px dashed var(--panel-border)",
                  color: "var(--text-secondary)",
                }}
              >
                No events yet. After approval, the first heartbeat will show up here.
              </div>
            ) : (
              recentEvents.map((event) => (
                <div
                  key={event.id}
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    border: "1px solid var(--panel-border)",
                    background: "var(--panel-bg)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {event.type ?? "event"}
                      </div>
                      <div style={{ marginTop: 4, color: "var(--text-faint)", fontSize: 12 }}>
                        agent <span className="mono">{event.agent_id ?? "unknown"}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="mono">{event.verdict ?? "allow"}</div>
                      <div style={{ marginTop: 4, color: "var(--text-faint)", fontSize: 12 }}>
                        {event.severity ?? "info"}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, color: "var(--text-faint)", fontSize: 12 }}>
                    {formatTime(event.created_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
