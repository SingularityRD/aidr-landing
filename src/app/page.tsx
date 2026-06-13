"use client";

import Link from "next/link";
import { useSmartUser } from "../hooks/useSmartUser";
import Background from "../components/Background";
import Header from "../components/Header";
import InstallPromptCard from "../components/InstallPromptCard";

export const dynamic = "force-dynamic";

// ── Data ──────────────────────────────────────────────────────────────────────

const detectionLayers = [
  {
    title: "URL Reputation",
    desc: "Cloud-based lookup for malware, phishing, and scam URLs. Works without an API key — privacy-preserving by design.",
    icon: "🔍",
  },
  {
    title: "Local Heuristics",
    desc: "YAML-based regex patterns matching dangerous commands, suspicious URLs, sensitive file paths, credential exposure, and obfuscation techniques.",
    icon: "⚡",
  },
  {
    title: "Package Supply-Chain",
    desc: "Registry existence, file reputation, and age analysis for npm/PyPI packages. Catches typosquats, dependency confusion, and malicious updates.",
    icon: "📦",
  },
  {
    title: "Plugin Scanning",
    desc: "Scans other installed plugins for threats at session start. Detects plugin tampering, suspicious configurations, and command surface exposure.",
    icon: "🧩",
  },
];

const features = [
  {
    title: "Tool-Call Inspection",
    desc: "Intercepts Bash, WebFetch, Write, Edit, Read, Delete — and MCP/plugin tool calls across all major AI coding platforms.",
  },
  {
    title: "Prompt-First Setup",
    desc: "Install by prompt, then finish auth in the browser with zero key copying. No CLI magic, no manual config.",
  },
  {
    title: "Device Authorization",
    desc: "Short-lived codes bootstrap enrollment and unlock managed protection safely. Single-use, user-scoped, time-limited.",
  },
  {
    title: "Incident Correlation",
    desc: "Repeated denials, suspicious retries, and abuse patterns roll into one case. Full audit trail with redacted secrets.",
  },
  {
    title: "Dashboard Sync",
    desc: "Every protected agent reports health, incidents, and entitlement state centrally. Real-time visibility into your fleet.",
  },
  {
    title: "Offline Grace",
    desc: "Enrolled agents keep working when the network drops, within the signed cache window. Never break the agent flow.",
  },
  {
    title: "Output Safety Scanner",
    desc: "Scans agent outputs for leaked credentials, secrets, and sensitive data before they reach the user. Post-tool-use hook.",
  },
  {
    title: "MCP/Tool Inventory",
    desc: "Catalogues all MCP servers and tools at session start. Warns on risky discovered servers before they can cause harm.",
  },
  {
    title: "Audit Redaction",
    desc: "All audit logs automatically redact PII, secrets, and credentials. Compliant logging without manual sanitization.",
  },
  {
    title: "LLM Threat Rules",
    desc: "Detects prompt injection, system prompt extraction, tool misuse, memory poisoning, and jailbreak attempts.",
  },
  {
    title: "Sensitivity Presets",
    desc: "Configurable confidence thresholds (low/medium/high). Control when detections escalate from ask to deny.",
  },
  {
    title: "Fail-Open Design",
    desc: "Every internal error path returns an allow verdict. AIDR never breaks your agent — even when the API is down.",
  },
];

const platforms = [
  {
    name: "Claude Code",
    hook: "PreToolUse",
    tools: "Bash, WebFetch, Write, Edit, Read",
    install: "/plugin install aidr@aidr",
  },
  {
    name: "Cursor",
    hook: "beforeShellExecution + preToolUse",
    tools: "Shell, Write, Edit, Delete, WebFetch, MCP",
    install: "VSIX extension + enable protection",
  },
  {
    name: "VS Code",
    hook: "PreToolUse",
    tools: "Bash, WebFetch, Write, Edit, Read, Delete",
    install: "VSIX extension from marketplace",
  },
  {
    name: "OpenClaw",
    hook: "before_tool_call",
    tools: "exec, web_fetch, write, edit, read, apply_patch",
    install: "openclaw plugins install @singularityrd/aidr-openclaw",
  },
  {
    name: "OpenCode",
    hook: "Plugin API",
    tools: "All tool categories",
    install: "Add plugin path in opencode config",
  },
];

const threatCategories = [
  { name: "Remote Code Execution", severity: "critical", example: "curl pipe to shell, reverse shells" },
  { name: "Credential Theft", severity: "critical", example: "SSH keys, .env, AWS credentials" },
  { name: "Supply Chain Attacks", severity: "high", example: "Typosquat packages, dependency confusion" },
  { name: "Prompt Injection", severity: "high", example: "Direct/indirect injection, system prompt extraction" },
  { name: "Data Exfiltration", severity: "high", example: "Unauthorized network calls, file uploads" },
  { name: "Destructive Operations", severity: "critical", example: "rm -rf, disk wipe, volume delete" },
  { name: "Persistence Mechanisms", severity: "medium", example: "Cron, systemd, LaunchAgents, shell RC" },
  { name: "Obfuscation", severity: "medium", example: "Base64, encoded payloads, hidden commands" },
  { name: "Plugin Tampering", severity: "high", example: "Malicious plugins, modified extensions" },
  { name: "Privilege Escalation", severity: "critical", example: "sudo abuse, setuid, token theft" },
];

const faqs = [
  {
    q: "What is AIDR?",
    a: "Singularity AIDR (AI Agent Detection & Response) is a lightweight security layer that intercepts tool calls made by AI coding agents — like Bash commands, file writes, and web requests — and checks them against multiple threat detection layers before they execute.",
  },
  {
    q: "Does AIDR require cloud connectivity?",
    a: "No. Detection runs locally via YAML-based heuristics. Cloud-based URL reputation is optional and privacy-preserving — no API key needed. Agents with offline grace continue working within a signed cache window even when disconnected.",
  },
  {
    q: "What platforms does AIDR support?",
    a: "Claude Code, Cursor, VS Code, OpenClaw, and OpenCode. Each platform gets native hooks that intercept tool calls at the appropriate integration point.",
  },
  {
    q: "Is AIDR free?",
    a: "1 agent is always free. Additional agents are $5/agent/month (Pro plan), or $4/agent/month billed yearly. Enterprise plans include org-wide policy distribution, audit exports, and dedicated support.",
  },
  {
    q: "How is my data handled?",
    a: "AIDR is privacy-first. Threat rules are data-driven YAML files — no hardcoded patterns. Audit logs automatically redact PII and secrets. The URL reputation API is anonymous and requires no API key. No code, file contents, or prompts are sent to external services.",
  },
  {
    q: "Can AIDR break my agent?",
    a: "AIDR is designed to never break the agent. Every internal error path returns an allow verdict. If the URL reputation API is down, it falls back to heuristics only. Extensions always exit with code 0, and the host decides whether to block based on the JSON response.",
  },
  {
    q: "How do I install AIDR?",
    a: "Install with a single prompt in your AI coding tool. For Claude Code: /plugin install aidr@aidr. On first run, you'll see a verification code and URL — sign in, approve the device, and you're protected.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We use Polar as our payment provider, which supports global payments including credit/debit cards, Apple Pay, and Google Pay. All transactions are processed securely — we never store your payment details.",
  },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const sectionBox: React.CSSProperties = {
  width: "100%",
  marginBottom: 32,
  border: "1px solid var(--panel-border)",
  background: "var(--panel-bg)",
  borderRadius: 16,
  padding: "28px 32px",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "var(--text-faint)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 18,
};

const gridCard: React.CSSProperties = {
  border: "1px solid var(--panel-border)",
  background: "var(--bg-secondary)",
  borderRadius: 14,
  padding: 20,
  transition: "border-color 0.25s ease, box-shadow 0.25s ease",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 10,
  border: "1px solid var(--text-primary)",
  background: "var(--text-primary)",
  color: "var(--bg-primary)",
  textDecoration: "none",
  fontWeight: 500,
  fontSize: 14,
};

const btnSecondary: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 10,
  border: "1px solid var(--panel-border)",
  color: "var(--text-secondary)",
  textDecoration: "none",
  fontSize: 14,
};

// ── Components ────────────────────────────────────────────────────────────────

function Section({ id, children, style }: { id?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section id={id} style={{ ...sectionBox, ...style }}>
      {children}
    </section>
  );
}

function Badge({ children, color = "var(--text-faint)" }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: `${color}18`,
        color,
        marginRight: 4,
        marginBottom: 4,
      }}
    >
      {children}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const { isSignedIn, isLoaded } = useSmartUser();

  return (
    <div className="relative w-full min-h-screen">
      <style jsx global>{`
        @media (max-width: 1100px) {
          .hero-row { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 900px) {
          .features-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .layers-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .platforms-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 640px) {
          .features-grid { grid-template-columns: 1fr !important; }
          .layers-grid { grid-template-columns: 1fr !important; }
          .platforms-grid { grid-template-columns: 1fr !important; }
          .page-main { padding: 16px 16px 60px !important; }
        }
        .detection-flow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .detection-flow .arrow {
          color: var(--text-faint);
          font-size: 18px;
        }
        .severity-critical { color: #ef4444; }
        .severity-high { color: #f59e0b; }
        .severity-medium { color: #3b82f6; }
      `}</style>

      <Background />
      <Header />

      <main
        className="page-main"
        style={{
          position: "relative",
          zIndex: 1,
          padding: "40px 60px 80px",
          maxWidth: 1320,
          margin: "0 auto",
        }}
      >
        {/* ════════════════════════════════════════ HERO ════════════════════ */}
        <section
          className="hero-row"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 32,
            alignItems: "center",
            marginBottom: 40,
          }}
        >
          <div
            style={{
              border: "1px solid var(--panel-border)",
              background: "var(--panel-bg)",
              borderRadius: 16,
              padding: "36px 32px",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <div style={{ ...sectionLabel, marginBottom: 12 }}>
              Edge-first AI Agent Detection & Response
            </div>
            <h1
              style={{
                fontSize: "clamp(30px, 3.6vw, 52px)",
                lineHeight: 1.08,
                color: "var(--text-primary)",
                letterSpacing: "-0.025em",
                marginBottom: 16,
                fontWeight: 600,
              }}
            >
              Security layer for your AI coding agents.
            </h1>
            <p
              style={{
                color: "var(--text-secondary)",
                maxWidth: 520,
                lineHeight: "26px",
                fontSize: 15,
              }}
            >
              Singularity AIDR protects every tool call your AI agent makes — 
              shell commands, file operations, network requests, and MCP actions. 
              Install by prompt, authorize in browser, and go live in minutes. 
              <strong style={{ color: "var(--text-primary)" }}> 1 agent free forever.</strong> 
              Additional agents <strong style={{ color: "var(--text-primary)" }}>$5/agent/month</strong>.
            </p>

            <div style={{ display: "flex", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
              {isLoaded && isSignedIn ? (
                <Link href="/dashboard" style={btnPrimary}>
                  Go to Dashboard →
                </Link>
              ) : (
                <Link href="/login" style={btnPrimary}>
                  Get Started Free
                </Link>
              )}
              <a href="#pricing" style={btnSecondary}>
                View Pricing
              </a>
            </div>
          </div>

          <div
            style={{
              border: "1px solid var(--panel-border)",
              background: "var(--bg-secondary)",
              borderRadius: 16,
              padding: 24,
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 12,
              lineHeight: "20px",
              minHeight: 360,
            }}
          >
            <div style={{ color: "var(--text-faint)", marginBottom: 12, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Detection Pipeline
            </div>

            {[
              { id: "tool-received", label: "Tool Call Received", detail: 'Bash | Write | WebFetch | Read | Edit', status: "input" },
              { id: "extract-artifacts", label: "Extract Artifacts", detail: "URLs · Commands · File paths · Content", status: "processing" },
              { id: "check-allowlist", label: "Check Allowlist", detail: "Cache hit → allow | Miss → continue", status: "decision" },
              { id: "run-heuristics", label: "Run Heuristics", detail: "YAML threat patterns · 330+ rules", status: "processing" },
              { id: "query-reputation", label: "Query Reputation", detail: "URL · Package · Domain checks", status: "processing" },
              { id: "decision-engine", label: "Decision Engine", detail: "Combine signals → final verdict", status: "decision" },
              { id: "verdict", label: "Verdict", detail: "✅ Allow  |  ⚠️ Ask  |  🛑 Deny", status: "output" },
            ].map((step) => (
              <div key={step.id} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: step.status === "input" ? "#3b82f6" : step.status === "output" ? "#22c55e" : step.status === "decision" ? "#f59e0b" : "#8b5cf6",
                    flexShrink: 0,
                  }} />
                  <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{step.label}</span>
                </div>
                <div style={{ color: "var(--text-faint)", marginLeft: 14, fontSize: 11 }}>{step.detail}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════════════ DETECTION LAYERS ════════ */}
        <Section id="how-it-works">
          <div style={sectionLabel}>How It Works</div>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 20,
              letterSpacing: "-0.02em",
            }}
          >
            Four detection layers, one verdict
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: "22px", marginBottom: 24, maxWidth: 700 }}>
            Every tool call passes through multiple independent detection layers. 
            Each layer returns a signal — allow, ask, or deny — and the decision engine 
            merges them with deny &gt; ask &gt; allow precedence.
          </p>

          <div
            className="layers-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 14,
            }}
          >
            {detectionLayers.map((layer) => (
              <div key={layer.title} style={gridCard}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{layer.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  {layer.title}
                </div>
                <div style={{ fontSize: 13, lineHeight: "20px", color: "var(--text-secondary)" }}>
                  {layer.desc}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ════════════════════════════════════════ FEATURES ════════════════ */}
        <Section id="features">
          <div style={sectionLabel}>Core Features</div>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 20,
              letterSpacing: "-0.02em",
            }}
          >
            Everything you need to secure AI agent operations
          </h2>

          <div
            className="features-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 14,
            }}
          >
            {features.map((f) => (
              <article key={f.title} style={gridCard}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8, letterSpacing: "-0.02em" }}>
                  {f.title}
                </div>
                <div style={{ fontSize: 14, lineHeight: "22px", color: "var(--text-secondary)" }}>
                  {f.desc}
                </div>
              </article>
            ))}
          </div>
        </Section>

        {/* ════════════════════════════════════════ THREAT COVERAGE ═════════ */}
        <Section id="threats">
          <div style={sectionLabel}>Threat Coverage</div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6, letterSpacing: "-0.02em" }}>
            330+ detection rules — data-driven YAML
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 20, maxWidth: 600 }}>
            All detection logic is data. No hardcoded patterns. Rules are YAML files that ship with the agent and update independently.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {threatCategories.map((t) => (
              <div
                key={t.name}
                style={{
                  ...gridCard,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 18px",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{t.example}</div>
                </div>
                <Badge color={t.severity === "critical" ? "#ef4444" : t.severity === "high" ? "#f59e0b" : "#3b82f6"}>
                  {t.severity}
                </Badge>
              </div>
            ))}
          </div>
        </Section>

        {/* ════════════════════════════════════════ PLATFORMS ═══════════════ */}
        <Section id="platforms">
          <div style={sectionLabel}>Supported Platforms</div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6, letterSpacing: "-0.02em" }}>
            Works with every major AI coding tool
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 20, maxWidth: 600 }}>
            Native hooks for each platform. No wrappers, no sidecars — just drop-in protection.
          </p>

          <div
            className="platforms-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            {platforms.map((p) => (
              <div key={p.name} style={gridCard}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
                  {p.name}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Hook</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", fontFamily: "var(--font-geist-mono), monospace" }}>{p.hook}</div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Protected Tools</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{p.tools}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Install</div>
                  <code style={{ fontSize: 11, color: "var(--text-code)", wordBreak: "break-all" }}>{p.install}</code>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ════════════════════════════════════════ SECURITY & PRIVACY ══════ */}
        <Section id="security">
          <div style={sectionLabel}>Security & Privacy</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14, marginTop: 4 }}>
            {[
              { title: "Privacy-First Design", desc: "No code, file contents, or prompts are sent to external services. Threat rules run locally. URL reputation is anonymous — no API key needed." },
              { title: "Fail-Open Architecture", desc: "AIDR never breaks your agent. Every internal error returns an allow verdict. If the reputation API is down, AIDR falls back to heuristics." },
              { title: "Audit with Redaction", desc: "All audit logs automatically redact PII, secrets, API keys, and credentials before storage. Compliant by default." },
              { title: "Data-Driven Rules", desc: "Every detection is a YAML file — no hardcoded patterns. Rules can be updated, expired, or revoked independently without code changes." },
              { title: "Offline Grace Period", desc: "Enrolled agents cache verdicts within a signed window. Protection continues even when the network is unavailable." },
              { title: "Open Source Core", desc: "The core detection engine is MIT-licensed. Inspect what runs on your machine. No black boxes, no telemetry without consent." },
            ].map((item) => (
              <div key={item.title} style={gridCard}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 13, lineHeight: "20px", color: "var(--text-secondary)" }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ════════════════════════════════════════ PRICING ═════════════════ */}
        <Section id="pricing">
          <div style={sectionLabel}>Pricing</div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6, letterSpacing: "-0.02em" }}>
            Start free. Scale when you need to.
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 20, maxWidth: 500 }}>
            1 agent is always free. No time limit, no credit card required. Additional agents are <strong>$5/agent/month</strong> — or <strong>$4/agent/month</strong> billed yearly.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
            }}
          >
            {/* Free */}
            <div style={gridCard}>
              <div style={{ fontSize: 12, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Free
              </div>
              <div style={{ fontSize: 32, fontWeight: 600, color: "var(--text-primary)" }}>
                $0
              </div>
              <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 4, marginBottom: 16 }}>
                1 agent forever
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", color: "var(--text-secondary)", fontSize: 13, lineHeight: "26px" }}>
                <li>✓ Full detection engine</li>
                <li>✓ Dashboard access</li>
                <li>✓ Incident management</li>
                <li>✓ Audit logging</li>
                <li>✓ Community support</li>
              </ul>
            </div>

            {/* Pro */}
            <div
              style={{
                ...gridCard,
                border: "1px solid var(--accent, #3862e8)",
                background: "linear-gradient(180deg, rgba(56,98,232,0.06), var(--bg-secondary))",
                position: "relative",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--accent, #3862e8)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Pro
                <span
                  style={{
                    marginLeft: 8,
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontSize: 10,
                    background: "#3862e8",
                    color: "white",
                    fontWeight: 600,
                  }}
                >
                  Recommended
                </span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 600, color: "var(--text-primary)" }}>
                $5
                <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-secondary)" }}>/agent/month</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 2, marginBottom: 16 }}>
                $4/agent/month billed yearly
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", color: "var(--text-secondary)", fontSize: 13, lineHeight: "26px" }}>
                <li>✓ Everything in Free</li>
                <li>✓ Unlimited agents</li>
                <li>✓ Team management</li>
                <li>✓ Priority support</li>
                <li>✓ Seat-based billing</li>
              </ul>
            </div>

            {/* Enterprise */}
            <div style={gridCard}>
              <div style={{ fontSize: 12, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Enterprise
              </div>
              <div style={{ fontSize: 32, fontWeight: 600, color: "var(--text-primary)" }}>
                Custom
              </div>
              <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 4, marginBottom: 16 }}>
                For organizations
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", color: "var(--text-secondary)", fontSize: 13, lineHeight: "26px" }}>
                <li>✓ Everything in Pro</li>
                <li>✓ Org-wide policy distribution</li>
                <li>✓ Audit exports & compliance</li>
                <li>✓ Dedicated SLAs</li>
                <li>✓ Custom integrations</li>
              </ul>
            </div>
          </div>

          <div
            style={{
              marginTop: 18,
              textAlign: "center" as const,
            }}
          >
            {isLoaded && !isSignedIn ? (
              <Link href="/login" style={{ ...btnPrimary, display: "inline-block" }}>
                Get Started — Free Agent
              </Link>
            ) : null}
          </div>
        </Section>

        {/* ════════════════════════════════════════ FAQ ═════════════════════ */}
        <Section id="faq">
          <div style={sectionLabel}>FAQ</div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20, letterSpacing: "-0.02em" }}>
            Frequently asked questions
          </h2>

          <div style={{ display: "grid", gap: 10 }}>
            {faqs.map((faq) => (
              <details
                key={faq.q}
                style={{
                  border: "1px solid var(--panel-border)",
                  borderRadius: 12,
                  padding: "16px 20px",
                  background: "var(--bg-secondary)",
                  cursor: "pointer",
                }}
              >
                <summary
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                >
                  {faq.q}
                </summary>
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 14,
                    lineHeight: "22px",
                    color: "var(--text-secondary)",
                  }}
                >
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </Section>

        {/* ════════════════════════════════════════ CTA ════════════════════ */}
        <Section>
          <div style={{ textAlign: "center" as const, padding: "20px 0" }}>
            <h2
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 10,
                letterSpacing: "-0.02em",
              }}
            >
              Ready to secure your AI agents?
            </h2>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: 15,
                marginBottom: 20,
                maxWidth: 480,
                margin: "0 auto 20px",
              }}
            >
              Install in one command. Protect your first agent free. No credit card needed.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {isLoaded && isSignedIn ? (
                <Link href="/dashboard" style={btnPrimary}>
                  Go to Dashboard
                </Link>
              ) : (
                <Link href="/login" style={btnPrimary}>
                  Get Started Free
                </Link>
              )}
              <a
                href="https://github.com/singularityrd/aidr"
                target="_blank"
                rel="noopener noreferrer"
                style={btnSecondary}
              >
                GitHub →
              </a>
            </div>
          </div>
        </Section>

        {/* ════════════════════════════════════════ INSTALL PROMPT ═════════ */}
        <section style={{ width: "100%", marginBottom: 22 }}>
          <InstallPromptCard />
        </section>
      </main>
    </div>
  );
}
