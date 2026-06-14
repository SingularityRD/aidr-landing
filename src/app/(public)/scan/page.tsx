"use client";

import Link from "next/link";
import Background from "@/components/Background";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const engines = [
  {
    id: "cve",
    name: "CVE Scanner",
    tagline: "1,354+ CVEs · semver-based · daily mirror",
    description:
      "Matches installed packages against a curated CVE database with semver range matching. Critical, high, medium, low severity scoring. Updates daily via signed manifest. Sub-1ms cold scan in-process.",
    example: `aidr scan cve triton-inference-server:2.30.0 --ecosystem go`,
    output: `1 critical CVE matched
  CVE-2024-XXXXX · CVSS 9.8 · Upgrade to 2.31.0+`,
    icon: "🛡️",
  },
  {
    id: "mcp",
    name: "MCP 14-Category Risk Scorer",
    tagline: "RCE, shell, file, network, exfil, …",
    description:
      "14 MCP risk categories classify every tool call: RCE, shell access, file write/read, network egress, data exfiltration, credential access, privilege escalation, persistence, DoS, info disclosure, config manipulation, supply chain. Per-tool scoring with policy mapping.",
    example: `aidr scan mcp https://example-mcp.dev/sse --tool fs.write_file`,
    output: `risk_score: 67/100
  aidr-mcp-file-write  (high)
  aidr-mcp-network-egress (medium)`,
    icon: "🔌",
  },
  {
    id: "agent",
    name: "Agent Workflow Scanner",
    tagline: "prompt injection · priv esc · data leak",
    description:
      "Detects prompt injection, privilege escalation, data leakage, tool abuse in agent configurations (Dify, Coze, custom HTTP) and runtime flows. Pattern library covers direct, indirect, ChatML, Llama, mistral token injection.",
    example: `aidr scan agent --config ./agent.yaml`,
    output: `1 critical finding
  LLM-INJ-001: Direct prompt injection
  → Add 'ignore previous' to blocklist policy`,
    icon: "🤖",
  },
  {
    id: "jailbreak",
    name: "Jailbreak Eval",
    tagline: "8 red-team suites · 30-second eval",
    description:
      "Tests your LLM endpoint against 8 red-team suites: direct jailbreak (DAN, developer mode, unfiltered), role-play bypass, prompt leak, ChatML/Llama/mistral token injection. 30-second evaluation with categorized pass/fail report.",
    example: `aidr scan jailbreak \\
  --endpoint https://api.openai.com/v1/chat \\
  --model gpt-4 --token $OPENAI_API_KEY`,
    output: `47 tests across 4 suites
  41 passed, 6 failed
  → Failed: DAN persona, system prompt extraction`,
    icon: "🧨",
  },
];

export default function ScanPage() {
  return (
    <div className="relative w-full min-h-screen">
      <Background />
      <Header />

      <main
        style={{
          position: "relative",
          zIndex: 1,
          padding: "60px 24px",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <section style={{ textAlign: "center", marginBottom: 64 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--text-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 12,
            }}
          >
            AIDR Scan · Closed-source · Sub-50ms
          </div>
          <h1
            style={{
              fontSize: "clamp(32px, 4vw, 56px)",
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "-0.025em",
              marginBottom: 16,
              lineHeight: 1.05,
            }}
          >
            4 deep engines. 1,354+ CVEs.<br />14 MCP categories. 1 binary.
          </h1>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: 16,
              maxWidth: 720,
              margin: "0 auto",
              lineHeight: "26px",
            }}
          >
            AIDR Scan is the deep-scan sub-product of AIDR — re-implemented as a native in-process
            TypeScript engine, derived from Tencent AI-Infra-Guard (Apache 2.0). No Go sidecar,
            no Python bridge, no HTTP. Sub-50ms cold scan. 165 KB total runtime footprint.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
            <Link
              href="/login"
              style={{
                display: "inline-block",
                padding: "12px 28px",
                borderRadius: 10,
                background: "#3862e8",
                color: "white",
                textDecoration: "none",
                fontWeight: 500,
                fontSize: 15,
              }}
            >
              Start Free — 1 agent
            </Link>
            <Link
              href="/demo"
              style={{
                display: "inline-block",
                padding: "12px 28px",
                borderRadius: 10,
                background: "transparent",
                color: "var(--text-primary)",
                textDecoration: "none",
                fontWeight: 500,
                fontSize: 15,
                border: "1px solid var(--panel-border)",
              }}
            >
              Try Live Demo
            </Link>
          </div>
        </section>

        <section style={{ marginBottom: 64 }}>
          {engines.map((engine, i) => (
            <div
              key={engine.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 32,
                alignItems: "center",
                marginBottom: 48,
                flexDirection: i % 2 === 1 ? "row-reverse" : "row",
              }}
            >
              <div>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{engine.icon}</div>
                <h2
                  style={{
                    fontSize: 28,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: 8,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {engine.name}
                </h2>
                <div
                  style={{
                    fontSize: 13,
                    color: "#3862e8",
                    fontWeight: 500,
                    marginBottom: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {engine.tagline}
                </div>
                <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: "24px" }}>
                  {engine.description}
                </p>
              </div>
              <div
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--panel-border)",
                  borderRadius: 14,
                  padding: 20,
                  fontFamily: "monospace",
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                <div
                  style={{
                    color: "var(--text-faint)",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 8,
                  }}
                >
                  $ Example
                </div>
                <pre
                  style={{
                    margin: 0,
                    color: "var(--text-primary)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {engine.example}
                </pre>
                <div
                  style={{
                    color: "var(--text-faint)",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginTop: 16,
                    marginBottom: 8,
                  }}
                >
                  ⌘ Output
                </div>
                <pre
                  style={{
                    margin: 0,
                    color: "var(--text-secondary)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {engine.output}
                </pre>
              </div>
            </div>
          ))}
        </section>

        <section
          style={{
            border: "1px solid var(--panel-border)",
            borderRadius: 16,
            background: "var(--panel-bg)",
            padding: 32,
            marginBottom: 48,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--text-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 12,
            }}
          >
            Performance
          </div>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 24,
              letterSpacing: "-0.02em",
            }}
          >
            Engineered for the edge
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
            }}
          >
            {[
              { label: "Cold scan", value: "<50ms", desc: "1ms measured (CVE)" },
              { label: "Warm scan", value: "<10ms", desc: "in-process TS" },
              { label: "Memory", value: "<30MB", desc: "resident" },
              { label: "CLI binary", value: "<5MB", desc: "signed, cross-OS" },
              { label: "Runtime data", value: "~165KB", desc: "in-memory JSON" },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--panel-border)",
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-faint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 6,
                  }}
                >
                  {stat.label}
                </div>
                <div
                  style={{ fontSize: 28, fontWeight: 600, color: "#3862e8", marginBottom: 4 }}
                >
                  {stat.value}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{stat.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            border: "1px solid #3862e8",
            borderRadius: 16,
            background: "linear-gradient(180deg, rgba(56,98,232,0.08), var(--bg-secondary))",
            padding: 40,
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontSize: 26,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 12,
              letterSpacing: "-0.02em",
            }}
          >
            AIDR Scan is included in every Pro plan.
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--text-secondary)",
              maxWidth: 600,
              margin: "0 auto 24px",
              lineHeight: "24px",
            }}
          >
            Pro = her şey. $5/agent/month. 14-day free trial, no credit card.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/pricing"
              style={{
                display: "inline-block",
                padding: "12px 28px",
                borderRadius: 10,
                background: "#3862e8",
                color: "white",
                textDecoration: "none",
                fontWeight: 500,
                fontSize: 15,
              }}
            >
              See Full Pricing
            </Link>
            <Link
              href="/compare"
              style={{
                display: "inline-block",
                padding: "12px 28px",
                borderRadius: 10,
                background: "transparent",
                color: "var(--text-primary)",
                textDecoration: "none",
                fontWeight: 500,
                fontSize: 15,
                border: "1px solid var(--panel-border)",
              }}
            >
              Compare vs Lakera · Lasso · Protect AI
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
