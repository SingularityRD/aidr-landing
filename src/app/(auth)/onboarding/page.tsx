"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSmartUser } from "@/hooks/useSmartUser";
import { isDemoMode } from "@/lib/demo";
import { demoAgents, demoEvents } from "@/lib/demo-data";
import { getOnboardingProgress } from "@/lib/onboarding-progress";

function panelStyle(): React.CSSProperties {
  return {
    border: "1px solid var(--panel-border)",
    borderRadius: 18,
    background: "var(--panel-bg)",
    boxShadow: "0 12px 36px var(--shadow-color)",
  };
}

export default function OnboardingPage() {
  const { user, isLoaded, isSignedIn } = useSmartUser();
  const router = useRouter();
  const demoMode = isDemoMode();
  const [agentCount, setAgentCount] = useState<number>(() => (demoMode ? demoAgents.length : 0));
  const [eventCount, setEventCount] = useState<number>(() => (demoMode ? demoEvents.length : 0));
  const [installPrompt, setInstallPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push("/login");
      return;
    }
    if (demoMode) return;

    async function loadProgress() {
      const [agentsRes, eventsRes] = await Promise.all([
        fetch("/api/v1/agents/count"),
        fetch("/api/v1/query", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ table: "events", action: "select", head: true, count: "exact" }),
        }),
      ]);
      const agentsData = await agentsRes.json();
      const eventsData = await eventsRes.json();
      setAgentCount(Number(agentsData.count ?? 0));
      setEventCount(Number(eventsData.count ?? 0));
    }

    loadProgress().catch(() => {
      setAgentCount(0);
      setEventCount(0);
    });
  }, [demoMode, isLoaded, isSignedIn, router]);

  async function generatePrompt() {
    const res = await fetch("/api/v1/install-prompt");
    const data = await res.json();
    setInstallPrompt(data.prompt);
  }

  function copyPrompt() {
    if (installPrompt) {
      navigator.clipboard.writeText(installPrompt);
      setPromptCopied(true);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const progress = getOnboardingProgress({
    promptCopied,
    agents: Array.from({ length: agentCount }, () => ({ status: "pending" })),
    events: Array.from({ length: eventCount }, (_, index) => ({ id: `event-${index}` })),
  });

  if (!isLoaded) {
    return (
      <div className="stack" style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ ...panelStyle(), padding: 40, textAlign: "center" }}>
          <div style={{ color: "var(--text-faint)" }}>Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
      {/* Hero */}
      <section style={{ ...panelStyle(), padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 780 }}>
            <div style={{ color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em" }}>
              ONBOARDING
            </div>
            <h1 style={{ fontSize: 38, lineHeight: "44px", margin: "10px 0 10px", color: "var(--text-primary)" }}>
              Welcome{user?.firstName ? `, ${user.firstName}` : ""}
            </h1>
            <p style={{ color: "var(--text-secondary)", lineHeight: "26px", maxWidth: 900, margin: 0 }}>
              You have <b>1 free agent</b> included. Copy the prompt below and paste it into any AI agent
              runtime — Claude Code, Cursor, VS Code, OpenClaw, or OpenCode.
            </p>
            {demoMode && (
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--accent)", fontWeight: 500 }}>
                🎮 Demo Mode — no real auth required
              </div>
            )}
          </div>
          <div
            style={{
              minWidth: 260,
              padding: 18,
              borderRadius: 16,
              border: "1px solid var(--panel-border)",
              background: "linear-gradient(180deg, rgba(56,98,232,0.10), rgba(56,98,232,0.02))",
            }}
          >
            <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Connected agents</div>
            <div className="mono" style={{ marginTop: 8, fontSize: 30, color: "var(--text-primary)" }}>
              {agentCount}
            </div>
            <div style={{ marginTop: 12, color: "var(--text-faint)", fontSize: 12, lineHeight: "20px" }}>
              Each connected installation gets its own identity, audit trail, and seat usage tracking.
            </div>
          </div>
        </div>
      </section>

      <section style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: 20, color: "var(--text-primary)", margin: 0 }}>
              First-run checklist
            </h2>
            <div style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 13 }}>
              {progress.completed} of {progress.total} complete
            </div>
          </div>
          <div
            className="mono"
            style={{
              minWidth: 72,
              textAlign: "right",
              color: "var(--text-primary)",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            {progress.percent}%
          </div>
        </div>
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          {progress.steps.map((step) => (
            <div
              key={step.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid var(--panel-border)",
                background: step.complete ? "rgba(34,197,94,0.10)" : "var(--bg-secondary)",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: step.complete ? "1px solid #22c55e" : "1px solid var(--panel-border)",
                  background: step.complete ? "#22c55e" : "transparent",
                  flex: "0 0 auto",
                }}
              />
              <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{step.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Install Prompt Card */}
      <section style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
        <h2 style={{ fontSize: 22, color: "var(--text-primary)", marginBottom: 8 }}>
          🛡️ Protect Your First Agent
        </h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: "24px", margin: "0 0 16px" }}>
          This prompt works in <b>any</b> AI runtime. Copy, paste, and your agent installs AIDR automatically.
        </p>

        {!installPrompt ? (
          <button
            onClick={generatePrompt}
            style={{
              padding: "12px 24px",
              borderRadius: 12,
              border: "none",
              background: "#3862e8",
              color: "white",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Generate Install Prompt
          </button>
        ) : (
          <>
            <pre
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--panel-border)",
                borderRadius: 12,
                padding: 16,
                fontSize: 13,
                lineHeight: "22px",
                color: "var(--text-primary)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                marginBottom: 12,
              }}
            >
              {installPrompt}
            </pre>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={copyPrompt}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "1px solid var(--panel-border)",
                  background: copied ? "rgba(34,197,94,0.12)" : "var(--surface-soft)",
                  color: copied ? "#22c55e" : "var(--text-primary)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {copied ? "✅ Copied!" : "📋 Copy Prompt"}
              </button>
              <button
                onClick={generatePrompt}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "1px solid var(--panel-border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                🔄 New Prompt
              </button>
            </div>
          </>
        )}
      </section>

      {/* Setup Steps */}
      <section style={{ ...panelStyle(), padding: 24, marginTop: 18 }}>
        <h3 style={{ fontSize: 18, color: "var(--text-primary)", marginBottom: 12 }}>How it works</h3>
        <div style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: "26px" }}>
          1. Click <b>Generate Install Prompt</b> above<br />
          2. Copy the prompt and paste it into your AI agent chat<br />
          3. Your agent runs the install command automatically<br />
          4. Click the authorization link (you&apos;re already signed in)<br />
          5. Done — your agent is now protected 🛡️
        </div>
      </section>

      {/* Upgrade CTA if free seat used */}
      {agentCount >= 1 && (
        <section
          style={{
            ...panelStyle(),
            padding: 24,
            marginTop: 18,
            background: "linear-gradient(135deg, rgba(56,98,232,0.08), rgba(118,75,162,0.08))",
          }}
        >
          <h3 style={{ fontSize: 18, color: "var(--text-primary)", marginBottom: 8 }}>
            Need more agents?
          </h3>
          <p style={{ color: "var(--text-secondary)", lineHeight: "24px", margin: "0 0 12px" }}>
            Upgrade to Pro for <b>$2/month per agent</b>. Protect your entire AI toolkit.
          </p>
          <a
            href="/billing"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "#3862e8",
              color: "white",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Upgrade to Pro →
          </a>
        </section>
      )}
    </div>
  );
}
