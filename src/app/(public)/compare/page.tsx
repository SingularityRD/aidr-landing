import Link from "next/link";
import Background from "@/components/Background";
import Header from "@/components/Header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AIDR vs Competitors // AI Agent Security Comparison",
  description:
    "See how Singularity AIDR compares to Lakera, Protect AI, Guardrails AI, and other AI agent security platforms. AIDR is the only tool that protects agent tool-call execution at the edge.",
};

const surfaceStyle: React.CSSProperties = {
  border: "1px solid var(--panel-border)",
  borderRadius: 16,
  background: "var(--panel-bg)",
  boxShadow: "0 12px 36px var(--shadow-color)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  padding: 28,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--panel-border)",
  borderRadius: 14,
  background: "var(--bg-secondary)",
  padding: 20,
};

// ── Competitive data ──────────────────────────────────────────────────────────

const competitiveMatrix = [
  {
    category: "Protection Scope",
    cells: [
      "Tool-call execution (Bash, Write, Fetch, Read, Edit, MCP)",
      "LLM prompts & responses (I/O firewall)",
      "Model files + ML pipelines (MLSecOps)",
      "LLM output validation & structure",
      "Prompt I/O + agent runtime",
    ],
  },
  {
    category: "Deployment",
    cells: [
      "Local-first, optional cloud sync",
      "Cloud SaaS or self-hosted",
      "Cloud SaaS (Palo Alto)",
      "Python library (self-hosted)",
      "Cloud SaaS",
    ],
  },
  {
    category: "Pricing",
    cells: [
      "$0 (1 agent) → $5/agent/mo",
      "$0 (10K req) → $99 → $499 → Enterprise",
      "Enterprise only (custom)",
      "Free core → $49/mo Pro",
      "$29/mo → Enterprise",
    ],
  },
  {
    category: "Offline Support",
    cells: [
      "✅ Full offline with cache",
      "❌ Cloud-dependent",
      "❌ Cloud-dependent",
      "✅ Self-hosted",
      "✅ Self-hosted option",
    ],
  },
  {
    category: "Agent Platform Support",
    cells: [
      "Claude Code, Cursor, VS Code, OpenClaw, OpenCode",
      "Any LLM via API (model-agnostic)",
      "ML pipelines + notebooks",
      "Any LLM via Python SDK",
      "Any LLM via API",
    ],
  },
  {
    category: "Fail-Open Design",
    cells: [
      "✅ Never breaks agent",
      "❌ Block on error",
      "❌ Block on error",
      "❌ Block on error",
      "❌ Block on error",
    ],
  },
  {
    category: "Privacy",
    cells: [
      "No code/prompts sent externally",
      "Prompts sent to API",
      "Full telemetry",
      "Self-hosted (data stays local)",
      "Prompts sent to API",
    ],
  },
  {
    category: "Open Source",
    cells: [
      "✅ Core engine (MIT)",
      "❌ Proprietary",
      "✅ ModelScan only",
      "✅ Core library",
      "❌ Proprietary",
    ],
  },
  {
    category: "Sub-50ms Latency",
    cells: [
      "✅ Local detection (no network call)",
      "✅ API-based",
      "N/A",
      "✅ ~50ms overhead",
      "✅ ~2.44ms self-hosted",
    ],
  },
  {
    category: "SaaS Free Tier",
    cells: [
      "✅ 1 agent forever",
      "✅ 10K req/mo free",
      "❌ No free tier",
      "✅ Free core",
      "✅ 100 req/day free",
    ],
  },
  {
    category: "Audit & Redaction",
    cells: [
      "✅ Built-in PII redaction",
      "✅ Full audit logs",
      "✅ Audit trails",
      "Limited",
      "Usage logs only",
    ],
  },
];

const competitors = [
  {
    name: "Lakera Guard",
    tagline: "Runtime LLM firewall — prompt injection & data leakage prevention",
    logo: "LG",
    pricing: "Free (10K req/mo) → $99 → $499 → Enterprise",
    funding: "$30M (acquired by Check Point)",
    focus: "LLM I/O security at runtime",
    strength: "Low latency API, broad threat coverage (15+ types), SOC2/GDPR",
    weakness: "Cloud-dependent, only protects LLM prompts/responses — not agent tool calls. Expensive at scale.",
    aidrEdge: "AIDR protects the full agent runtime: commands, files, packages, plugins, and output — not just prompts.",
    whenToPick: "You need an API-based LLM firewall and already have agent runtime covered elsewhere.",
  },
  {
    name: "Protect AI (Palo Alto)",
    tagline: "MLSecOps platform — model scanning, supply chain, runtime",
    logo: "PA",
    pricing: "Enterprise only (custom)",
    funding: "$35M Series B (acquired by Palo Alto Networks)",
    focus: "ML pipeline & model security",
    strength: "Deep model vulnerability scanning, NB Defense, SBOM for AI",
    weakness: "Enterprise-only pricing, no developer-agent runtime focus, heavy platform dependency",
    aidrEdge: "AIDR is lightweight, developer-first, and protects coding agents at the tool-call level — not ML pipelines.",
    whenToPick: "You need enterprise MLSecOps across thousands of models and have Palo Alto budget.",
  },
  {
    name: "Guardrails AI",
    tagline: "Output validation framework — structured data, schema enforcement",
    logo: "GA",
    pricing: "Free core → $49/mo Pro → Enterprise",
    funding: "Seed stage",
    focus: "LLM output structure & reliability",
    strength: "50+ validators, streaming support, Pydantic integration",
    weakness: "Not a security tool — focuses on output quality, not threat detection",
    aidrEdge: "AIDR is built for security: prompt injection, RCE, credential theft, supply chain — not just output formatting.",
    whenToPick: "You need structured LLM outputs (JSON/XML) with retry logic and schema validation.",
  },
  {
    name: "AgentShield",
    tagline: "Low-latency runtime classification for agent interactions",
    logo: "AS",
    pricing: "$29/mo (5K req/day) → Enterprise",
    funding: "Bootstrapped",
    focus: "Real-time prompt injection classification",
    strength: "Ultra-low latency (2.44ms), self-hosted option",
    weakness: "Narrow scope (classification only), no tool-call protection, early-stage",
    aidrEdge: "AIDR provides 4-layer detection (heuristics, reputation, supply chain, plugin scan) — not just classification.",
    whenToPick: "You need ultra-low-latency classification and already have other security layers.",
  },
  {
    name: "LLM Guard (Protect AI)",
    tagline: "Open-source PII, toxicity, secrets, and prompt injection scanner",
    logo: "LG",
    pricing: "Free (open source, Apache 2.0)",
    funding: "Part of Protect AI",
    focus: "Input/output scanning with 20+ scanners",
    strength: "Open source, self-hosted, broad scanner coverage",
    weakness: "No runtime protection, no agent integration, no dashboard, manual updates",
    aidrEdge: "AIDR provides managed protection with dashboard, incident correlation, and automatic rule updates.",
    whenToPick: "You want a free self-hosted scanning library and have ops capacity to maintain it.",
  },
  {
    name: "NeMo Guardrails (NVIDIA)",
    tagline: "Policy-as-code framework for multi-turn agent dialogues",
    logo: "NG",
    pricing: "Free (open source, Apache 2.0)",
    funding: "NVIDIA",
    focus: "Dialogue policy & safety rails",
    strength: "Colang-based policy, deep LangChain integration",
    weakness: "Requires LLM for enforcement, high latency, complex setup, no tool-call protection",
    aidrEdge: "AIDR protects at the tool-execution boundary — not just dialogue policy. Works offline with zero LLM dependency.",
    whenToPick: "You need complex dialogue policies for multi-turn chatbot conversations.",
  },
  {
    name: "Lasso Security",
    tagline: "Pure-play agentic AI security with policy framework",
    logo: "LS",
    pricing: "Enterprise only",
    funding: "Series A (undisclosed)",
    focus: "Agent identity, tool authorization, MCP gateway",
    strength: "Deep agent-specific controls, policy framework",
    weakness: "Enterprise-only pricing, no developer tool focus, no offline mode",
    aidrEdge: "AIDR is developer-first with free tier, local enforcement, and direct platform integration.",
    whenToPick: "You're an enterprise deploying custom agents and need a dedicated agent security policy framework.",
  },
];

export default function ComparePage() {
  return (
    <div className="relative w-full min-h-screen">
      <Background />
      <Header />
      <main style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* ── Header ── */}
        <section style={surfaceStyle}>
          <div style={{ color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
            Competitive Position
          </div>
          <h1 style={{ margin: "0 0 12px", color: "var(--text-primary)", fontSize: "clamp(28px, 3.5vw, 48px)", lineHeight: 1.08, fontWeight: 600 }}>
            AIDR is the only tool that protects agent tool-call execution.
          </h1>
          <p style={{ margin: 0, color: "var(--text-secondary)", maxWidth: 760, lineHeight: "26px", fontSize: 15 }}>
            Every competitor focuses on <strong>LLM I/O security</strong> — prompt injection, jailbreak detection, 
            output validation. AIDR protects the <strong>agent runtime</strong>: the shell commands, file writes, 
            network requests, package installations, and MCP tool calls that actually execute on your machine.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
            <Link href="/login" style={{
              padding: "10px 20px", borderRadius: 10,
              border: "1px solid var(--text-primary)", background: "var(--text-primary)",
              color: "var(--bg-primary)", textDecoration: "none", fontWeight: 500, fontSize: 14,
            }}>
              Get AIDR Free
            </Link>
            <Link href="/pricing" style={{
              padding: "10px 20px", borderRadius: 10,
              border: "1px solid var(--panel-border)", color: "var(--text-secondary)",
              textDecoration: "none", fontSize: 14,
            }}>
              Compare Pricing
            </Link>
          </div>
        </section>

        {/* ── Competitive Matrix ── */}
        <section style={{ ...surfaceStyle, marginTop: 18, overflowX: "auto" }}>
          <div style={{ color: "var(--text-faint)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>
            Feature Comparison Matrix
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--text-faint)", fontWeight: 500, borderBottom: "1px solid var(--panel-border)" }}>Category</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "#3862e8", fontWeight: 600, borderBottom: "1px solid var(--panel-border)" }}>AIDR</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--text-secondary)", fontWeight: 500, borderBottom: "1px solid var(--panel-border)" }}>Lakera</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--text-secondary)", fontWeight: 500, borderBottom: "1px solid var(--panel-border)" }}>Protect AI</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--text-secondary)", fontWeight: 500, borderBottom: "1px solid var(--panel-border)" }}>Guardrails AI</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--text-secondary)", fontWeight: 500, borderBottom: "1px solid var(--panel-border)" }}>AgentShield</th>
              </tr>
            </thead>
            <tbody>
              {competitiveMatrix.map((row, i) => (
                <tr key={row.category}>
                  <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: i < competitiveMatrix.length - 1 ? "1px solid var(--panel-border)" : "none", whiteSpace: "nowrap" }}>
                    {row.category}
                  </td>
                  {row.cells.map((cell, j) => (
                    <td
                      key={j}
                      style={{
                        padding: "10px 12px",
                        color: j === 0 ? "var(--text-primary)" : "var(--text-secondary)",
                        fontWeight: j === 0 ? 500 : 400,
                        borderBottom: i < competitiveMatrix.length - 1 ? "1px solid var(--panel-border)" : "none",
                        fontSize: 12,
                        lineHeight: "18px",
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ── Why AIDR Wins ── */}
        <section style={{ ...surfaceStyle, marginTop: 18 }}>
          <div style={{ color: "var(--text-faint)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>
            Why AIDR Wins
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {[
              {
                title: "Only tool-call protection",
                desc: "No competitor protects Bash commands, file writes, network requests, and MCP tool calls before execution. AIDR is the only agent runtime security layer.",
              },
              {
                title: "Local-first, offline-capable",
                desc: "Every competitor requires cloud connectivity. AIDR runs fully offline with cached verdicts. Cloud sync is optional.",
              },
              {
                title: "Fail-open by design",
                desc: "Competitors block on error. AIDR never breaks your agent — every internal error returns 'allow'. Your workflow never stops.",
              },
              {
                title: "Developer-native onboarding",
                desc: "No admin-led deployment. No API keys to configure. Install by prompt in Claude Code, authorize in browser, and go.",
              },
              {
                title: "Per-agent pricing ($5/mo)",
                desc: "Competitors charge per API call ($99-499/mo for meaningful volume). AIDR charges per agent. Predictable, simple, and up to 20x cheaper at scale.",
              },
              {
                title: "Privacy by architecture",
                desc: "AIDR never sends code, prompts, or file contents externally. Competitors send everything to their cloud for analysis.",
              },
            ].map((item) => (
              <div key={item.title} style={cardStyle}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 13, lineHeight: "20px", color: "var(--text-secondary)" }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Competitor Deep Dives ── */}
        <section style={{ marginTop: 18 }}>
          <div style={{ color: "var(--text-faint)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16, padding: "0 4px" }}>
            Competitor Deep Dives
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            {competitors.map((c) => (
              <div key={c.name} style={surfaceStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: "linear-gradient(135deg, #3862e8, #764ba2)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "white", fontSize: 12, fontWeight: 700,
                      }}>
                        {c.logo}
                      </div>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)" }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{c.tagline}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      <span style={{ color: "var(--text-faint)" }}>Pricing: </span>{c.pricing}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{c.funding}</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div style={{ padding: 12, borderRadius: 10, background: "var(--panel-bg)", border: "1px solid var(--panel-border)" }}>
                    <div style={{ fontSize: 11, color: "#22c55e", fontWeight: 600, marginBottom: 4 }}>Strength</div>
                    <div style={{ fontSize: 12, lineHeight: "18px", color: "var(--text-secondary)" }}>{c.strength}</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, background: "var(--panel-bg)", border: "1px solid var(--panel-border)" }}>
                    <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 600, marginBottom: 4 }}>Limitation</div>
                    <div style={{ fontSize: 12, lineHeight: "18px", color: "var(--text-secondary)" }}>{c.weakness}</div>
                  </div>
                </div>

                <div style={{ padding: 12, borderRadius: 10, background: "rgba(56,98,232,0.06)", border: "1px solid rgba(56,98,232,0.2)", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#3862e8", fontWeight: 600, marginBottom: 4 }}>AIDR Edge</div>
                  <div style={{ fontSize: 12, lineHeight: "18px", color: "var(--text-secondary)" }}>{c.aidrEdge}</div>
                </div>

                <div style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>
                  {c.whenToPick}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section style={{ ...surfaceStyle, marginTop: 18, textAlign: "center" }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10, letterSpacing: "-0.02em" }}>
            The only agent runtime security layer.
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 20, maxWidth: 500, margin: "0 auto 20px" }}>
            No competitor protects what AIDR protects. Install by prompt, protect your first agent free, and get runtime security that no other tool provides.
          </p>
          <Link href="/login" style={{
            display: "inline-block", padding: "12px 28px", borderRadius: 10,
            background: "var(--text-primary)", color: "var(--bg-primary)",
            textDecoration: "none", fontWeight: 500, fontSize: 15,
          }}>
            Get Started Free
          </Link>
        </section>

      </main>
    </div>
  );
}
