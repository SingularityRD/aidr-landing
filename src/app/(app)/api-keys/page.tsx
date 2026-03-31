"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../../lib/supabase/client";

type ApiKeyRow = {
  id: string;
  label: string | null;
  revoked: boolean;
  created_at: string;
};

type EnrollmentTokenRow = {
  id: string;
  label: string | null;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

export default function ApiKeysPage() {
  const [pilotStatus, setPilotStatus] = useState<string>("loading");
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [label, setLabel] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const [enrollTokens, setEnrollTokens] = useState<EnrollmentTokenRow[]>([]);
  const [enrollLabel, setEnrollLabel] = useState("");
  const [createdEnrollToken, setCreatedEnrollToken] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);

  const supabase = getSupabaseBrowserClient();

  const trimmedLabel = useMemo(() => label.trim(), [label]);
  const trimmedEnrollLabel = useMemo(() => enrollLabel.trim(), [enrollLabel]);

  const load = useCallback(async () => {
    setError(null);

    // Get current user
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setError("Please sign in to view API keys");
      setPilotStatus("unknown");
      return;
    }

    setUser(session.user);

    const [pilotRes, keysRes, enrollRes] = await Promise.all([
      supabase.functions.invoke("pilot-status", { method: "GET" }),
      supabase.functions.invoke("api-keys", { method: "GET" }),
      supabase.functions.invoke("enrollment-tokens", { method: "GET" }),
    ]);

    if (pilotRes.error) {
      setPilotStatus("unknown");
    } else {
      const data = (pilotRes.data ?? {}) as Record<string, unknown>;
      setPilotStatus(typeof data.status === "string" ? String(data.status) : "unknown");
    }

    const pilotData = (pilotRes.data ?? {}) as Record<string, unknown>;
    const approved =
      !pilotRes.error && typeof pilotData.status === "string" && pilotData.status === "approved";
    if (!approved) {
      setKeys([]);
      setEnrollTokens([]);
      return;
    }

    if (keysRes.error) {
      setError(keysRes.error.message);
      return;
    }
    const keysData = (keysRes.data ?? {}) as { keys?: ApiKeyRow[] };
    setKeys((keysData.keys ?? []) as ApiKeyRow[]);

    if (enrollRes.error) {
      setError(enrollRes.error.message);
      return;
    }
    const enrollData = (enrollRes.data ?? {}) as { tokens?: EnrollmentTokenRow[] };
    setEnrollTokens((enrollData.tokens ?? []) as EnrollmentTokenRow[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const approved = pilotStatus === "approved";

  if (!user) {
    return (
      <div className="stack" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
        <div
          className="card"
          style={{
            border: "1px solid var(--panel-border)",
            background: "var(--panel-bg)",
            borderRadius: 16,
            padding: 24,
          }}
        >
          <div style={{ color: "var(--text-secondary)" }}>Please sign in to view API keys</div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
      {/* API Keys Section */}
      <div
        className="card"
        style={{
          border: "1px solid var(--panel-border)",
          background: "var(--panel-bg)",
          borderRadius: 16,
          padding: 24,
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 32, marginBottom: 8, color: "var(--text-primary)" }}>API Keys</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
          Advanced: keys and enrollment tokens for manual setups and support.
        </p>

        {approved ? null : (
          <div
            className="notice"
            style={{
              padding: 16,
              borderRadius: 12,
              background: "var(--bg-secondary)",
              border: "1px solid var(--panel-border)",
              marginBottom: 16,
            }}
          >
            <div className="muted small" style={{ fontSize: 12, color: "var(--text-faint)" }}>
              Pilot status
            </div>
            <div className="mono" style={{ color: "var(--text-primary)", marginTop: 4 }}>
              {pilotStatus}
            </div>
            <div className="muted small" style={{ marginTop: 8, color: "var(--text-faint)" }}>
              You must be approved for the pilot before creating keys or enrolling devices. Use the
              Onboarding flow instead.
            </div>
          </div>
        )}

        <label className="label" style={{ display: "block", marginBottom: 16 }}>
          <span style={{ display: "block", fontSize: 14, color: "var(--text-secondary)", marginBottom: 8 }}>
            Label (optional)
          </span>
          <input
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="work-laptop, build-server, etc."
            disabled={!approved || busy}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid var(--panel-border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontSize: 14,
            }}
          />
        </label>

        <div className="row" style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <button
            className="button"
            type="button"
            disabled={busy || !approved}
            onClick={async () => {
              setBusy(true);
              setError(null);
              setCreatedKey(null);
              try {
                const res = await supabase.functions.invoke("api-keys", {
                  method: "POST",
                  body: { action: "create", label: trimmedLabel || null },
                });
                if (res.error) {
                  setError(res.error.message);
                  return;
                }
                const data = (res.data ?? {}) as { api_key?: string };
                if (!data.api_key) {
                  setError("Failed to create API key.");
                  return;
                }
                setCreatedKey(data.api_key);
                setLabel("");
                await load();
              } finally {
                setBusy(false);
              }
            }}
            style={{
              padding: "12px 24px",
              borderRadius: 8,
              border: "none",
              background: approved ? "#3862e8" : "var(--bg-tertiary)",
              color: approved ? "white" : "var(--text-faint)",
              cursor: approved ? "pointer" : "not-allowed",
              fontWeight: 500,
            }}
          >
            Generate key
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={!approved || busy}
            onClick={async () => {
              await load();
            }}
            style={{
              padding: "12px 24px",
              borderRadius: 8,
              border: "1px solid var(--panel-border)",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        {createdKey ? (
          <div
            className="notice"
            style={{
              padding: 16,
              borderRadius: 12,
              background: "rgba(56, 98, 232, 0.1)",
              border: "1px solid rgba(56, 98, 232, 0.3)",
              marginBottom: 16,
            }}
          >
            <div className="muted small" style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 8 }}>
              Copy this key now (shown once):
            </div>
            <div
              className="mono"
              style={{
                color: "var(--text-primary)",
                wordBreak: "break-all",
                fontSize: 14,
                padding: 12,
                background: "var(--bg-secondary)",
                borderRadius: 8,
              }}
            >
              {createdKey}
            </div>
          </div>
        ) : null}
        {error ? (
          <div
            className="notice notice-danger"
            style={{
              padding: 12,
              borderRadius: 8,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#ef4444",
            }}
          >
            {error}
          </div>
        ) : null}
      </div>

      {/* Enrollment Tokens Section */}
      <div
        className="card"
        style={{
          border: "1px solid var(--panel-border)",
          background: "var(--panel-bg)",
          borderRadius: 16,
          padding: 24,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 24, marginBottom: 8, color: "var(--text-primary)" }}>
          Enrollment Tokens
        </h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 16, lineHeight: "24px" }}>
          Enrollment tokens are one-time, short-lived credentials used to bootstrap an agent without
          manually copying an API key. They are stored as SHA-256 hashes only.
        </p>

        <label className="label" style={{ display: "block", marginBottom: 16 }}>
          <span style={{ display: "block", fontSize: 14, color: "var(--text-secondary)", marginBottom: 8 }}>
            Label (optional)
          </span>
          <input
            className="input"
            value={enrollLabel}
            onChange={(e) => setEnrollLabel(e.target.value)}
            placeholder="workstation-1, ci-runner, etc."
            disabled={!approved || busy}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid var(--panel-border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontSize: 14,
            }}
          />
        </label>

        <div className="row" style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <button
            className="button"
            type="button"
            disabled={busy || !approved}
            onClick={async () => {
              setBusy(true);
              setError(null);
              setCreatedEnrollToken(null);
              try {
                const res = await supabase.functions.invoke("enrollment-tokens", {
                  method: "POST",
                  body: { action: "create", label: trimmedEnrollLabel || null },
                });
                if (res.error) {
                  setError(res.error.message);
                  return;
                }
                const data = (res.data ?? {}) as { enrollment_token?: string };
                if (!data.enrollment_token) {
                  setError("Failed to create enrollment token.");
                  return;
                }

                setCreatedEnrollToken(data.enrollment_token);
                setEnrollLabel("");
                await load();
              } finally {
                setBusy(false);
              }
            }}
            style={{
              padding: "12px 24px",
              borderRadius: 8,
              border: "none",
              background: approved ? "#3862e8" : "var(--bg-tertiary)",
              color: approved ? "white" : "var(--text-faint)",
              cursor: approved ? "pointer" : "not-allowed",
              fontWeight: 500,
            }}
          >
            Generate enrollment token
          </button>
        </div>

        {createdEnrollToken ? (
          <div
            className="notice"
            style={{
              padding: 16,
              borderRadius: 12,
              background: "rgba(56, 98, 232, 0.1)",
              border: "1px solid rgba(56, 98, 232, 0.3)",
              marginBottom: 16,
            }}
          >
            <div className="muted small" style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 8 }}>
              Copy this token now (shown once):
            </div>
            <div
              className="mono"
              style={{
                color: "var(--text-primary)",
                wordBreak: "break-all",
                fontSize: 14,
                padding: 12,
                background: "var(--bg-secondary)",
                borderRadius: 8,
              }}
            >
              {createdEnrollToken}
            </div>
          </div>
        ) : null}
      </div>

      {/* API Keys Table */}
      <div
        className="card"
        style={{
          border: "1px solid var(--panel-border)",
          background: "var(--panel-bg)",
          borderRadius: 16,
          padding: 24,
          marginBottom: 20,
          overflow: "auto",
        }}
      >
        <table
          className="table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid var(--table-border)" }}>
              <th style={{ textAlign: "left", padding: "12px 8px" }}>Label</th>
              <th style={{ textAlign: "left", padding: "12px 8px" }}>Created</th>
              <th style={{ textAlign: "left", padding: "12px 8px" }}>Status</th>
              <th style={{ textAlign: "right", padding: "12px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} style={{ borderBottom: "1px solid var(--table-border)" }}>
                <td style={{ padding: "12px 8px" }}>
                  {k.label ?? <span style={{ color: "var(--text-faint)" }}>(no label)</span>}
                </td>
                <td className="mono" style={{ padding: "12px 8px", color: "var(--text-faint)" }}>
                  {new Date(k.created_at).toLocaleString()}
                </td>
                <td style={{ padding: "12px 8px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 500,
                      background: k.revoked
                        ? "rgba(239, 68, 68, 0.1)"
                        : "rgba(34, 197, 94, 0.1)",
                      color: k.revoked ? "#ef4444" : "#22c55e",
                    }}
                  >
                    {k.revoked ? "revoked" : "active"}
                  </span>
                </td>
                <td className="right" style={{ padding: "12px 8px", textAlign: "right" }}>
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={k.revoked || busy}
                    onClick={async () => {
                      setBusy(true);
                      setError(null);
                      try {
                        const res = await supabase.functions.invoke("api-keys", {
                          method: "POST",
                          body: { action: "revoke", id: k.id },
                        });
                        if (res.error) setError(res.error.message);
                        await load();
                      } finally {
                        setBusy(false);
                      }
                    }}
                    style={{
                      padding: "6px 12px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid var(--panel-border)",
                      background: k.revoked ? "transparent" : "transparent",
                      color: k.revoked ? "var(--text-faint)" : "var(--text-secondary)",
                      cursor: k.revoked ? "not-allowed" : "pointer",
                    }}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
            {keys.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: "24px 8px", color: "var(--text-faint)", textAlign: "center" }}>
                  No keys yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Enrollment Tokens Table */}
      <div
        className="card"
        style={{
          border: "1px solid var(--panel-border)",
          background: "var(--panel-bg)",
          borderRadius: 16,
          padding: 24,
          overflow: "auto",
        }}
      >
        <table
          className="table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid var(--table-border)" }}>
              <th style={{ textAlign: "left", padding: "12px 8px" }}>Label</th>
              <th style={{ textAlign: "left", padding: "12px 8px" }}>Created</th>
              <th style={{ textAlign: "left", padding: "12px 8px" }}>Expires</th>
              <th style={{ textAlign: "left", padding: "12px 8px" }}>Status</th>
              <th style={{ textAlign: "right", padding: "12px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {enrollTokens.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid var(--table-border)" }}>
                <td style={{ padding: "12px 8px" }}>
                  {t.label ?? <span style={{ color: "var(--text-faint)" }}>(no label)</span>}
                </td>
                <td className="mono" style={{ padding: "12px 8px", color: "var(--text-faint)" }}>
                  {new Date(t.created_at).toLocaleString()}
                </td>
                <td className="mono" style={{ padding: "12px 8px", color: "var(--text-faint)" }}>
                  {new Date(t.expires_at).toLocaleString()}
                </td>
                <td style={{ padding: "12px 8px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 500,
                      background:
                        t.consumed_at
                          ? "rgba(239, 68, 68, 0.1)"
                          : Date.now() > Date.parse(t.expires_at)
                          ? "rgba(234, 179, 8, 0.1)"
                          : "rgba(34, 197, 94, 0.1)",
                      color: t.consumed_at
                        ? "#ef4444"
                        : Date.now() > Date.parse(t.expires_at)
                        ? "#eab308"
                        : "#22c55e",
                    }}
                  >
                    {t.consumed_at
                      ? "consumed"
                      : Date.now() > Date.parse(t.expires_at)
                      ? "expired"
                      : "active"}
                  </span>
                </td>
                <td className="right" style={{ padding: "12px 8px", textAlign: "right" }}>
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError(null);
                      try {
                        const { error: delErr } = await supabase.functions.invoke(
                          "enrollment-tokens",
                          {
                            method: "POST",
                            body: { action: "delete", id: t.id },
                          }
                        );
                        if (delErr) setError(delErr.message);
                        await load();
                      } finally {
                        setBusy(false);
                      }
                    }}
                    style={{
                      padding: "6px 12px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid var(--panel-border)",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {enrollTokens.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ padding: "24px 8px", color: "var(--text-faint)", textAlign: "center" }}
                >
                  No enrollment tokens yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
