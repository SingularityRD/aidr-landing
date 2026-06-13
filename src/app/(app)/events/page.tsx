"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { demoEvents } from "@/lib/demo-data";
import {
  classifyEvent,
  eventDisplaySummary,
  eventDisplayTitle,
} from "@/lib/event-classification";
import {
  getUserCollectionRef,
  getDocs,
  query,
  orderBy,
  limit,
} from "@/lib/firebase/database-client";

type EventRow = {
  id: string;
  agent_id?: string | null;
  type?: string | null;
  verdict?: string | null;
  severity?: string | null;
  created_at?: string | null;
  payload?: Record<string, unknown> | null;
};

function panelStyle(): React.CSSProperties {
  return {
    border: "1px solid var(--panel-border)",
    borderRadius: 18,
    background: "var(--panel-bg)",
    boxShadow: "0 12px 36px var(--shadow-color)",
  };
}

function formatTime(value?: string | null) {
  if (!value) return "unknown time";
  return new Date(value).toLocaleString();
}

function truncateJson(value?: Record<string, unknown> | null) {
  if (!value) return "";
  const json = JSON.stringify(value, null, 2);
  return json.length > 260 ? `${json.slice(0, 260)}…` : json;
}

function initialClassFilter(): "all" | "security" | "remediation" | "telemetry" {
  if (typeof window === "undefined") return "all";
  const value = new URLSearchParams(window.location.search).get("class");
  if (value === "security" || value === "remediation" || value === "telemetry") return value;
  return "all";
}

function initialAgentFilter() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("agent")?.trim() ?? "";
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verdictFilter, setVerdictFilter] = useState<"all" | "allow" | "ask" | "deny">("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | "info" | "warning" | "critical">("all");
  const [classFilter, setClassFilter] = useState<"all" | "security" | "remediation" | "telemetry">(
    initialClassFilter
  );
  const [agentFilter, setAgentFilter] = useState(initialAgentFilter);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const session = await getSession();
        if (!session?.user) {
          if (!cancelled) {
            setError("Please sign in to view events.");
            setEvents([]);
          }
          return;
        }
        if (isDemoMode()) {
          if (!cancelled) setEvents(demoEvents);
          return;
        }
        const uid = session.user.id;
        const snap = await getDocs(
          query(
            getUserCollectionRef(uid, "events"),
            orderBy("created_at", "desc"),
            limit(200)
          )
        );
        if (cancelled) return;
        setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as EventRow[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load events.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return events.filter((event) => {
      if (verdictFilter !== "all" && (event.verdict ?? "allow") !== verdictFilter) return false;
      if (severityFilter !== "all" && (event.severity ?? "info") !== severityFilter) return false;
      if (classFilter !== "all" && classifyEvent(event) !== classFilter) return false;
      if (agentFilter && (event.agent_id ?? "").toLowerCase() !== agentFilter.toLowerCase()) return false;
      return true;
    });
  }, [events, verdictFilter, severityFilter, classFilter, agentFilter]);

  const stats = useMemo(() => {
    return {
      total: events.length,
      allow: events.filter((event) => (event.verdict ?? "allow") === "allow").length,
      ask: events.filter((event) => (event.verdict ?? "allow") === "ask").length,
      deny: events.filter((event) => (event.verdict ?? "allow") === "deny").length,
      remediation: events.filter((event) => classifyEvent(event) === "remediation").length,
    };
  }, [events]);

  return (
    <div style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
      <section style={{ ...panelStyle(), padding: 28 }}>
        <div style={{ color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em" }}>EVENTS FEED</div>
        <h1 style={{ margin: "10px 0 12px", fontSize: 36, lineHeight: "42px", color: "var(--text-primary)" }}>
          Review every decision, without losing the surrounding context.
        </h1>
        <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: "26px", maxWidth: 800 }}>
          The events feed is the flight recorder for your agents. Use verdict and severity filters to
          inspect allow, ask, and deny decisions as they happen.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
          <Link
            href="/agents"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--panel-border)",
              color: "var(--text-primary)",
              textDecoration: "none",
            }}
          >
            Agents
          </Link>
          <Link
            href="/incidents"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--panel-border)",
              color: "var(--text-secondary)",
              textDecoration: "none",
            }}
          >
            Incidents
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
          { label: "Total", value: stats.total },
          { label: "Allow", value: stats.allow },
          { label: "Ask", value: stats.ask },
          { label: "Deny", value: stats.deny },
          { label: "Remediation", value: stats.remediation },
        ].map((item) => (
          <div key={item.label} style={{ ...panelStyle(), padding: 18 }}>
            <div style={{ color: "var(--text-faint)", fontSize: 12 }}>{item.label}</div>
            <div className="mono" style={{ marginTop: 8, fontSize: 26, color: "var(--text-primary)" }}>
              {item.value}
            </div>
          </div>
        ))}
      </section>

      <section style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label>
            <span style={{ color: "var(--text-faint)", fontSize: 12, marginRight: 6 }}>Agent</span>
            <input
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value.trim())}
              placeholder="agent id"
              style={{
                padding: "9px 12px",
                borderRadius: 12,
                border: "1px solid var(--panel-border)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                minWidth: 220,
              }}
            />
          </label>
          <label>
            <span style={{ color: "var(--text-faint)", fontSize: 12, marginRight: 6 }}>Class</span>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value as typeof classFilter)}
              style={{
                padding: "9px 12px",
                borderRadius: 12,
                border: "1px solid var(--panel-border)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
              }}
            >
              <option value="all">All</option>
              <option value="security">Security</option>
              <option value="remediation">Remediation</option>
              <option value="telemetry">Telemetry</option>
            </select>
          </label>
          <label>
            <span style={{ color: "var(--text-faint)", fontSize: 12, marginRight: 6 }}>Verdict</span>
            <select
              value={verdictFilter}
              onChange={(e) => setVerdictFilter(e.target.value as typeof verdictFilter)}
              style={{
                padding: "9px 12px",
                borderRadius: 12,
                border: "1px solid var(--panel-border)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
              }}
            >
              <option value="all">All</option>
              <option value="allow">Allow</option>
              <option value="ask">Ask</option>
              <option value="deny">Deny</option>
            </select>
          </label>
          <label>
            <span style={{ color: "var(--text-faint)", fontSize: 12, marginRight: 6 }}>Severity</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
              style={{
                padding: "9px 12px",
                borderRadius: 12,
                border: "1px solid var(--panel-border)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
              }}
            >
              <option value="all">All</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </label>
        </div>

        {loading ? <div style={{ marginTop: 18, color: "var(--text-secondary)" }}>Loading events…</div> : null}
        {error ? (
          <div
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 14,
              border: "1px solid var(--panel-border)",
              background: "var(--bg-secondary)",
            }}
          >
            <div className="mono">{error}</div>
          </div>
        ) : null}

        {!loading && !error ? (
          <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: 20,
                  borderRadius: 14,
                  border: "1px dashed var(--panel-border)",
                  color: "var(--text-secondary)",
                }}
              >
                No events found for the selected filters.
              </div>
            ) : (
              filtered.map((event) => (
                <article
                  key={event.id}
                  style={{
                    padding: 18,
                    borderRadius: 16,
                    border: "1px solid var(--panel-border)",
                    background: "var(--panel-bg)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {eventDisplayTitle(event)}
                      </div>
                      <div style={{ marginTop: 4, color: "var(--text-faint)", fontSize: 12 }}>
                        agent{" "}
                        {event.agent_id ? (
                          <Link href={`/agents/${encodeURIComponent(event.agent_id)}`} style={{ color: "var(--text-secondary)" }}>
                            <span className="mono">{event.agent_id}</span>
                          </Link>
                        ) : (
                          <span className="mono">unknown</span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="mono">{classifyEvent(event)}</div>
                      <div style={{ marginTop: 4, color: "var(--text-faint)", fontSize: 12 }}>
                        {event.verdict ?? "allow"} · {event.severity ?? "info"}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 8, color: "var(--text-faint)", fontSize: 12 }}>
                    {formatTime(event.created_at)}
                  </div>

                  {eventDisplaySummary(event) ? (
                    <div style={{ marginTop: 10, color: "var(--text-secondary)", fontSize: 13, lineHeight: "22px" }}>
                      {eventDisplaySummary(event)}
                    </div>
                  ) : null}

                  {classifyEvent(event) === "remediation" && event.agent_id ? (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                      <Link
                        href={`/agents/${encodeURIComponent(event.agent_id)}#runtime-policy-cache`}
                        style={{ color: "var(--text-primary)", fontSize: 12 }}
                      >
                        Current agent policy cache
                      </Link>
          <Link href="/settings#policy-rollout" style={{ color: "var(--text-primary)", fontSize: 12 }}>
            Policy rollout settings
          </Link>
          <Link href="/policy-rollout" style={{ color: "var(--text-primary)", fontSize: 12 }}>
            Rollout drilldown
          </Link>
          <Link
            href={`/events?agent=${encodeURIComponent(event.agent_id)}&class=security`}
                        style={{ color: "var(--text-primary)", fontSize: 12 }}
                      >
                        Triggering security events
                      </Link>
                    </div>
                  ) : null}

                  {event.payload ? (
                    <pre
                      style={{
                        marginTop: 12,
                        padding: 14,
                        borderRadius: 14,
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--panel-border)",
                        color: "var(--text-secondary)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: 12,
                        lineHeight: "18px",
                      }}
                    >
                      {truncateJson(event.payload)}
                    </pre>
                  ) : null}
                </article>
              ))
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
