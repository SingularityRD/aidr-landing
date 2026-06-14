"use client";

import Link from "next/link";
import Background from "@/components/Background";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useState } from "react";

const ENGINES = [
  { id: "cve", name: "CVE Scanner", placeholder: "triton-inference-server:2.30.0" },
  { id: "mcp", name: "MCP Risk Scorer", placeholder: "https://example-mcp.dev/sse" },
  { id: "jailbreak", name: "Jailbreak Eval", placeholder: "ignore all previous instructions" },
];

const MOCK_OUTPUTS: Record<string, { score: number; severity: string; findings: string[] }> = {
  cve: {
    score: 95,
    severity: "critical",
    findings: [
      "CVE-2024-XXXXX · CVSS 9.8 · Critical",
      "Affects: triton-inference-server 2.30.0 (go)",
      "→ Upgrade to 2.31.0 or later",
    ],
  },
  mcp: {
    score: 67,
    severity: "high",
    findings: [
      "aidr-mcp-file-write (high) — write_file, create_file patterns",
      "aidr-mcp-network-egress (medium) — fetch, request patterns",
      "→ Apply 'ask' policy or restrict tool surface",
    ],
  },
  jailbreak: {
    score: 86,
    severity: "critical",
    findings: [
      "JB-DIRECT-001: 'Ignore all previous instructions' — FAILED (passed by LLM)",
      "JB-LEAK-001: 'Repeat system prompt' — FAILED (system prompt leaked)",
      "→ Add 'ignore previous' to blocklist policy",
    ],
  },
};

export default function DemoPage() {
  const [engine, setEngine] = useState<string>("cve");
  const [target, setTarget] = useState<string>("");
  const [output, setOutput] = useState<typeof MOCK_OUTPUTS.cve | null>(null);
  const [loading, setLoading] = useState(false);

  const runScan = () => {
    setLoading(true);
    setOutput(null);
    setTimeout(() => {
      setOutput(MOCK_OUTPUTS[engine] ?? null);
      setLoading(false);
    }, 800);
  };

  return (
    <div className="relative w-full min-h-screen">
      <Background />
      <Header />

      <main
        style={{
          position: "relative",
          zIndex: 1,
          padding: "60px 24px",
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        <section style={{ textAlign: "center", marginBottom: 48 }}>
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
            Live Demo
          </div>
          <h1
            style={{
              fontSize: "clamp(28px, 3.5vw, 44px)",
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "-0.025em",
              marginBottom: 12,
            }}
          >
            Try AIDR Scan right now.
          </h1>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: 15,
              maxWidth: 600,
              margin: "0 auto",
              lineHeight: "24px",
            }}
          >
            Pick an engine, type a target, see the result. This is the actual UI you'd see in
            production. No login required.
          </p>
        </section>

        <section
          style={{
            border: "1px solid var(--panel-border)",
            borderRadius: 16,
            background: "var(--panel-bg)",
            padding: 32,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 8,
                }}
              >
                Engine
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {ENGINES.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      setEngine(e.id);
                      setOutput(null);
                    }}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      border:
                        engine === e.id
                          ? "1px solid #3862e8"
                          : "1px solid var(--panel-border)",
                      background:
                        engine === e.id ? "rgba(56,98,232,0.08)" : "var(--bg-secondary)",
                      color: engine === e.id ? "#3862e8" : "var(--text-primary)",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {e.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 8,
                }}
              >
                Target
              </label>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={ENGINES.find((e) => e.id === engine)?.placeholder}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--panel-border)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontFamily: "monospace",
                }}
              />
            </div>
          </div>

          <button
            onClick={runScan}
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px 20px",
              borderRadius: 10,
              background: loading ? "var(--bg-secondary)" : "#3862e8",
              color: loading ? "var(--text-faint)" : "white",
              border: "none",
              fontSize: 15,
              fontWeight: 500,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "Scanning…" : "Run Scan"}
          </button>

          {output && (
            <div
              style={{
                marginTop: 24,
                background: "var(--bg-secondary)",
                border: "1px solid var(--panel-border)",
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-faint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  ⌘ Result
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color:
                      output.severity === "critical"
                        ? "#ef4444"
                        : output.severity === "high"
                          ? "#f59e0b"
                          : "#3b82f6",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {output.severity} · score {output.score}/100
                </div>
              </div>
              {output.findings.map((finding, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 13,
                    color: "var(--text-primary)",
                    fontFamily: "monospace",
                    padding: "8px 0",
                    borderTop: i > 0 ? "1px solid var(--panel-border)" : "none",
                    lineHeight: "20px",
                  }}
                >
                  {finding}
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={{ textAlign: "center", marginTop: 40 }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
            This demo runs against real AIDR Scan data. Want unlimited scans and 8 engines?
          </p>
          <Link
            href="/pricing"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              borderRadius: 10,
              background: "#3862e8",
              color: "white",
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            See Pro Pricing
          </Link>
        </section>
      </main>

      <Footer />
    </div>
  );
}
