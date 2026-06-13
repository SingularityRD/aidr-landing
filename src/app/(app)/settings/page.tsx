"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { demoAgents } from "@/lib/demo-data";
import {
  getUserCollectionRef,
  getUserDocRef,
  getDoc,
  getDocs,
  setDoc,
} from "@/lib/firebase/database-client";
import {
  defaultRuntimePolicySettings,
  formatServerList,
  normalizeRuntimePolicySettings,
  parseServerList,
  parseRuntimePolicyAsCodeJson,
  renderRuntimePolicyAsCode,
  serializeRuntimePolicySettings,
  type RuntimePolicyMode,
  type RuntimePolicySettings,
} from "@/lib/policy-settings";
import {
  currentPolicyVersionFromSettings,
  formatPolicySeconds,
  getPolicyCacheLabel,
  getPolicyDriftAlerts,
  getPolicyRolloutStats,
  type PolicyDriftAlert,
  type PolicyRolloutAgent,
} from "@/lib/policy-rollout";

type SecurityExportRouteKey =
  | "route_runtime_events"
  | "route_policy_rollout"
  | "route_delivery_failures"
  | "route_incident_cases";

type SecurityExportDestinationSettings = {
  id?: string;
  name?: string;
  enabled?: boolean;
  webhook_url?: string;
  include_payload?: boolean;
} & Partial<Record<SecurityExportRouteKey, boolean>>;

type SettingsRow = {
  id: string;
  telemetry_mode?: "minimal" | "standard";
  notifications_enabled?: boolean;
  runtime_policy_version?: string;
  runtime_policy?: RuntimePolicySettings;
  security_export?: {
    enabled?: boolean;
    webhook_url?: string;
    include_payload?: boolean;
    destinations?: SecurityExportDestinationSettings[];
  } & Partial<Record<SecurityExportRouteKey, boolean>>;
  updated_at?: string;
};

const initialSettings: SettingsRow = {
  id: "current",
  telemetry_mode: "minimal",
  notifications_enabled: true,
  runtime_policy: defaultRuntimePolicySettings,
  security_export: {
    enabled: false,
    webhook_url: "",
    include_payload: false,
    route_runtime_events: true,
    route_policy_rollout: true,
    route_delivery_failures: true,
    route_incident_cases: true,
  },
};

function panelStyle(): React.CSSProperties {
  return {
    border: "1px solid var(--panel-border)",
    borderRadius: 18,
    background: "var(--panel-bg)",
    boxShadow: "0 12px 36px var(--shadow-color)",
  };
}

function policyCacheTone(cache?: PolicyRolloutAgent["runtime_policy_cache"]) {
  const label = getPolicyCacheLabel(cache);
  if (label === "fresh") return { background: "rgba(34,197,94,0.12)", color: "#22c55e" };
  if (label === "stale") return { background: "rgba(234,179,8,0.12)", color: "#eab308" };
  if (label === "attention") return { background: "rgba(239,68,68,0.12)", color: "#ef4444" };
  return { background: "rgba(148,163,184,0.12)", color: "var(--text-secondary)" };
}

function parseReviewerIds(value: string) {
  const seen = new Set<string>();
  const reviewers: string[] = [];
  for (const item of value.split(/[\s,]+/)) {
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    reviewers.push(id);
  }
  return reviewers.slice(0, 10);
}

const runtimePolicyFields: Array<{
  key: keyof Pick<
    RuntimePolicySettings,
    "command_default" | "file_default" | "url_default" | "package_default" | "output_default"
  >;
  label: string;
  description: string;
}> = [
  {
    key: "command_default",
    label: "Commands",
    description: "Shell execution, scripts, and local process starts.",
  },
  {
    key: "file_default",
    label: "Files",
    description: "Writes, deletes, and sensitive path reads.",
  },
  {
    key: "url_default",
    label: "URLs",
    description: "Outbound fetches, callbacks, and download targets.",
  },
  {
    key: "package_default",
    label: "Packages",
    description: "Installers, lockfile changes, and supply-chain checks.",
  },
  {
    key: "output_default",
    label: "Outputs",
    description: "Response scanning, PII redaction, and secret leakage.",
  },
];

const mcpPolicyFields: Array<{
  key: keyof Pick<RuntimePolicySettings, "mcp_unknown" | "mcp_risky">;
  label: string;
  description: string;
}> = [
  {
    key: "mcp_unknown",
    label: "Unknown MCP servers",
    description: "Servers not seen in your allow, ask, or deny lists.",
  },
  {
    key: "mcp_risky",
    label: "Risky MCP tool calls",
    description: "Shell wrappers, broad filesystem access, network egress, and credential access.",
  },
];

const securityExportRouteFields: Array<{
  key: SecurityExportRouteKey;
  label: string;
  description: string;
}> = [
  {
    key: "route_runtime_events",
    label: "Runtime deny events",
    description: "Denied and critical command, file, URL, package, MCP, and output decisions.",
  },
  {
    key: "route_policy_rollout",
    label: "Policy rollout reminders",
    description: "Bulk reconnect reminders for agents enforcing stale or missing policy.",
  },
  {
    key: "route_delivery_failures",
    label: "Delivery failure escalations",
    description: "Overdue webhook delivery failures that need owner follow-up.",
  },
  {
    key: "route_incident_cases",
    label: "Incident case escalations",
    description: "Open, overdue, assigned, or expired-snooze incident cases.",
  },
];

function isSecurityExportRouteEnabled(
  securityExport: Partial<Record<SecurityExportRouteKey, boolean>> | undefined,
  key: SecurityExportRouteKey,
) {
  return securityExport?.[key] !== false;
}

function serializeSecurityExportDestination(destination: SecurityExportDestinationSettings, index: number) {
  return {
    id: destination.id || `destination_${index + 1}`,
    name: destination.name?.trim() || `Destination ${index + 1}`,
    enabled: Boolean(destination.enabled),
    webhook_url: destination.webhook_url?.trim() ?? "",
    include_payload: Boolean(destination.include_payload),
    route_runtime_events: isSecurityExportRouteEnabled(destination, "route_runtime_events"),
    route_policy_rollout: isSecurityExportRouteEnabled(destination, "route_policy_rollout"),
    route_delivery_failures: isSecurityExportRouteEnabled(destination, "route_delivery_failures"),
    route_incident_cases: isSecurityExportRouteEnabled(destination, "route_incident_cases"),
  };
}

function ModeButtons({
  value,
  onChange,
}: {
  value: RuntimePolicyMode;
  onChange: (value: RuntimePolicyMode) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {(["allow", "ask", "deny"] as RuntimePolicyMode[]).map((mode) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            style={{
              minWidth: 62,
              padding: "8px 10px",
              borderRadius: 10,
              border: active ? "1px solid var(--text-primary)" : "1px solid var(--panel-border)",
              background: active ? "rgba(56,98,232,0.14)" : "transparent",
              color: "var(--text-primary)",
              cursor: "pointer",
              textTransform: "uppercase",
              fontSize: 11,
              letterSpacing: "0.04em",
            }}
          >
            {mode}
          </button>
        );
      })}
    </div>
  );
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsRow>(initialSettings);
  const [agentPolicies, setAgentPolicies] = useState<PolicyRolloutAgent[]>([]);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(() => new Set());
  const [policyDraft, setPolicyDraft] = useState("");
  const [policySchemaErrors, setPolicySchemaErrors] = useState<string[]>([]);
  const [policyImportNotice, setPolicyImportNotice] = useState<string | null>(null);
  const [publishingPolicy, setPublishingPolicy] = useState(false);
  const [requestingPolicyApproval, setRequestingPolicyApproval] = useState(false);
  const [policyReviewerIds, setPolicyReviewerIds] = useState("");
  const [testingSecurityExport, setTestingSecurityExport] = useState(false);
  const [securityExportNotice, setSecurityExportNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const session = await getSession();
        if (!session?.user) {
          if (!cancelled) setError("Please sign in to view settings.");
          return;
        }
        const uid = session.user.id;
        if (isDemoMode()) {
          if (!cancelled) {
            setSettings({
              ...initialSettings,
              runtime_policy_version: "pol_demo_locked_down",
              updated_at: "2026-05-06T11:18:00.000Z",
            });
            setAgentPolicies(demoAgents);
          }
          return;
        }
        const [snap, agentsSnap] = await Promise.all([
          getDoc(getUserDocRef(uid, "settings", "current")),
          getDocs(getUserCollectionRef(uid, "agents")),
        ]);
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as SettingsRow;
          setSettings({
            ...initialSettings,
            ...data,
            runtime_policy: normalizeRuntimePolicySettings(data.runtime_policy),
          });
        }
        setAgentPolicies(
          agentsSnap.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<PolicyRolloutAgent, "id">),
          }))
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const session = await getSession();
      if (!session?.user) {
        setError("Please sign in to save settings.");
        return;
      }
      const uid = session.user.id;
      await setDoc(
        getUserDocRef(uid, "settings", "current"),
        {
          telemetry_mode: settings.telemetry_mode ?? "minimal",
          notifications_enabled: Boolean(settings.notifications_enabled),
          runtime_policy: serializeRuntimePolicySettings(
            settings.runtime_policy ?? defaultRuntimePolicySettings
          ),
          security_export: {
            enabled: Boolean(settings.security_export?.enabled),
            webhook_url: settings.security_export?.webhook_url?.trim() ?? "",
            include_payload: Boolean(settings.security_export?.include_payload),
            route_runtime_events: isSecurityExportRouteEnabled(settings.security_export, "route_runtime_events"),
            route_policy_rollout: isSecurityExportRouteEnabled(settings.security_export, "route_policy_rollout"),
            route_delivery_failures: isSecurityExportRouteEnabled(settings.security_export, "route_delivery_failures"),
            route_incident_cases: isSecurityExportRouteEnabled(settings.security_export, "route_incident_cases"),
            destinations: (settings.security_export?.destinations ?? []).map(serializeSecurityExportDestination),
          },
          updated_at: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function acknowledgeDrift(alert: PolicyDriftAlert, action: "mark_reviewed" | "reconnect_requested") {
    const key = `${alert.agent.id}:${action}`;
    setAcknowledgingId(key);
    setError(null);
    try {
      if (!isDemoMode()) {
        const response = await fetch("/api/v1/policy-drift-ack", {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            agent_id: alert.agent.id,
            action,
            current_policy_version: policyVersion,
            alert_label: alert.label,
            reason: alert.reason,
            runtime_policy_cache: alert.agent.runtime_policy_cache ?? null,
          }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? "Failed to acknowledge policy drift.");
        }
      }
      setAcknowledgedIds((prev) => {
        const next = new Set(prev);
        next.add(alert.agent.id);
        return next;
      });
      if (action === "reconnect_requested") {
        window.location.assign("/onboarding");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to acknowledge policy drift.");
    } finally {
      setAcknowledgingId(null);
    }
  }

  function applyPolicyAsCodeDraft() {
    const result = parseRuntimePolicyAsCodeJson(policyDraft || policyAsCode);
    if (!result.ok) {
      setPolicySchemaErrors(result.errors);
      setPolicyImportNotice(null);
      return;
    }
    setSettings((prev) => ({
      ...prev,
      runtime_policy: result.settings,
    }));
    setPolicyDraft(renderRuntimePolicyAsCode(result.settings));
    setPolicySchemaErrors([]);
    setPolicyImportNotice("Policy-as-code import applied.");
  }

  async function copyPolicyAsCode() {
    try {
      await navigator.clipboard.writeText(policyDraft || policyAsCode);
      setPolicyImportNotice("Policy-as-code JSON copied.");
      setPolicySchemaErrors([]);
    } catch {
      setPolicySchemaErrors(["Clipboard copy failed."]);
      setPolicyImportNotice(null);
    }
  }

  async function publishPolicy() {
    setPublishingPolicy(true);
    setPolicySchemaErrors([]);
    setPolicyImportNotice(null);
    try {
      const result = parseRuntimePolicyAsCodeJson(policyDraft || policyAsCode);
      if (!result.ok) {
        setPolicySchemaErrors(result.errors);
        return;
      }
      if (isDemoMode()) {
        setSettings((prev) => ({
          ...prev,
          runtime_policy: result.settings,
          runtime_policy_version: "pol_demo_published",
          updated_at: new Date().toISOString(),
        }));
        setPolicyImportNotice("Policy published with approval evidence.");
        return;
      }
      const session = await getSession();
      const response = await fetch("/api/v1/policy-publish", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          policy_as_code: JSON.parse(policyDraft || policyAsCode),
          approval_note: "Approved in dashboard policy-as-code workflow.",
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        policy_version?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Policy publish failed.");
      setSettings((prev) => ({
        ...prev,
        runtime_policy: result.settings,
        runtime_policy_version: payload.policy_version ?? prev.runtime_policy_version,
        updated_at: new Date().toISOString(),
      }));
      setPolicyImportNotice("Policy published with approval evidence.");
    } catch (err) {
      setPolicySchemaErrors([err instanceof Error ? err.message : "Policy publish failed."]);
    } finally {
      setPublishingPolicy(false);
    }
  }

  async function requestPolicyApproval() {
    setRequestingPolicyApproval(true);
    setPolicySchemaErrors([]);
    setPolicyImportNotice(null);
    try {
      const result = parseRuntimePolicyAsCodeJson(policyDraft || policyAsCode);
      if (!result.ok) {
        setPolicySchemaErrors(result.errors);
        return;
      }
      if (isDemoMode()) {
        setPolicyImportNotice("Two-person policy approval requested.");
        return;
      }
      const session = await getSession();
      const response = await fetch("/api/v1/policy-publish-request", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          policy_as_code: JSON.parse(policyDraft || policyAsCode),
          approval_note: "Requested in dashboard policy-as-code workflow.",
          required_approvals: 2,
          reviewer_user_ids: parseReviewerIds(policyReviewerIds),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; request_id?: string };
      if (!response.ok) throw new Error(payload.error ?? "Policy approval request failed.");
      setPolicyImportNotice(`Two-person policy approval requested: ${payload.request_id ?? "pending"}.`);
    } catch (err) {
      setPolicySchemaErrors([err instanceof Error ? err.message : "Policy approval request failed."]);
    } finally {
      setRequestingPolicyApproval(false);
    }
  }

  async function sendSecurityExportTest() {
    setTestingSecurityExport(true);
    setSecurityExportNotice(null);
    setError(null);
    try {
      if (isDemoMode()) {
        setSecurityExportNotice("Demo security export test prepared.");
        return;
      }
      const session = await getSession();
      const response = await fetch("/api/v1/security-export-test", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        delivered?: number;
        failed?: number;
        skipped?: number;
      };
      if (!response.ok) throw new Error(payload.error ?? "Security export test failed.");
      if ((payload.delivered ?? 0) > 0) {
        setSecurityExportNotice("Security export test delivered.");
      } else if ((payload.failed ?? 0) > 0) {
        setSecurityExportNotice("Security export test failed. Check the delivery failures page.");
      } else {
        setSecurityExportNotice("Security export test skipped. Enable export and save a valid webhook URL first.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Security export test failed.");
    } finally {
      setTestingSecurityExport(false);
    }
  }

  function updateSecurityExportDestination(index: number, patch: Partial<SecurityExportDestinationSettings>) {
    setSettings((prev) => {
      const destinations = [...(prev.security_export?.destinations ?? [])];
      destinations[index] = {
        ...(destinations[index] ?? {}),
        ...patch,
      };
      return {
        ...prev,
        security_export: {
          ...(prev.security_export ?? {}),
          destinations,
        },
      };
    });
  }

  function addSecurityExportDestination() {
    setSettings((prev) => {
      const destinations = prev.security_export?.destinations ?? [];
      const nextIndex = destinations.length + 1;
      return {
        ...prev,
        security_export: {
          ...(prev.security_export ?? {}),
          destinations: [
            ...destinations,
            {
              id: `destination_${Date.now().toString(36)}`,
              name: `Destination ${nextIndex}`,
              enabled: true,
              webhook_url: "",
              include_payload: false,
              route_runtime_events: true,
              route_policy_rollout: false,
              route_delivery_failures: false,
              route_incident_cases: false,
            },
          ],
        },
      };
    });
  }

  function removeSecurityExportDestination(index: number) {
    setSettings((prev) => ({
      ...prev,
      security_export: {
        ...(prev.security_export ?? {}),
        destinations: (prev.security_export?.destinations ?? []).filter((_, itemIndex) => itemIndex !== index),
      },
    }));
  }

  if (loading) {
    return (
      <div style={{ padding: 40, maxWidth: 1000, margin: "0 auto" }}>
        <div style={panelStyle()}>
          <div style={{ padding: 28, color: "var(--text-secondary)" }}>Loading settings…</div>
        </div>
      </div>
    );
  }

  const policyVersion = currentPolicyVersionFromSettings(settings);
  const policyAsCode = renderRuntimePolicyAsCode(settings.runtime_policy ?? defaultRuntimePolicySettings);
  const rollout = getPolicyRolloutStats(agentPolicies, policyVersion);
  const driftAlerts = getPolicyDriftAlerts(agentPolicies, policyVersion);
  const visibleDriftAlerts = driftAlerts.filter((alert) => !acknowledgedIds.has(alert.agent.id));

  return (
    <div style={{ padding: 40, maxWidth: 1000, margin: "0 auto" }}>
      <section style={{ ...panelStyle(), padding: 28 }}>
        <div style={{ color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em" }}>PREFERENCES</div>
        <h1 style={{ margin: "10px 0 12px", fontSize: 36, lineHeight: "42px", color: "var(--text-primary)" }}>
          Privacy-first defaults, without hidden telemetry.
        </h1>
        <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: "26px", maxWidth: 820 }}>
          AIDR keeps telemetry minimal by default. Adjust the signal level and notification summaries
          for the account that owns these connected agents.
        </p>
      </section>

      {error ? (
        <div style={{ ...panelStyle(), marginTop: 18, padding: 16 }}>
          <div className="mono">{error}</div>
        </div>
      ) : null}

      <section id="telemetry-mode" style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Telemetry mode</div>
        <div style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 13, lineHeight: "22px" }}>
          Minimal mode keeps payload details reduced. Standard mode preserves more context for debugging
          and internal analysis.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 16 }}>
          {[
            {
              id: "minimal",
              title: "Minimal",
              body: "Metadata, verdict, severity, and timestamps only.",
            },
            {
              id: "standard",
              title: "Standard",
              body: "Includes richer payload details for debugging sessions.",
            },
          ].map((item) => {
            const active = settings.telemetry_mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    telemetry_mode: item.id as "minimal" | "standard",
                  }))
                }
                style={{
                  ...panelStyle(),
                  padding: 18,
                  textAlign: "left",
                  cursor: "pointer",
                  borderColor: active ? "var(--text-primary)" : "var(--panel-border)",
                  background: active ? "linear-gradient(180deg, rgba(56,98,232,0.12), var(--panel-bg))" : "var(--panel-bg)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{item.title}</div>
                  <div className="mono" style={{ color: active ? "var(--text-primary)" : "var(--text-faint)" }}>
                    {active ? "selected" : ""}
                  </div>
                </div>
                <div style={{ marginTop: 8, color: "var(--text-secondary)", lineHeight: "22px", fontSize: 13 }}>
                  {item.body}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section id="policy-rollout" style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 720 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>
              Runtime policy
            </div>
            <div style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 13, lineHeight: "22px" }}>
              Set the default decision AIDR should apply before an agent runs a tool call. MCP policy
              is stored with the account so connector defaults and dashboard controls can share the same contract.
            </div>
          </div>
          <div className="mono" style={{ color: "var(--text-faint)", fontSize: 12, alignSelf: "center" }}>
            local-first policy
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
          {runtimePolicyFields.map((field) => (
            <div
              key={field.key}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(180px, 1fr) auto",
                gap: 14,
                alignItems: "center",
                padding: 14,
                borderRadius: 14,
                border: "1px solid var(--panel-border)",
                background: "var(--bg-secondary)",
              }}
            >
              <div>
                <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{field.label}</div>
                <div style={{ marginTop: 4, color: "var(--text-faint)", fontSize: 12, lineHeight: "18px" }}>
                  {field.description}
                </div>
              </div>
              <ModeButtons
                value={(settings.runtime_policy ?? defaultRuntimePolicySettings)[field.key]}
                onChange={(mode) =>
                  setSettings((prev) => ({
                    ...prev,
                    runtime_policy: {
                      ...(prev.runtime_policy ?? defaultRuntimePolicySettings),
                      [field.key]: mode,
                    },
                  }))
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section id="mcp-enforcement" style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>MCP enforcement</div>
        <div style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 13, lineHeight: "22px" }}>
          AIDR treats MCP servers as execution surfaces. Unknown servers can require approval, and risky
          tool calls can be denied even when the server itself is known.
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {mcpPolicyFields.map((field) => (
            <div
              key={field.key}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(180px, 1fr) auto",
                gap: 14,
                alignItems: "center",
                padding: 14,
                borderRadius: 14,
                border: "1px solid var(--panel-border)",
                background: "var(--bg-secondary)",
              }}
            >
              <div>
                <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{field.label}</div>
                <div style={{ marginTop: 4, color: "var(--text-faint)", fontSize: 12, lineHeight: "18px" }}>
                  {field.description}
                </div>
              </div>
              <ModeButtons
                value={(settings.runtime_policy ?? defaultRuntimePolicySettings)[field.key]}
                onChange={(mode) =>
                  setSettings((prev) => ({
                    ...prev,
                    runtime_policy: {
                      ...(prev.runtime_policy ?? defaultRuntimePolicySettings),
                      [field.key]: mode,
                    },
                  }))
                }
              />
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginTop: 16,
          }}
        >
          {[
            {
              key: "mcp_allow_servers" as const,
              label: "Allowed servers",
              hint: "Auto-approve trusted read-only servers.",
            },
            {
              key: "mcp_require_approval_servers" as const,
              label: "Approval servers",
              hint: "Ask before these servers execute tools.",
            },
            {
              key: "mcp_deny_servers" as const,
              label: "Denied servers",
              hint: "Block these servers before execution.",
            },
          ].map((field) => (
            <label key={field.key} style={{ display: "grid", gap: 8 }}>
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{field.label}</span>
              <span style={{ color: "var(--text-faint)", fontSize: 12, lineHeight: "18px" }}>{field.hint}</span>
              <textarea
                value={formatServerList((settings.runtime_policy ?? defaultRuntimePolicySettings)[field.key])}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    runtime_policy: {
                      ...(prev.runtime_policy ?? defaultRuntimePolicySettings),
                      [field.key]: parseServerList(event.target.value),
                    },
                  }))
                }
                rows={4}
                placeholder="filesystem&#10;github&#10;memory"
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
          ))}
        </div>
      </section>

      <section style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>
              Policy-as-code contract
            </div>
            <div style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 13, lineHeight: "22px" }}>
              This is the normalized contract agents fetch before enforcing shell, filesystem, network,
              package, output, and MCP tool-call decisions.
            </div>
          </div>
          <span className="mono" style={{ color: "var(--text-faint)", fontSize: 12, alignSelf: "center" }}>
            aidr.policy.v1
          </span>
        </div>
        <pre
          className="mono"
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 14,
            border: "1px solid var(--panel-border)",
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            fontSize: 12,
            lineHeight: "18px",
            overflow: "auto",
            maxHeight: 420,
          }}
        >
          {policyAsCode}
        </pre>
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <textarea
            value={policyDraft || policyAsCode}
            onChange={(event) => {
              setPolicyDraft(event.target.value);
              setPolicySchemaErrors([]);
              setPolicyImportNotice(null);
            }}
            rows={12}
            aria-label="Policy-as-code JSON editor"
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "vertical",
              padding: 14,
              borderRadius: 14,
              border: "1px solid var(--panel-border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              lineHeight: "18px",
            }}
          />
          {policySchemaErrors.length > 0 ? (
            <div
              style={{
                border: "1px solid rgba(239,68,68,0.34)",
                borderRadius: 12,
                background: "rgba(239,68,68,0.1)",
                padding: 12,
                color: "#ef4444",
                fontSize: 12,
                lineHeight: "18px",
              }}
            >
              {policySchemaErrors.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          ) : null}
          {policyImportNotice ? (
            <div className="mono" style={{ color: "var(--text-secondary)", fontSize: 12 }}>
              {policyImportNotice}
            </div>
          ) : null}
          <label style={{ display: "grid", gap: 6, color: "var(--text-secondary)", fontSize: 13 }}>
            Reviewer user IDs
            <input
              value={policyReviewerIds}
              onChange={(event) => setPolicyReviewerIds(event.target.value)}
              placeholder="user_2, user_3"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid var(--panel-border)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
              }}
            />
            <span style={{ color: "var(--text-faint)", fontSize: 12 }}>
              Leave blank for any teammate except the requester; add IDs to assign exact reviewers.
            </span>
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={applyPolicyAsCodeDraft}
              style={{
                padding: "9px 12px",
                borderRadius: 12,
                border: "1px solid var(--text-primary)",
                background: "var(--text-primary)",
                color: "var(--bg-primary)",
                cursor: "pointer",
              }}
            >
              Validate and apply
            </button>
            <button
              type="button"
              onClick={copyPolicyAsCode}
              style={{
                padding: "9px 12px",
                borderRadius: 12,
                border: "1px solid var(--panel-border)",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              Copy JSON
            </button>
            <button
              type="button"
              disabled={publishingPolicy}
              onClick={publishPolicy}
              style={{
                padding: "9px 12px",
                borderRadius: 12,
                border: "1px solid var(--panel-border)",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: "pointer",
                opacity: publishingPolicy ? 0.65 : 1,
              }}
            >
              {publishingPolicy ? "Publishing…" : "Publish with approval"}
            </button>
            <button
              type="button"
              disabled={requestingPolicyApproval}
              onClick={requestPolicyApproval}
              style={{
                padding: "9px 12px",
                borderRadius: 12,
                border: "1px solid var(--panel-border)",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: "pointer",
                opacity: requestingPolicyApproval ? 0.65 : 1,
              }}
            >
              {requestingPolicyApproval ? "Requesting…" : "Request two-person approval"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPolicyDraft("");
                setPolicySchemaErrors([]);
                setPolicyImportNotice(null);
              }}
              style={{
                padding: "9px 12px",
                borderRadius: 12,
                border: "1px solid var(--panel-border)",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              Reset editor
            </button>
          </div>
        </div>
      </section>

      <section style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Policy rollout</div>
            <div style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 13, lineHeight: "22px" }}>
              Runtime agents report the cached account policy they will enforce before tool calls run.
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/policy-rollout" style={{ color: "var(--text-primary)", fontSize: 13 }}>
              Open rollout drilldown
            </Link>
            <div className="mono" style={{ color: "var(--text-faint)", fontSize: 12 }}>
              version {policyVersion}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 10,
            marginTop: 16,
          }}
        >
          {[
            ["current", rollout.current],
            ["fresh", rollout.fresh],
            ["stale", rollout.stale],
            ["unknown", rollout.unknown],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                border: "1px solid var(--panel-border)",
                borderRadius: 14,
                background: "var(--bg-secondary)",
                padding: 14,
              }}
            >
              <div className="mono" style={{ color: "var(--text-faint)", fontSize: 11 }}>
                {label}
              </div>
              <div style={{ marginTop: 8, color: "var(--text-primary)", fontSize: 24, fontWeight: 700 }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {visibleDriftAlerts.length > 0 ? (
            <div
              style={{
                display: "grid",
                gap: 10,
                border: "1px solid rgba(234,179,8,0.38)",
                borderRadius: 14,
                background: "rgba(234,179,8,0.08)",
                padding: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "var(--text-primary)", fontWeight: 700 }}>Policy drift alerts</div>
                  <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 12, lineHeight: "18px" }}>
                    {visibleDriftAlerts.length} agent{visibleDriftAlerts.length === 1 ? "" : "s"} need cache refresh or review.
                  </div>
                </div>
                <span className="mono" style={{ color: "var(--text-faint)", fontSize: 11, alignSelf: "center" }}>
                  audit-backed
                </span>
              </div>
              {visibleDriftAlerts.slice(0, 5).map((alert) => (
                <div
                  key={alert.agent.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(220px, 1fr) auto",
                    gap: 12,
                    alignItems: "center",
                    borderTop: "1px solid rgba(234,179,8,0.24)",
                    paddingTop: 10,
                  }}
                >
                  <div>
                    <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                      {alert.agent.name ?? alert.agent.id}
                    </div>
                    <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 12, lineHeight: "18px" }}>
                      {alert.reason}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      disabled={acknowledgingId === `${alert.agent.id}:mark_reviewed`}
                      onClick={() => acknowledgeDrift(alert, "mark_reviewed")}
                      style={{
                        border: "1px solid var(--panel-border)",
                        borderRadius: 10,
                        background: "transparent",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        fontSize: 12,
                        padding: "7px 9px",
                      }}
                    >
                      {acknowledgingId === `${alert.agent.id}:mark_reviewed` ? "Saving…" : "Mark reviewed"}
                    </button>
                    <Link
                      href={`/agents/${encodeURIComponent(alert.agent.id)}`}
                      style={{ color: "var(--text-primary)", fontSize: 12 }}
                    >
                      Open agent
                    </Link>
                    <Link
                      href={`/events?agent=${encodeURIComponent(alert.agent.id)}`}
                      style={{ color: "var(--text-primary)", fontSize: 12 }}
                    >
                      Review events
                    </Link>
                    <button
                      type="button"
                      disabled={acknowledgingId === `${alert.agent.id}:reconnect_requested`}
                      onClick={() => acknowledgeDrift(alert, "reconnect_requested")}
                      style={{
                        border: "1px solid var(--text-primary)",
                        borderRadius: 10,
                        background: "var(--text-primary)",
                        color: "var(--bg-primary)",
                        cursor: "pointer",
                        fontSize: 12,
                        padding: "7px 9px",
                      }}
                    >
                      {acknowledgingId === `${alert.agent.id}:reconnect_requested` ? "Saving…" : "Reconnect"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {agentPolicies.length === 0 ? (
            <div
              style={{
                border: "1px solid var(--panel-border)",
                borderRadius: 14,
                background: "var(--bg-secondary)",
                padding: 14,
                color: "var(--text-secondary)",
                fontSize: 13,
              }}
            >
              No agents have reported runtime policy cache metadata yet.
            </div>
          ) : (
            agentPolicies.map((agent) => {
              const cache = agent.runtime_policy_cache;
              const tone = policyCacheTone(cache);
              const label = getPolicyCacheLabel(cache);
              return (
                <div
                  key={agent.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(220px, 1fr) auto",
                    gap: 14,
                    alignItems: "center",
                    border: "1px solid var(--panel-border)",
                    borderRadius: 14,
                    background: "var(--bg-secondary)",
                    padding: 14,
                  }}
                >
                  <div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                        {agent.name ?? agent.id}
                      </span>
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
                    title={`source ${cache?.source ?? "missing"}`}
                    style={{
                      ...tone,
                      padding: "6px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    policy {label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section id="security-export" style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Security export</div>
        <div style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 13, lineHeight: "22px" }}>
          Send deny and critical runtime events, policy rollout reminders, delivery failure escalations,
          and incident case escalations to a SIEM or webhook receiver. Payload export stays off unless
          you explicitly enable it.
        </div>

        <label style={{ display: "inline-flex", gap: 10, alignItems: "center", marginTop: 16 }}>
          <input
            type="checkbox"
            checked={Boolean(settings.security_export?.enabled)}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                security_export: {
                  ...(prev.security_export ?? {}),
                  enabled: event.target.checked,
                },
              }))
            }
            style={{ width: 18, height: 18 }}
          />
          <span style={{ color: "var(--text-primary)" }}>Enable deny and critical event export</span>
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
            marginTop: 16,
          }}
        >
          {securityExportRouteFields.map((route) => (
            <label
              key={route.key}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: 10,
                alignItems: "start",
                padding: 12,
                borderRadius: 12,
                border: "1px solid var(--panel-border)",
                background: "var(--bg-secondary)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={isSecurityExportRouteEnabled(settings.security_export, route.key)}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    security_export: {
                      ...(prev.security_export ?? {}),
                      [route.key]: event.target.checked,
                    },
                  }))
                }
                style={{ width: 18, height: 18, marginTop: 1 }}
              />
              <span>
                <span style={{ display: "block", color: "var(--text-primary)", fontWeight: 600, fontSize: 13 }}>
                  {route.label}
                </span>
                <span style={{ display: "block", color: "var(--text-secondary)", fontSize: 12, lineHeight: "18px", marginTop: 4 }}>
                  {route.description}
                </span>
              </span>
            </label>
          ))}
        </div>

        <label style={{ display: "grid", gap: 8, marginTop: 16 }}>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Webhook URL</span>
          <input
            type="url"
            value={settings.security_export?.webhook_url ?? ""}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                security_export: {
                  ...(prev.security_export ?? {}),
                  webhook_url: event.target.value,
                },
              }))
            }
            placeholder="https://siem.example/webhooks/aidr"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: 12,
              borderRadius: 12,
              border: "1px solid var(--panel-border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontSize: 13,
            }}
          />
        </label>

        <label style={{ display: "inline-flex", gap: 10, alignItems: "center", marginTop: 16 }}>
          <input
            type="checkbox"
            checked={Boolean(settings.security_export?.include_payload)}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                security_export: {
                  ...(prev.security_export ?? {}),
                  include_payload: event.target.checked,
                },
              }))
            }
            style={{ width: 18, height: 18 }}
          />
          <span style={{ color: "var(--text-primary)" }}>Include raw event payloads in exports</span>
        </label>

        <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>Additional destinations</div>
              <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 4 }}>
                Route the same security stream to separate SOC, SIEM, or team webhooks.
              </div>
            </div>
            <button
              type="button"
              onClick={addSecurityExportDestination}
              style={{
                padding: "9px 12px",
                borderRadius: 12,
                border: "1px solid var(--panel-border)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Add destination
            </button>
          </div>

          {(settings.security_export?.destinations ?? []).length === 0 ? (
            <div
              style={{
                border: "1px solid var(--panel-border)",
                borderRadius: 12,
                background: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                fontSize: 12,
                padding: 12,
              }}
            >
              No additional destinations configured.
            </div>
          ) : (
            (settings.security_export?.destinations ?? []).map((destination, index) => (
              <div
                key={destination.id ?? index}
                style={{
                  border: "1px solid var(--panel-border)",
                  borderRadius: 14,
                  background: "var(--bg-secondary)",
                  padding: 14,
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <label style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(destination.enabled)}
                      onChange={(event) => updateSecurityExportDestination(index, { enabled: event.target.checked })}
                      style={{ width: 18, height: 18 }}
                    />
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                      {destination.name?.trim() || `Destination ${index + 1}`}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeSecurityExportDestination(index)}
                    style={{
                      padding: "7px 9px",
                      borderRadius: 10,
                      border: "1px solid var(--panel-border)",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Remove
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  <label style={{ display: "grid", gap: 7 }}>
                    <span style={{ color: "var(--text-primary)", fontSize: 12, fontWeight: 600 }}>Name</span>
                    <input
                      value={destination.name ?? ""}
                      onChange={(event) => updateSecurityExportDestination(index, { name: event.target.value })}
                      placeholder={`Destination ${index + 1}`}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid var(--panel-border)",
                        background: "var(--panel-bg)",
                        color: "var(--text-primary)",
                        fontSize: 13,
                      }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 7 }}>
                    <span style={{ color: "var(--text-primary)", fontSize: 12, fontWeight: 600 }}>Webhook URL</span>
                    <input
                      type="url"
                      value={destination.webhook_url ?? ""}
                      onChange={(event) => updateSecurityExportDestination(index, { webhook_url: event.target.value })}
                      placeholder="https://soc.example/hooks/aidr"
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid var(--panel-border)",
                        background: "var(--panel-bg)",
                        color: "var(--text-primary)",
                        fontSize: 13,
                      }}
                    />
                  </label>
                </div>

                <label style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(destination.include_payload)}
                    onChange={(event) =>
                      updateSecurityExportDestination(index, { include_payload: event.target.checked })
                    }
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ color: "var(--text-primary)", fontSize: 12 }}>Include raw event payloads</span>
                </label>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {securityExportRouteFields.map((route) => (
                    <label
                      key={route.key}
                      style={{
                        display: "inline-flex",
                        gap: 7,
                        alignItems: "center",
                        border: "1px solid var(--panel-border)",
                        borderRadius: 999,
                        padding: "7px 9px",
                        color: "var(--text-secondary)",
                        fontSize: 12,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSecurityExportRouteEnabled(destination, route.key)}
                        onChange={(event) =>
                          updateSecurityExportDestination(index, { [route.key]: event.target.checked })
                        }
                        style={{ width: 14, height: 14 }}
                      />
                      {route.label}
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={sendSecurityExportTest}
            disabled={testingSecurityExport}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--panel-border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              cursor: testingSecurityExport ? "wait" : "pointer",
            }}
          >
            {testingSecurityExport ? "Sending..." : "Send test export"}
          </button>
          <span style={{ color: "var(--text-faint)", fontSize: 12 }}>
            Uses the saved webhook URL and signs with <span className="mono">AIDR_EXPORT_WEBHOOK_SECRET</span>.
          </span>
        </div>

        {securityExportNotice ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              border: "1px solid var(--panel-border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
            }}
          >
            {securityExportNotice}
          </div>
        ) : null}
      </section>

      <section style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Notifications</div>
        <div style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 13, lineHeight: "22px" }}>
          Keep summaries on for reminders about approvals, reconnections, and billing changes.
        </div>

        <label style={{ display: "inline-flex", gap: 10, alignItems: "center", marginTop: 16 }}>
          <input
            type="checkbox"
            checked={Boolean(settings.notifications_enabled)}
            onChange={(e) => setSettings((prev) => ({ ...prev, notifications_enabled: e.target.checked }))}
            style={{ width: 18, height: 18 }}
          />
          <span style={{ color: "var(--text-primary)" }}>Enable notification summaries</span>
        </label>
      </section>

      <section style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Save changes</div>
            <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13 }}>
              Your preferences apply to future sessions and dashboard views.
            </div>
          </div>
          <div style={{ color: "var(--text-faint)", fontSize: 12 }}>
            {settings.updated_at ? (
              <>
                Last saved <span className="mono">{new Date(settings.updated_at).toLocaleString()}</span>
              </>
            ) : (
              "Not saved yet"
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--text-primary)",
              background: "var(--text-primary)",
              color: "var(--bg-primary)",
              cursor: "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
          <div style={{ alignSelf: "center", color: "var(--text-faint)", fontSize: 12, lineHeight: "20px" }}>
            Changes are stored in your Firebase-backed account profile.
          </div>
        </div>
      </section>
    </div>
  );
}
