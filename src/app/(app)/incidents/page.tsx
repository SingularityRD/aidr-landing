"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { demoEvents } from "@/lib/demo-data";
import { isPolicyDriftAcknowledgement } from "@/lib/event-classification";
import {
  getUserCollectionRef,
  getDocs,
  query,
  orderBy,
  limit,
} from "@/lib/firebase/database-client";
import {
  incidentCaseDocId,
  incidentCaseActionLabel,
  incidentCaseOwnerLabel,
  nextIncidentCaseState,
  normalizeIncidentCaseState,
  type IncidentCaseAction,
  type IncidentCaseState,
  type IncidentCaseStatus,
} from "@/lib/incident-case";
import { buildIncidentTimeline, type IncidentTimelineItem } from "@/lib/incidents";

type IncidentRow = {
  id: string;
  created_at?: string | null;
  agent_id?: string | null;
  type?: string | null;
  verdict?: string | null;
  severity?: string | null;
  payload?: Record<string, unknown> | null;
};

type ActorProfile = {
  id: string;
  email: string | null;
  name: string | null;
};

type TeamMember = ActorProfile & {
  source?: string | null;
};

const demoTeamMembers: TeamMember[] = [
  { id: "demo-user-001", email: "demo@aidr.local", name: "Demo User", source: "demo" },
  { id: "demo-security-lead", email: "security@aidr.local", name: "Security Lead", source: "demo" },
];

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

function priorityScore(item: IncidentRow) {
  if (isPolicyDriftAcknowledgement(item)) return 2;
  const verdict = (item.verdict ?? "allow").toLowerCase();
  const severity = (item.severity ?? "info").toLowerCase();
  if (verdict === "deny" || severity === "critical") return 3;
  if (verdict === "ask" || severity === "warning") return 2;
  return 1;
}

function verdictCopy(item: IncidentTimelineItem) {
  if (item.type === "policy_rollout") {
    return "An admin remediation action was recorded for policy rollout drift.";
  }
  if (item.dominant_verdict === "deny") {
    return "AIDR blocked this root cause before the agent could continue.";
  }
  if (item.dominant_verdict === "ask") {
    return "AIDR paused this workflow and asked for human confirmation.";
  }
  return "This root cause was elevated by severity and should be reviewed.";
}

export default function IncidentsPage() {
  const [events, setEvents] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caseState, setCaseState] = useState<Record<string, IncidentCaseState>>({});
  const [caseMessage, setCaseMessage] = useState<string | null>(null);
  const [caseBusy, setCaseBusy] = useState<string | null>(null);
  const [caseFilter, setCaseFilter] = useState<"all" | IncidentCaseStatus>("all");
  const [actorProfile, setActorProfile] = useState<ActorProfile | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [caseAssignees, setCaseAssignees] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const session = await getSession();
        if (!session?.user) {
          if (!cancelled) {
            setError("Please sign in to view incidents.");
            setEvents([]);
          }
          return;
        }
        const actor = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.name ?? session.user.email ?? session.user.id,
        };
        if (!cancelled) {
          setActorProfile(actor);
          setTeamMembers([actor]);
        }
        if (isDemoMode()) {
          if (!cancelled) {
            setEvents(
              demoEvents
                .filter(
                  (event) =>
                    isPolicyDriftAcknowledgement(event) ||
                    (event.verdict ?? "allow") !== "allow" ||
                    (event.severity ?? "info") !== "info"
                )
                .sort((a, b) => priorityScore(b) - priorityScore(a))
            );
            setCaseState({});
            setTeamMembers(demoTeamMembers);
          }
          return;
        }
        const uid = session.user.id;
        const [eventsSnap, casesSnap, teamSnap] = await Promise.all([
          getDocs(
          query(
            getUserCollectionRef(uid, "events"),
            orderBy("created_at", "desc"),
            limit(100)
          )
          ),
          getDocs(getUserCollectionRef(uid, "incident_cases")),
          getDocs(getUserCollectionRef(uid, "team_members")),
        ]);
        if (cancelled) return;
        const raw = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as IncidentRow[];
        setEvents(
          raw
            .filter(
              (event) =>
                isPolicyDriftAcknowledgement(event) ||
                (event.verdict ?? "allow") !== "allow" ||
                (event.severity ?? "info") !== "info"
            )
            .sort((a, b) => priorityScore(b) - priorityScore(a))
        );
        const cases: Record<string, IncidentCaseState> = {};
        for (const docSnap of casesSnap.docs) {
          const normalized = normalizeIncidentCaseState(docSnap.data());
          if (normalized) cases[docSnap.id] = normalized;
        }
        setCaseState(cases);
        const loadedMembers = teamSnap.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          return {
            id: typeof data.user_id === "string" ? data.user_id : docSnap.id,
            email: typeof data.email === "string" ? data.email : null,
            name: typeof data.name === "string" ? data.name : null,
            source: typeof data.source === "string" ? data.source : null,
          };
        });
        setTeamMembers([actor, ...loadedMembers.filter((member) => member.id !== actor.id)]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load incidents.");
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
    return {
      total: events.length,
      rootCauses: buildIncidentTimeline(events).length,
      critical: events.filter((event) => (event.severity ?? "info") === "critical").length,
      warnings: events.filter((event) => (event.severity ?? "info") === "warning").length,
      denials: events.filter((event) => (event.verdict ?? "allow") === "deny").length,
    };
  }, [events]);
  const timeline = useMemo(() => buildIncidentTimeline(events), [events]);

  async function handleIncidentCaseAction(item: IncidentTimelineItem, action: IncidentCaseAction, ownerUserId?: string) {
    const busyKey = `${item.id}:${action}`;
    setCaseBusy(busyKey);
    setCaseMessage(null);

    try {
      if (isDemoMode()) {
        const targetOwner = teamMembers.find((member) => member.id === ownerUserId) ?? actorProfile;
        const next = nextIncidentCaseState({
          action,
          actorUserId: actorProfile?.id ?? "demo-user-001",
          actorEmail: actorProfile?.email ?? "demo@aidr.local",
          actorName: actorProfile?.name ?? "Demo User",
          ownerUserId: targetOwner?.id ?? actorProfile?.id ?? "demo-user-001",
          ownerEmail: targetOwner?.email ?? actorProfile?.email ?? "demo@aidr.local",
          ownerName: targetOwner?.name ?? actorProfile?.name ?? "Demo User",
        });
        setCaseState((current) => ({ ...current, [incidentCaseDocId(item.id)]: next }));
        setCaseMessage(`Demo incident ${incidentCaseActionLabel(action)}.`);
        return;
      }

      const response = await fetch("/api/v1/incident-case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          incident_id: item.id,
          action,
          owner_user_id: action === "assign" ? ownerUserId || actorProfile?.id : undefined,
          agent_id: item.agent_id,
          root_cause: item.root_cause,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        status?: IncidentCaseState["status"];
        owner_id?: string | null;
        owner_email?: string | null;
        owner_name?: string | null;
        snoozed_until?: string | null;
      };
      if (!response.ok || !data.ok || !data.status) {
        throw new Error(data.error || "Incident case update failed.");
      }
      const nextStatus = data.status;

      setCaseState((current) => ({
        ...current,
        [incidentCaseDocId(item.id)]: {
          status: nextStatus,
          owner_id: data.owner_id ?? actorProfile?.id ?? "current-user",
          owner_email: data.owner_email ?? actorProfile?.email ?? null,
          owner_name: data.owner_name ?? actorProfile?.name ?? null,
          updated_at: new Date().toISOString(),
          snoozed_until: data.snoozed_until ?? null,
        },
      }));
      setCaseMessage(`Incident ${incidentCaseActionLabel(action)}.`);
    } catch (err) {
      setCaseMessage(err instanceof Error ? err.message : "Incident case update failed.");
    } finally {
      setCaseBusy(null);
    }
  }

  const filteredTimeline = useMemo(() => {
    if (caseFilter === "all") return timeline;
    return timeline.filter((item) => (caseState[incidentCaseDocId(item.id)]?.status ?? "open") === caseFilter);
  }, [caseFilter, caseState, timeline]);

  const caseStats = useMemo(() => {
    const counts: Record<IncidentCaseStatus, number> = {
      open: 0,
      assigned: 0,
      resolved: 0,
      snoozed: 0,
    };
    for (const item of timeline) {
      const status = caseState[incidentCaseDocId(item.id)]?.status ?? "open";
      counts[status] += 1;
    }
    return counts;
  }, [caseState, timeline]);

  return (
    <div style={{ padding: 40, maxWidth: 1100, margin: "0 auto" }}>
      <section style={{ ...panelStyle(), padding: 28 }}>
        <div style={{ color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em" }}>INCIDENTS</div>
        <h1 style={{ margin: "10px 0 12px", fontSize: 36, lineHeight: "42px", color: "var(--text-primary)" }}>
          Focus on the events that actually need attention.
        </h1>
        <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: "26px", maxWidth: 820 }}>
          Incidents are the subset of events that deserve a human look: deny decisions, ask prompts,
          and higher severity warnings. Start here when something feels off.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
          <Link
            href="/events"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--panel-border)",
              color: "var(--text-primary)",
              textDecoration: "none",
            }}
          >
            Events feed
          </Link>
          <Link
            href="/agents"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--panel-border)",
              color: "var(--text-secondary)",
              textDecoration: "none",
            }}
          >
            Agents
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
          { label: "Incidents", value: stats.total },
          { label: "Root causes", value: stats.rootCauses },
          { label: "Critical", value: stats.critical },
          { label: "Warnings", value: stats.warnings },
          { label: "Denials", value: stats.denials },
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>
              Root-cause timeline
            </div>
            <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13, lineHeight: "22px" }}>
              Repeated ask and deny events are grouped by agent, policy category, and artifact.
            </div>
          </div>
          <Link href="/settings" style={{ color: "var(--text-secondary)", textDecoration: "none", alignSelf: "center" }}>
            Tune policy
          </Link>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          {[
            { value: "all", label: `All cases (${timeline.length})` },
            { value: "open", label: `Open (${caseStats.open})` },
            { value: "assigned", label: `Assigned (${caseStats.assigned})` },
            { value: "snoozed", label: `Snoozed (${caseStats.snoozed})` },
            { value: "resolved", label: `Resolved (${caseStats.resolved})` },
          ].map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setCaseFilter(filter.value as typeof caseFilter)}
              style={{
                minHeight: 34,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--panel-border)",
                background: caseFilter === filter.value ? "var(--text-primary)" : "var(--bg-secondary)",
                color: caseFilter === filter.value ? "var(--bg-primary)" : "var(--text-secondary)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {loading ? <div style={{ color: "var(--text-secondary)" }}>Loading incidents…</div> : null}
        {error ? (
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              border: "1px solid var(--panel-border)",
              background: "var(--bg-secondary)",
            }}
          >
            <div className="mono">{error}</div>
          </div>
        ) : null}
        {caseMessage ? (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 14,
              border: "1px solid var(--panel-border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
            }}
          >
            {caseMessage}
          </div>
        ) : null}

        {!loading && !error ? (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredTimeline.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  borderRadius: 14,
                  border: "1px dashed var(--panel-border)",
                  color: "var(--text-secondary)",
                  lineHeight: "24px",
                }}
              >
                No incidents match this case filter.
              </div>
            ) : (
              filteredTimeline.map((item) => {
                const currentCase = caseState[incidentCaseDocId(item.id)];
                const caseStatus = currentCase?.status ?? "open";
                const selectedAssigneeId = caseAssignees[item.id] ?? teamMembers[0]?.id ?? "";
                return (
                <article
                  key={item.id}
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
                        {item.root_cause}
                      </div>
                      <div style={{ marginTop: 4, color: "var(--text-faint)", fontSize: 12 }}>
                        agent <span className="mono">{item.agent_id}</span> ·{" "}
                        <span className="mono">{item.event_count}</span> event{item.event_count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="mono">{item.dominant_verdict}</div>
                      <div style={{ marginTop: 4, color: "var(--text-faint)", fontSize: 12 }}>
                        {item.highest_severity}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, color: "var(--text-secondary)", lineHeight: "24px" }}>
                    {verdictCopy(item)}
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      display: "grid",
                      gridTemplateColumns: "minmax(180px, 1fr) auto",
                      gap: 12,
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid var(--panel-border)",
                      background: "var(--bg-secondary)",
                    }}
                  >
                    <div>
                      <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Case status</div>
                      <div className="mono" style={{ marginTop: 4, color: "var(--text-primary)" }}>
                        {caseStatus}
                      </div>
                      <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 12 }}>
                        Owner {incidentCaseOwnerLabel(currentCase)}
                      </div>
                      {currentCase?.snoozed_until ? (
                        <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 12 }}>
                          snoozed until {formatTime(currentCase.snoozed_until)}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <label
                        style={{
                          display: "grid",
                          gap: 4,
                          color: "var(--text-faint)",
                          fontSize: 11,
                        }}
                      >
                        <span>Assignee</span>
                        <select
                          aria-label="Incident assignee"
                          value={selectedAssigneeId}
                          disabled={teamMembers.length === 0}
                          onChange={(event) =>
                            setCaseAssignees((current) => ({ ...current, [item.id]: event.target.value }))
                          }
                          style={{
                            minHeight: 34,
                            maxWidth: 190,
                            borderRadius: 10,
                            border: "1px solid var(--panel-border)",
                            background: "var(--panel-bg)",
                            color: "var(--text-primary)",
                            padding: "7px 9px",
                            fontSize: 12,
                          }}
                        >
                          {teamMembers.length === 0 ? (
                            <option value="">No assignees</option>
                          ) : (
                            teamMembers.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.name || member.email || member.id}
                              </option>
                            ))
                          )}
                        </select>
                      </label>
                      {(["assign", "resolve", "snooze"] as const).map((action) => {
                        const label = action === "assign" ? "Assign" : action === "resolve" ? "Resolve" : "Snooze 24h";
                        const busyKey = `${item.id}:${action}`;
                        const disabled = caseBusy === busyKey || (action === "assign" && !selectedAssigneeId);
                        return (
                          <button
                            key={action}
                            type="button"
                            onClick={() => handleIncidentCaseAction(item, action, selectedAssigneeId)}
                            disabled={disabled}
                            style={{
                              minHeight: 34,
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid var(--panel-border)",
                              background: disabled ? "var(--panel-bg)" : "var(--button-bg, var(--panel-bg))",
                              color: "var(--text-primary)",
                              cursor: caseBusy === busyKey ? "wait" : disabled ? "not-allowed" : "pointer",
                              fontSize: 12,
                              opacity: disabled && caseBusy !== busyKey ? 0.65 : 1,
                            }}
                          >
                            {caseBusy === busyKey ? "Saving..." : label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {item.type === "policy_rollout" ? (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                      <Link
                        href={`/agents/${encodeURIComponent(item.agent_id)}#runtime-policy-cache`}
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
                        href={`/events?agent=${encodeURIComponent(item.agent_id)}&class=remediation`}
                        style={{ color: "var(--text-primary)", fontSize: 12 }}
                      >
                        Remediation evidence
                      </Link>
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 10,
                      marginTop: 14,
                    }}
                  >
                    <div style={{ padding: 12, borderRadius: 12, background: "var(--bg-secondary)" }}>
                      <div style={{ color: "var(--text-faint)", fontSize: 12 }}>First seen</div>
                      <div className="mono" style={{ marginTop: 4, color: "var(--text-primary)", fontSize: 12 }}>
                        {formatTime(item.first_seen_at)}
                      </div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 12, background: "var(--bg-secondary)" }}>
                      <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Last seen</div>
                      <div className="mono" style={{ marginTop: 4, color: "var(--text-primary)", fontSize: 12 }}>
                        {formatTime(item.last_seen_at)}
                      </div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 12, background: "var(--bg-secondary)" }}>
                      <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Artifact</div>
                      <div className="mono" style={{ marginTop: 4, color: "var(--text-primary)", fontSize: 12, wordBreak: "break-word" }}>
                        {item.artifact}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 8 }}>Remediation</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {item.recommended_actions.map((action) => (
                        <span
                          key={action}
                          style={{
                            padding: "7px 9px",
                            borderRadius: 10,
                            border: "1px solid var(--panel-border)",
                            color: "var(--text-secondary)",
                            fontSize: 12,
                          }}
                        >
                          {action}
                        </span>
                      ))}
                    </div>
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
