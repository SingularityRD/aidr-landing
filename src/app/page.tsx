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
  {
    title: "AIDR Scan Engine",
    desc: "Four deep-scan engines: CVE matcher (1,354+ entries), MCP 14-category risk scorer, agent workflow scanner, and LLM jailbreak evaluation. All in-process, sub-50ms.",
    icon: "🛡️",
  },
];

const engines = [
  {
    name: "Edge Guard",
    desc: "URL reputation, local heuristics, package supply-chain, plugin scanning. Always on, all plans.",
    tag: "Free",
  },
  {
    name: "CVE Scanner",
    desc: "1,354+ CVE entries with semver-based matching. Critical, high, medium, low severity scoring. CVE mirror updated daily.",
    tag: "Pro",
  },
  {
    name: "MCP Risk Scorer",
    desc: "14 MCP risk categories: RCE, shell access, file write, network egress, data exfiltration, credential access, and 8 more. Per-tool scoring.",
    tag: "Pro",
  },
  {
    name: "Agent Workflow Scanner",
    desc: "Detects prompt injection, privilege escalation, data leakage, tool abuse in agent configurations and runtime flows.",
    tag: "Pro",
  },
  {
    name: "Jailbreak Eval",
    desc: "8 LLM red-team test suites: direct jailbreak (DAN), role-play bypass, prompt leak, ChatML/Llama token injection. 30-second eval.",
    tag: "Pro",
  },
  {
    name: "DLP Engine",
    desc: "50+ PII patterns (email, phone, IBAN, TC kimlik, kredi kartı) + secret detection (AWS, GitHub, OpenAI, Slack, Stripe). Redacted logs.",
    tag: "Pro",
  },
  {
    name: "Policy Engine",
    desc: "YAML DSL for custom rules. Live preview, audit-grade. 5-minute rule authoring. No Colang, no proprietary language.",
    tag: "Pro",
  },
  {
    name: "Output Validator",
    desc: "Zod/JSONSchema validation for every LLM output. Silent schema breaks → automatic deny + log. 1-click template gallery.",
    tag: "Pro",
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
    a: "Singularity AIDR is a closed-source AI agent security platform with 8 engines in one binary: Edge Guard, CVE Scanner (1,354+ CVEs), MCP 14-category Risk Scorer, Agent Workflow Scanner, Jailbreak Eval, DLP Engine, Policy Engine, and Output Validator. Pro plan includes every engine — AIDR Scan full.",
  },
  {
    q: "What is AIDR Scan?",
    a: "AIDR Scan is the deep-scan sub-product of AIDR, derived from Tencent AI-Infra-Guard (Apache 2.0). It runs as a native in-process TypeScript engine — no Go sidecar, no Python bridge, no HTTP. 1,354+ CVE entries, 14 MCP risk categories, 8 jailbreak test suites, 334 rule engine patterns, all sub-50ms.",
  },
  {
    q: "Is AIDR free?",
    a: "1 agent is free forever (Edge Guard). Pro is $5/agent/month ($4/agent/month yearly) and includes every AIDR Scan engine — CVE, MCP, Agent, Jailbreak, DLP, Policy, Output Validator. No feature gates on Pro. Enterprise is custom (SSO, SOC2, on-prem, SLA).",
  },
  {
    q: "Does AIDR require cloud connectivity?",
    a: "No. AIDR Scan runs entirely in-process — CVE index, MCP categories, threat rules, agent patterns, all loaded from a 165 KB JSON bundle. No outbound HTTP, no sidecar calls. URL reputation is optional and privacy-preserving. Edge agents keep working offline within the signed cache window.",
  },
  {
    q: "What platforms does AIDR support?",
    a: "Claude Code, Cursor, VS Code, OpenClaw, OpenCode, and any custom agent via the AIDR SDK (TypeScript, Python, Go). Each platform gets native hooks that intercept tool calls at the appropriate integration point. Single binary, ~5 MB, signed with cosign.",
  },
  {
    q: "Is AIDR open source?",
    a: "No. AIDR is closed-source, audited, and verified. The binary is cosign-signed (SLSA Level 3), every release publishes a CycloneDX SBOM, and we run an annual third-party pen test (NCC Group). The Apache 2.0 attribution for AI-Infra-Guard (Tencent Zhuque Lab) is preserved in NOTICE.",
  },
  {
    q: "How is my data handled?",
    a: "AIDR is privacy-first. Detection runs locally. Audit logs automatically redact PII and secrets. The URL reputation API is anonymous. No code, file contents, or prompts are sent to external services. SOC2 Type II in progress. DPA available for Enterprise.",
  },
  {
    q: "Can AIDR break my agent?",
    a: "No. AIDR is designed to never break the agent. Every internal error path returns an allow verdict. If the URL reputation API is down, it falls back to heuristics only. The AIDR Scan engine returns a catalog result offline and live probes only via the SaaS worker pool.",
  },
  {
    q: "How do I install AIDR?",
    a: "Three ways. (1) Install script: curl -fsSL aidr.dev/install.sh | sh (Unix) or irm aidr.dev/install.ps1 | iex (Windows). (2) Claude Code prompt: /plugin install aidr@aidr. (3) SDK: npm i @aidr/sdk, pip install aidr-sdk, or go get github.com/singularityrd/aidr/sdk.",
  },
  {
    q: "What payment methods do you accept?",
    a: "Polar handles all billing globally — credit/debit cards, Apple Pay, Google Pay, SEPA, ACH. Polar is a Merchant of Record, so we can serve Türkiye, EU, and global customers with proper tax/VAT. Enterprise can pay by invoice/wire.",
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
              Closed-source · 8 engines · 1 binary · Sub-50ms
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
              Stop AI agent attacks at the edge.
            </h1>
            <p
              style={{
                color: "var(--text-secondary)",
                maxWidth: 520,
                lineHeight: "26px",
                fontSize: 15,
              }}
            >
              AIDR + AIDR Scan, one signed binary. 8 engines — Edge Guard, CVE Scanner, MCP 14-category Risk Scorer, Agent Workflow, Jailbreak Eval, DLP, Policy DSL, Output Validator. 1,354+ CVEs. 334 rule patterns. All in-process TypeScript, sub-50ms.
              <strong style={{ color: "var(--text-primary)" }}> Pro = her şey. $5/agent/month.</strong>
              <strong style={{ color: "var(--text-primary)" }}> 1 agent free forever.</strong>
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
            Pro = her şey. $5/agent/month.
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 20, maxWidth: 600 }}>
            One platform. 8 engines. Every AI agent attack vector. 1 agent free forever.
            Pro includes <strong style={{ color: "var(--text-primary)" }}>every AIDR Scan engine</strong> — no feature gates, no upsells.
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
                <li>✓ Edge Guard (4 layers)</li>
                <li>✓ 100 scans/day</li>
                <li>✓ Dashboard access</li>
                <li>✓ Incident management</li>
                <li>✓ Audit logging</li>
                <li>✓ Community support</li>
              </ul>
            </div>

            {/* Pro = Her Şey */}
            <div
              style={{
                ...gridCard,
                border: "1px solid var(--accent, #3862e8)",
                background: "linear-gradient(180deg, rgba(56,98,232,0.06), var(--bg-secondary))",
                position: "relative",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--accent, #3862e8)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Pro · Her Şey Dahil
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
                  Most Popular
                </span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 600, color: "var(--text-primary)" }}>
                $5
                <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-secondary)" }}>/agent/month</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 2, marginBottom: 16 }}>
                $4/agent/month billed yearly · 14-day free trial
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", color: "var(--text-secondary)", fontSize: 13, lineHeight: "26px" }}>
                <li>✓ <strong>8 engines (every AIDR Scan)</strong></li>
                <li>✓ Edge Guard + CVE Scanner + MCP 14-cat</li>
                <li>✓ Agent + Jailbreak + DLP + Policy DSL</li>
                <li>✓ Output Validator (Zod/JSONSchema)</li>
                <li>✓ Unlimited agents · Real-time dashboard</li>
                <li>✓ Custom rules · Webhooks · REST API · 3 SDK</li>
                <li>✓ Slack/Discord alerts · SIEM export</li>
                <li>✓ 30-day audit retention</li>
                <li>✓ Priority email support</li>
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
                <li>✓ SAML/SSO (Okta, Azure AD, Google)</li>
                <li>✓ Granular RBAC (4 roles)</li>
                <li>✓ 1-year+ audit retention</li>
                <li>✓ SLA 99.99% uptime</li>
                <li>✓ Multi-region (US, EU, APAC)</li>
                <li>✓ SOC2 Type II · GDPR DPA</li>
                <li>✓ On-prem / air-gap deploy</li>
                <li>✓ Dedicated CSM</li>
              </ul>
            </div>
          </div>

          <div
            style={{
              marginTop: 18,
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {isLoaded && !isSignedIn ? (
              <Link href="/login" style={{ ...btnPrimary, display: "inline-block" }}>
                Get Started — Free Agent
              </Link>
            ) : null}
            <Link href="/pricing" style={{ ...btnSecondary, display: "inline-block" }}>
              Full Pricing Details
            </Link>
            <Link href="/compare" style={{ ...btnSecondary, display: "inline-block" }}>
              Compare vs Lakera · Protect AI · Lasso
            </Link>
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
