"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Runtime = "claude-code" | "cursor" | "vscode" | "openclaw" | "opencode";

const RUNTIMES: Array<{ id: Runtime; label: string; hint: string }> = [
  { id: "claude-code", label: "Claude Code", hint: "terminal-first" },
  { id: "cursor", label: "Cursor", hint: "editor-native" },
  { id: "vscode", label: "VS Code", hint: "workspace extension" },
  { id: "openclaw", label: "OpenClaw", hint: "agent runtime" },
  { id: "opencode", label: "OpenCode", hint: "custom flow" },
];

function makePrompt(runtime: Runtime, dashboardUrl: string | null): string {
  const baseUrl = dashboardUrl?.replace(/\/+$/, "") ?? "";

  return [
    "Install and link AIDR for this runtime with zero manual setup.",
    `Runtime: ${runtime}`,
    "",
    "Requirements:",
    "- Use the official AIDR connector for this runtime.",
    "- Do not ask me for API keys unless browser authorization fails.",
    "",
    "Steps:",
    "1) Detect the runtime and install the correct connector package or extension.",
    "2) Start AIDR bootstrap and show me the device code plus verification URL.",
    baseUrl ? `3) Verification URL must be: ${baseUrl}/verify` : "3) Use the verification URL provided by the dashboard or onboarding flow.",
    "4) Wait until browser authorization is completed.",
    "5) Resume the runtime and verify managed protection is enabled.",
    "6) Print a short final report: connector installed, auth state, first health status.",
  ].join("\n");
}

export default function InstallPromptCard() {
  const dashboardUrl =
    typeof window === "undefined" ? (process.env.NEXT_PUBLIC_APP_URL?.trim() || null) : window.location.origin;
  const [runtime, setRuntime] = useState<Runtime>("claude-code");
  const [copied, setCopied] = useState(false);

  const prompt = useMemo(() => makePrompt(runtime, dashboardUrl), [runtime, dashboardUrl]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section id="install" style={{ width: "100%" }}>
      <div
        style={{
          border: "1px solid var(--panel-border)",
          background: "linear-gradient(180deg, rgba(56,98,232,0.10), var(--panel-bg))",
          borderRadius: 18,
          padding: 22,
          boxShadow: "0 18px 48px var(--shadow-color)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 720 }}>
            <div style={{ color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em" }}>
              PROMPT-FIRST SETUP
            </div>
            <h2 style={{ fontSize: 30, color: "var(--text-primary)", margin: "10px 0 8px" }}>
              Copy one prompt, then let the agent install AIDR for you.
            </h2>
            <p style={{ color: "var(--text-secondary)", margin: 0, lineHeight: "25px" }}>
              Prompt-based setup is the fastest path. The agent installs the connector, prints a short
              device code, and waits for you to authorize it in the browser.
            </p>
          </div>
          <div
            style={{
              minWidth: 220,
              padding: 16,
              borderRadius: 16,
              border: "1px solid var(--panel-border)",
              background: "var(--panel-bg)",
            }}
          >
            <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Verification URL</div>
            <div className="mono" style={{ marginTop: 8, color: "var(--text-primary)", wordBreak: "break-word" }}>
              {(dashboardUrl ?? "").replace(/\/+$/, "")}/verify
            </div>
            <div style={{ marginTop: 12, color: "var(--text-faint)", fontSize: 12, lineHeight: "20px" }}>
              After approval, the dashboard shows the agent as pending and then connected once the first
              heartbeat lands.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
          {RUNTIMES.map((runtimeOption) => {
            const active = runtime === runtimeOption.id;
            return (
              <button
                key={runtimeOption.id}
                type="button"
                onClick={() => setRuntime(runtimeOption.id)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: active ? "1px solid var(--text-primary)" : "1px solid var(--panel-border)",
                  background: active ? "rgba(56,98,232,0.14)" : "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontWeight: 600 }}>{runtimeOption.label}</span>{" "}
                <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{runtimeOption.hint}</span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 16,
            border: "1px solid var(--code-border)",
            background: "var(--code-bg)",
            borderRadius: 16,
            padding: 16,
          }}
        >
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "var(--text-body)",
              fontSize: 13,
              lineHeight: "21px",
            }}
          >
            {prompt}
          </pre>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={copyPrompt}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--text-primary)",
              background: "var(--text-primary)",
              color: "var(--bg-primary)",
              cursor: "pointer",
            }}
          >
            {copied ? "Copied prompt" : "Copy prompt"}
          </button>
          <Link
            href="/login?returnTo=/onboarding"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--panel-border)",
              color: "var(--text-primary)",
              textDecoration: "none",
            }}
          >
            Sign in
          </Link>
          <Link
            href="/verify"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--panel-border)",
              color: "var(--text-secondary)",
              textDecoration: "none",
            }}
          >
            Open verify
          </Link>
        </div>

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {[
            "Copy prompt",
            "Run in agent",
            "Approve code",
            "Watch first heartbeat",
          ].map((step, index) => (
            <div
              key={step}
              style={{
                padding: 14,
                borderRadius: 14,
                border: "1px solid var(--panel-border)",
                background: "var(--bg-secondary)",
              }}
            >
              <div style={{ color: "var(--text-faint)", fontSize: 12 }}>0{index + 1}</div>
              <div style={{ marginTop: 6, color: "var(--text-primary)", fontWeight: 600 }}>{step}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
