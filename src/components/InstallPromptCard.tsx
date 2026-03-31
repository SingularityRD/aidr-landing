"use client";

import { useMemo, useState } from "react";

type Runtime = "claude-code" | "cursor" | "vscode" | "openclaw" | "opencode";

const RUNTIMES: Array<{ id: Runtime; label: string }> = [
  { id: "claude-code", label: "Claude Code" },
  { id: "cursor", label: "Cursor" },
  { id: "vscode", label: "VS Code" },
  { id: "openclaw", label: "OpenClaw" },
  { id: "opencode", label: "OpenCode" },
];

function makePrompt(runtime: Runtime, dashboardUrl: string): string {
  const verifyUrl = `${dashboardUrl.replace(/\/+$/, "")}/verify`;
  return [
    "Install and link Singularity AIDR for this runtime with zero manual setup.",
    `Runtime: ${runtime}`,
    "",
    "Requirements:",
    "- Use the official Singularity AIDR connector for this runtime.",
    "- Do not ask me for API keys unless automatic browser authorization fails.",
    "",
    "Steps:",
    "1) Detect the runtime and install the correct connector package/extension.",
    "2) Start AIDR bootstrap and show me the device code + verification URL.",
    `3) Verification URL must be: ${verifyUrl}`,
    "4) Wait until I confirm browser authorization is completed.",
    "5) Resume runtime and verify managed protection is enabled.",
    "6) Print a short final report: connector installed, auth state, first health status.",
  ].join("\n");
}

export default function InstallPromptCard() {
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://127.0.0.1:4173";
  const [runtime, setRuntime] = useState<Runtime>("claude-code");
  const [copied, setCopied] = useState(false);

  const prompt = useMemo(() => makePrompt(runtime, dashboardUrl), [runtime, dashboardUrl]);

  return (
    <section id="install" style={{ width: "100%" }}>
      <div
        style={{
          border: "1px solid var(--panel-border)",
          background: "var(--panel-bg)",
          borderRadius: 14,
          padding: 20,
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <h2 style={{ fontSize: 28, color: "var(--text-primary)", marginBottom: 8 }}>
          Prompt Install
        </h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 14 }}>
          Copy this prompt and give it directly to your AI agent. It installs the connector, runs
          device auth, and verifies protection.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {RUNTIMES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRuntime(r.id)}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border:
                  runtime === r.id
                    ? "1px solid var(--text-primary)"
                    : "1px solid var(--panel-border)",
                background: runtime === r.id ? "var(--surface-soft)" : "transparent",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div
          style={{
            border: "1px solid var(--code-border)",
            background: "var(--code-bg)",
            borderRadius: 12,
            padding: 14,
          }}
        >
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "var(--text-body)",
              fontSize: 13,
              lineHeight: "20px",
            }}
          >
            {prompt}
          </pre>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(prompt);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
            style={{
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid var(--panel-border)",
              background: "var(--toggle-bg)",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            {copied ? "Copied" : "Copy prompt"}
          </button>
          <a
            href={`${dashboardUrl.replace(/\/+$/, "")}/login`}
            style={{
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid var(--panel-border)",
              color: "var(--text-primary)",
              textDecoration: "none",
            }}
          >
            Open Dashboard Login
          </a>
        </div>
      </div>
    </section>
  );
}

