"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { demoAgents } from "@/lib/demo-data";
import {
  getUserCollectionRef,
  getUserDocRef,
  getDocs,
  query,
  orderBy,
  limit,
  updateDoc,
} from "@/lib/firebase/database-client";

type AgentRow = {
  id: string;
  name?: string | null;
  runtime?: string | null;
  status?: string | null;
  last_seen_at?: string | null;
  created_at?: string | null;
  runtime_policy_cache?: {
    source?: string | null;
    usable?: boolean | null;
    policy_version?: string | null;
    age_seconds?: number | null;
    ttl_seconds?: number | null;
  } | null;
};

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid var(--panel-border)",
    borderRadius: 18,
    background: "var(--panel-bg)",
    boxShadow: "0 12px 36px var(--shadow-color)",
  };
}

function formatTime(value?: string | null) {
  if (!value) return "never";
  return new Date(value).toLocaleString();
}

function statusTone(status?: string | null) {
  const value = (status ?? "unknown").toLowerCase();
  if (value === "connected") return { background: "rgba(34,197,94,0.12)", color: "#22c55e" };
  if (value === "pending") return { background: "rgba(234,179,8,0.12)", color: "#eab308" };
  if (value === "offline" || value === "disconnected") return { background: "rgba(239,68,68,0.12)", color: "#ef4444" };
  return { background: "rgba(148,163,184,0.12)", color: "var(--text-secondary)" };
}

function policyTone(cache?: AgentRow["runtime_policy_cache"]) {
  const source = cache?.source ?? "missing";
  if (cache?.usable || source === "valid") return { label: "policy cached", background: "rgba(34,197,94,0.12)", color: "#22c55e" };
  if (source === "expired") return { label: "policy stale", background: "rgba(234,179,8,0.12)", color: "#eab308" };
  return { label: "policy unknown", background: "rgba(148,163,184,0.12)", color: "var(--text-secondary)" };
}

function formatPolicyFreshness(cache?: AgentRow["runtime_policy_cache"]) {
  if (!cache) return "No policy cache reported";
  const version = cache.policy_version ?? "unknown";
  if (cache.usable || cache.source === "valid") {
    const ttl = typeof cache.ttl_seconds === "number" ? ` · ${cache.ttl_seconds}s left` : "";
    return `${version}${ttl}`;
  }
  if (cache.source === "expired") {
    const age = typeof cache.age_seconds === "number" ? ` · ${cache.age_seconds}s old` : "";
    return `${version} expired${age}`;
  }
  return `source ${cache.source ?? "missing"}`;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const session = await getSession();
        if (!session?.user) {
          if (!cancelled) {
            setError("Please sign in to view agents.");
            setAgents([]);
          }
          return;
        }
        if (isDemoMode()) {
          if (!cancelled) setAgents(demoAgents);
          return;
        }
        const uid = session.user.id;
        const snap = await getDocs(
          query(
            getUserCollectionRef(uid, "agents"),
            orderBy("updated_at", "desc"),
            limit(50)
          )
        );
        if (cancelled) return;
        setAgents(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as AgentRow[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load agents.");
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
    const offline = agents.filter((agent) => {
      const status = (agent.status ?? "unknown").toLowerCase();
      return status === "offline" || status === "disconnected";
    }).length;
    return { connected, pending, offline, total: agents.length };
  }, [agents]);

  async function copyAgentId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1200);
    } catch {
      setCopiedId(null);
    }
  }

  return (
    <div style={{ padding: 40, maxWidth: 1100, margin: "0 auto" }}>
      <section style={{ ...cardStyle(), padding: 28 }}>
        <div style={{ color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em" }}>CONNECTED AGENTS</div>
        <h1 style={{ margin: "10px 0 12px", fontSize: 36, lineHeight: "42px", color: "var(--text-primary)" }}>
          Keep each installation named, visible, and recoverable.
        </h1>
        <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: "26px", maxWidth: 760 }}>
          Every agent gets a stable identity, a status, and a recent heartbeat. Rename them, inspect the
          detail page, or reconnect a broken installation without losing the audit trail.
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
            Connect another agent
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
            Approve device code
          </Link>
          <Link
            href="/events"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--panel-border)",
              color: "var(--text-secondary)",
              textDecoration: "none",
            }}
          >
            View events
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
          { label: "Connected", value: stats.connected },
          { label: "Pending", value: stats.pending },
          { label: "Offline", value: stats.offline },
        ].map((item) => (
          <div key={item.label} style={{ ...cardStyle(), padding: 18 }}>
            <div style={{ color: "var(--text-faint)", fontSize: 12 }}>{item.label}</div>
            <div className="mono" style={{ marginTop: 8, fontSize: 26, color: "var(--text-primary)" }}>
              {item.value}
            </div>
          </div>
        ))}
      </section>

      <section style={{ ...cardStyle(), padding: 24, marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Agent inventory</div>
            <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13 }}>
              Use the detail view to inspect status, runtime, and recent activity.
            </div>
          </div>
          <div style={{ color: "var(--text-faint)", fontSize: 12 }}>
            Last synced at <span className="mono">{new Date().toLocaleTimeString()}</span>
          </div>
        </div>

        {loading ? (
          <div style={{ marginTop: 18, color: "var(--text-secondary)" }}>Loading agents…</div>
        ) : error ? (
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
        ) : agents.length === 0 ? (
          <div
            style={{
              marginTop: 18,
              padding: 24,
              borderRadius: 16,
              border: "1px dashed var(--panel-border)",
              color: "var(--text-secondary)",
              lineHeight: "24px",
            }}
          >
            No agents connected yet. Copy the prompt from onboarding, paste it into your agent
            runtime, then approve the code at /verify.
          </div>
        ) : (
          <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
            {agents.map((agent) => {
              const tone = statusTone(agent.status);
              const policy = policyTone(agent.runtime_policy_cache);
              const isRenaming = renameId === agent.id;
              return (
                <article
                  key={agent.id}
                  style={{
                    ...cardStyle(),
                    padding: 18,
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 280, flex: 1 }}>
                      {isRenaming ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            placeholder="Agent name"
                            style={{
                              minWidth: 220,
                              flex: 1,
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: "1px solid var(--panel-border)",
                              background: "var(--bg-secondary)",
                              color: "var(--text-primary)",
                            }}
                          />
                          <button
                            type="button"
                            disabled={saving}
                            onClick={async () => {
                              setSaving(true);
                              try {
                                const session = await getSession();
                                if (!session?.user) return;
                                const uid = session.user.id;
                                await updateDoc(getUserDocRef(uid, "agents", agent.id), {
                                  name: renameValue.trim() || "Unnamed agent",
                                  updated_at: new Date().toISOString(),
                                });
                                setAgents((current) =>
                                  current.map((item) =>
                                    item.id === agent.id ? { ...item, name: renameValue.trim() || "Unnamed agent" } : item
                                  )
                                );
                              } finally {
                                setSaving(false);
                                setRenameId(null);
                              }
                            }}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: "1px solid var(--panel-border)",
                              background: "var(--text-primary)",
                              color: "var(--bg-primary)",
                              cursor: "pointer",
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenameId(null)}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: "1px solid var(--panel-border)",
                              background: "transparent",
                              color: "var(--text-secondary)",
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
                            {agent.name ?? "Unnamed agent"}
                          </div>
                          <div style={{ marginTop: 6, color: "var(--text-faint)", fontSize: 12, lineHeight: "18px" }}>
                            <span className="mono">{agent.id}</span>
                            {agent.runtime ? (
                              <>
                                {" "}
                                · runtime <span className="mono">{agent.runtime}</span>
                              </>
                            ) : null}
                            {agent.created_at ? (
                              <>
                                {" "}
                                · connected {formatTime(agent.created_at)}
                              </>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span
                        style={{
                          ...tone,
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          textTransform: "capitalize",
                        }}
                      >
                        {agent.status ?? "unknown"}
                      </span>
                      <span
                        title={formatPolicyFreshness(agent.runtime_policy_cache)}
                        style={{
                          ...policy,
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {policy.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyAgentId(agent.id)}
                        style={{
                          padding: "9px 12px",
                          borderRadius: 12,
                          border: "1px solid var(--panel-border)",
                          background: "transparent",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                        }}
                      >
                        {copiedId === agent.id ? "Copied" : "Copy ID"}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ color: "var(--text-faint)", fontSize: 12 }}>
                      Last seen <span className="mono">{formatTime(agent.last_seen_at)}</span>
                    </div>
                    <div style={{ color: "var(--text-faint)", fontSize: 12 }}>
                      Policy <span className="mono">{formatPolicyFreshness(agent.runtime_policy_cache)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                      <Link href={`/agents/${encodeURIComponent(agent.id)}`} style={{ color: "var(--text-primary)" }}>
                        Open detail
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setRenameId(agent.id);
                          setRenameValue(agent.name ?? "");
                        }}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Rename
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
