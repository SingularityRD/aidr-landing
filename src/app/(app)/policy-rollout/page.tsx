"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { demoAgents, demoEvents } from "@/lib/demo-data";
import { classifyEvent, eventDisplayTitle, isPolicyDriftAcknowledgement } from "@/lib/event-classification";
import {
  getUserCollectionRef,
  getUserDocRef,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from "@/lib/firebase/database-client";
import {
  buildReconnectReminderText,
  buildStaleAgentCsv,
  currentPolicyVersionFromSettings,
  filterPolicyDriftAlertsByAcknowledgement,
  formatPolicySeconds,
  getAcknowledgedPolicyDriftAgentIds,
  getPolicyCacheLabel,
  getPolicyDriftAlerts,
  getPolicyRolloutStats,
  type PolicyAcknowledgementStatus,
  type PolicyRolloutAgent,
} from "@/lib/policy-rollout";

type SettingsRow = {
  runtime_policy_version?: string;
  updated_at?: string;
};

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
  if (!value) return "unknown";
  return new Date(value).toLocaleString();
}

function cacheTone(agent: PolicyRolloutAgent) {
  const label = getPolicyCacheLabel(agent.runtime_policy_cache);
  if (label === "fresh") return { label: "fresh", color: "#22c55e", background: "rgba(34,197,94,0.12)" };
  if (label === "stale") return { label: "stale", color: "#eab308", background: "rgba(234,179,8,0.12)" };
  if (label === "attention") return { label: "attention", color: "#ef4444", background: "rgba(239,68,68,0.12)" };
  return { label: "unknown", color: "var(--text-secondary)", background: "rgba(148,163,184,0.12)" };
}

export default function PolicyRolloutPage() {
  const [settings, setSettings] = useState<SettingsRow>({});
  const [agents, setAgents] = useState<PolicyRolloutAgent[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ackFilter, setAckFilter] = useState<PolicyAcknowledgementStatus>("all");
  const [exportCsv, setExportCsv] = useState("");
  const [reconnectReminder, setReconnectReminder] = useState("");
  const [deliveryResult, setDeliveryResult] = useState<string | null>(null);
  const [delivering, setDelivering] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const session = await getSession();
        if (!session?.user) {
          if (!cancelled) setError("Please sign in to view policy rollout.");
          return;
        }
        if (isDemoMode()) {
          if (!cancelled) {
            setSettings({
              runtime_policy_version: "pol_demo_locked_down",
              updated_at: "2026-05-06T11:18:00.000Z",
            });
            setAgents(demoAgents);
            setEvents(demoEvents);
          }
          return;
        }
        const uid = session.user.id;
        const [settingsSnap, agentsSnap, eventsSnap] = await Promise.all([
          getDoc(getUserDocRef(uid, "settings", "current")),
          getDocs(getUserCollectionRef(uid, "agents")),
          getDocs(query(getUserCollectionRef(uid, "events"), orderBy("created_at", "desc"), limit(200))),
        ]);
        if (cancelled) return;
        setSettings(settingsSnap.exists() ? (settingsSnap.data() as SettingsRow) : {});
        setAgents(agentsSnap.docs.map((item) => ({ id: item.id, ...item.data() })) as PolicyRolloutAgent[]);
        setEvents(eventsSnap.docs.map((item) => ({ id: item.id, ...item.data() })) as EventRow[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load policy rollout.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const policyVersion = currentPolicyVersionFromSettings(settings);
  const stats = useMemo(() => getPolicyRolloutStats(agents, policyVersion), [agents, policyVersion]);
  const alerts = useMemo(() => getPolicyDriftAlerts(agents, policyVersion), [agents, policyVersion]);
  const acknowledgedAgentIds = useMemo(() => getAcknowledgedPolicyDriftAgentIds(events), [events]);
  const filteredAlerts = useMemo(
    () => filterPolicyDriftAlertsByAcknowledgement(alerts, acknowledgedAgentIds, ackFilter),
    [ackFilter, acknowledgedAgentIds, alerts]
  );
  const acknowledgementEvents = useMemo(
    () => events.filter((event) => isPolicyDriftAcknowledgement(event)).slice(0, 8),
    [events]
  );
  const relatedSecurityEvents = useMemo(
    () =>
      events
        .filter((event) => classifyEvent(event) === "security")
        .filter((event) => filteredAlerts.some((alert) => alert.agent.id === event.agent_id))
        .slice(0, 8),
    [events, filteredAlerts]
  );

  async function sendServerReminder() {
    setDelivering(true);
    setDeliveryResult(null);
    setError(null);
    try {
      if (isDemoMode()) {
        setDeliveryResult(`Demo delivery prepared for ${filteredAlerts.length} agent${filteredAlerts.length === 1 ? "" : "s"}.`);
        return;
      }
      const response = await fetch("/api/v1/policy-rollout-reminder", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ack_filter: ackFilter }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        delivered?: number;
        skipped?: number;
        failed?: number;
        agent_count?: number;
      };
      if (!response.ok) throw new Error(payload.error ?? "Failed to send rollout reminder.");
      setDeliveryResult(
        `Delivery recorded: ${payload.delivered ?? 0} delivered, ${payload.skipped ?? 0} skipped, ${payload.failed ?? 0} failed for ${payload.agent_count ?? 0} agents.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send rollout reminder.");
    } finally {
      setDelivering(false);
    }
  }

  return (
    <div style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
      <section style={{ ...panelStyle(), padding: 28 }}>
        <div style={{ color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em" }}>POLICY ROLLOUT</div>
        <h1 style={{ margin: "10px 0 12px", fontSize: 36, lineHeight: "42px", color: "var(--text-primary)" }}>
          One place to verify what every agent will enforce.
        </h1>
        <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: "26px", maxWidth: 820 }}>
          Track the current account policy, endpoint cache freshness, drift alerts, acknowledgements,
          and related security events before agents execute tool calls.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
          <Link href="/settings#policy-rollout" style={{ color: "var(--text-primary)" }}>
            Policy settings
          </Link>
          <Link href="/events?class=remediation" style={{ color: "var(--text-primary)" }}>
            Remediation events
          </Link>
          <Link href="/events?class=security" style={{ color: "var(--text-primary)" }}>
            Security events
          </Link>
        </div>
      </section>

      {loading ? (
        <section style={{ ...panelStyle(), padding: 24, marginTop: 18, color: "var(--text-secondary)" }}>
          Loading policy rollout…
        </section>
      ) : null}

      {error ? (
        <section style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
          <div className="mono">{error}</div>
        </section>
      ) : null}

      {!loading && !error ? (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
              marginTop: 18,
            }}
          >
            {[
              ["version", policyVersion],
              ["current", stats.current],
              ["fresh", stats.fresh],
              ["stale", stats.stale],
              ["unknown", stats.unknown],
              ["alerts", alerts.length],
              ["acked", acknowledgedAgentIds.size],
            ].map(([label, value]) => (
              <div key={label} style={{ ...panelStyle(), padding: 18 }}>
                <div className="mono" style={{ color: "var(--text-faint)", fontSize: 11 }}>
                  {label}
                </div>
                <div style={{ marginTop: 8, color: "var(--text-primary)", fontSize: 24, fontWeight: 700 }}>
                  {String(value)}
                </div>
              </div>
            ))}
          </section>

          <section style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Admin actions</div>
                <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13, lineHeight: "22px" }}>
                  Filter rollout drift by acknowledgement status, export stale agents, or draft a reconnect reminder.
                </div>
              </div>
              <label style={{ alignSelf: "center" }}>
                <span style={{ color: "var(--text-faint)", fontSize: 12, marginRight: 6 }}>Acknowledgement</span>
                <select
                  value={ackFilter}
                  onChange={(event) => setAckFilter(event.target.value as PolicyAcknowledgementStatus)}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--panel-border)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="all">All</option>
                  <option value="unacknowledged">Unacknowledged</option>
                  <option value="acknowledged">Acknowledged</option>
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setExportCsv(buildStaleAgentCsv(filteredAlerts, policyVersion))}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--panel-border)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                Generate stale-agent CSV
              </button>
              <button
                type="button"
                onClick={() => setReconnectReminder(buildReconnectReminderText(filteredAlerts, policyVersion))}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--text-primary)",
                  background: "var(--text-primary)",
                  color: "var(--bg-primary)",
                  cursor: "pointer",
                }}
              >
                Draft bulk reconnect reminder
              </button>
              <button
                type="button"
                disabled={delivering}
                onClick={sendServerReminder}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--panel-border)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  opacity: delivering ? 0.7 : 1,
                }}
              >
                {delivering ? "Sending…" : "Send webhook reminder"}
              </button>
            </div>
            {deliveryResult ? (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid var(--panel-border)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                }}
              >
                {deliveryResult}
              </div>
            ) : null}
            {exportCsv ? (
              <label style={{ display: "grid", gap: 8, marginTop: 16 }}>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Stale-agent export</span>
                <textarea
                  readOnly
                  value={exportCsv}
                  rows={Math.min(8, Math.max(4, filteredAlerts.length + 1))}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    resize: "vertical",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid var(--panel-border)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    lineHeight: "18px",
                  }}
                />
              </label>
            ) : null}
            {reconnectReminder ? (
              <label style={{ display: "grid", gap: 8, marginTop: 16 }}>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Bulk reconnect reminder</span>
                <textarea
                  readOnly
                  value={reconnectReminder}
                  rows={8}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    resize: "vertical",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid var(--panel-border)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    lineHeight: "18px",
                  }}
                />
              </label>
            ) : null}
          </section>

          <section style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Agent cache state</div>
                <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13 }}>
                  Endpoint-reported cache metadata from the last heartbeat or ingest.
                </div>
              </div>
              <Link href="/agents" style={{ color: "var(--text-secondary)" }}>
                Agent inventory
              </Link>
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
              {agents.map((agent) => {
                const cache = agent.runtime_policy_cache;
                const tone = cacheTone(agent);
                return (
                  <div
                    key={agent.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(240px, 1fr) auto",
                      gap: 14,
                      alignItems: "center",
                      padding: 14,
                      borderRadius: 14,
                      border: "1px solid var(--panel-border)",
                      background: "var(--bg-secondary)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <Link
                          href={`/agents/${encodeURIComponent(agent.id)}#runtime-policy-cache`}
                          style={{ color: "var(--text-primary)", fontWeight: 600 }}
                        >
                          {agent.name ?? agent.id}
                        </Link>
                        <span className="mono" style={{ color: "var(--text-faint)", fontSize: 11 }}>
                          {agent.runtime ?? "unknown"}
                        </span>
                      </div>
                      <div style={{ marginTop: 6, color: "var(--text-faint)", fontSize: 12, lineHeight: "18px" }}>
                        Policy <span className="mono">{cache?.policy_version ?? "not reported"}</span>
                        {" · "}age <span className="mono">{formatPolicySeconds(cache?.age_seconds)}</span>
                        {" · "}ttl <span className="mono">{formatPolicySeconds(cache?.ttl_seconds)}</span>
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
                      }}
                    >
                      {tone.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Drift alerts</div>
            <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
              {alerts.length === 0 ? (
                <div style={{ color: "var(--text-secondary)" }}>No policy drift detected.</div>
              ) : filteredAlerts.length === 0 ? (
                <div style={{ color: "var(--text-secondary)" }}>No drift alerts match this acknowledgement filter.</div>
              ) : (
                filteredAlerts.map((alert) => (
                  <div
                    key={alert.agent.id}
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      border: "1px solid rgba(234,179,8,0.38)",
                      background: "rgba(234,179,8,0.08)",
                    }}
                  >
                    <div style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                      {alert.agent.name ?? alert.agent.id}
                    </div>
                    <div style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 13, lineHeight: "22px" }}>
                      {alert.reason}
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                      <Link href={`/events?agent=${encodeURIComponent(alert.agent.id)}&class=security`} style={{ color: "var(--text-primary)", fontSize: 12 }}>
                        Related security events
                      </Link>
                      <Link href={`/events?agent=${encodeURIComponent(alert.agent.id)}&class=remediation`} style={{ color: "var(--text-primary)", fontSize: 12 }}>
                        Acknowledgements
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 18,
              marginTop: 18,
            }}
          >
            <div style={{ ...panelStyle(), padding: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Acknowledgement history</div>
              <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                {acknowledgementEvents.length === 0 ? (
                  <div style={{ color: "var(--text-secondary)" }}>No acknowledgements recorded yet.</div>
                ) : (
                  acknowledgementEvents.map((event) => (
                    <div key={event.id} style={{ borderTop: "1px solid var(--panel-border)", paddingTop: 10 }}>
                      <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{eventDisplayTitle(event)}</div>
                      <div style={{ marginTop: 4, color: "var(--text-faint)", fontSize: 12 }}>
                        <span className="mono">{event.agent_id ?? "unknown-agent"}</span> · {formatTime(event.created_at)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div style={{ ...panelStyle(), padding: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Related security events</div>
              <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                {relatedSecurityEvents.length === 0 ? (
                  <div style={{ color: "var(--text-secondary)" }}>No related security events for current drift alerts.</div>
                ) : (
                  relatedSecurityEvents.map((event) => (
                    <div key={event.id} style={{ borderTop: "1px solid var(--panel-border)", paddingTop: 10 }}>
                      <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{eventDisplayTitle(event)}</div>
                      <div style={{ marginTop: 4, color: "var(--text-faint)", fontSize: 12 }}>
                        <span className="mono">{event.agent_id ?? "unknown-agent"}</span> · {event.verdict ?? "allow"} ·{" "}
                        {event.severity ?? "info"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
