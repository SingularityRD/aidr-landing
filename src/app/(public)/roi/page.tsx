"use client";

import Link from "next/link";
import { useState } from "react";
import Background from "@/components/Background";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function ROIPage() {
  const [agents, setAgents] = useState(10);
  const [incidentsPerYear, setIncidentsPerYear] = useState(2);
  const [costPerIncident, setCostPerIncident] = useState(50000);
  const [proPlanPerAgent, setProPlanPerAgent] = useState(5);
  const [breachProbabilityReduction, setBreachProbabilityReduction] = useState(85);

  const annualProCost = agents * proPlanPerAgent * 12;
  const expectedAnnualLossWithoutAIDR = incidentsPerYear * costPerIncident;
  const expectedAnnualLossWithAIDR =
    expectedAnnualLossWithoutAIDR * (1 - breachProbabilityReduction / 100);
  const annualSavings = expectedAnnualLossWithoutAIDR - expectedAnnualLossWithAIDR;
  const netSavings = annualSavings - annualProCost;
  const roi = annualProCost > 0 ? (netSavings / annualProCost) * 100 : 0;
  const paybackMonths =
    annualSavings > 0 ? Math.max(1, Math.round((annualProCost / Math.max(annualSavings, 1)) * 12)) : 0;

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
            ROI Calculator
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
            What does AIDR Pro save you?
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
            Plug in your fleet size, expected incident rate, and the cost of a single
            AI-agent-related breach. We compute the rest.
          </p>
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          <div
            style={{
              border: "1px solid var(--panel-border)",
              borderRadius: 16,
              background: "var(--panel-bg)",
              padding: 28,
            }}
          >
            <Slider
              label="Number of AI agents"
              value={agents}
              onChange={setAgents}
              min={1}
              max={500}
              step={1}
              format={(v) => `${v} agents`}
            />
            <Slider
              label="Expected AI-agent incidents per year"
              value={incidentsPerYear}
              onChange={setIncidentsPerYear}
              min={0}
              max={20}
              step={1}
              format={(v) => `${v} incidents`}
            />
            <Slider
              label="Cost per AI-agent incident (USD)"
              value={costPerIncident}
              onChange={setCostPerIncident}
              min={1000}
              max={1000000}
              step={1000}
              format={(v) => `$${v.toLocaleString()}`}
            />
            <Slider
              label="AIDR Pro price per agent / month (USD)"
              value={proPlanPerAgent}
              onChange={setProPlanPerAgent}
              min={4}
              max={10}
              step={1}
              format={(v) => `$${v}/agent`}
            />
            <Slider
              label="AIDR breach-probability reduction (%)"
              value={breachProbabilityReduction}
              onChange={setBreachProbabilityReduction}
              min={0}
              max={99}
              step={1}
              format={(v) => `${v}%`}
            />
          </div>

          <div
            style={{
              border: "1px solid #3862e8",
              borderRadius: 16,
              background: "linear-gradient(180deg, rgba(56,98,232,0.06), var(--panel-bg))",
              padding: 28,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#3862e8",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              Your annual savings
            </div>
            <div
              style={{
                fontSize: 48,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 24,
                letterSpacing: "-0.02em",
              }}
            >
              ${Math.round(netSavings).toLocaleString()}
            </div>

            <Stat label="Annual Pro cost" value={`$${Math.round(annualProCost).toLocaleString()}`} />
            <Stat
              label="Expected loss without AIDR"
              value={`$${Math.round(expectedAnnualLossWithoutAIDR).toLocaleString()}`}
            />
            <Stat
              label="Expected loss with AIDR"
              value={`$${Math.round(expectedAnnualLossWithAIDR).toLocaleString()}`}
              highlight
            />
            <Stat label="Annual savings" value={`$${Math.round(annualSavings).toLocaleString()}`} />
            <Stat label="ROI" value={`${Math.round(roi).toLocaleString()}%`} highlight />
            <Stat label="Payback period" value={`${paybackMonths} month${paybackMonths === 1 ? "" : "s"}`} />

            <div style={{ marginTop: 24, padding: 16, background: "var(--bg-secondary)", borderRadius: 12 }}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: "20px", margin: 0 }}>
                <strong style={{ color: "var(--text-primary)" }}>Source:</strong> IBM 2024 Cost of a Data
                Breach Report average breach cost is $4.88M. AI-agent-related incidents scale with
                fleet size. AIDR Pro reduces breach probability by detecting and blocking
                tool-call-level attacks before they escalate.
              </p>
            </div>

            <div style={{ marginTop: 20 }}>
              <Link
                href="/login"
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "12px 20px",
                  borderRadius: 10,
                  background: "#3862e8",
                  color: "white",
                  textDecoration: "none",
                  fontWeight: 500,
                  fontSize: 14,
                }}
              >
                Start Pro — 14-day Free Trial
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <label style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>
          {label}
        </label>
        <span
          style={{
            fontSize: 14,
            color: "var(--text-primary)",
            fontWeight: 600,
            fontFamily: "monospace",
          }}
        >
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#3862e8" }}
      />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        borderTop: "1px solid var(--panel-border)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span
        style={{
          color: highlight ? "#3862e8" : "var(--text-primary)",
          fontWeight: highlight ? 600 : 500,
          fontFamily: "monospace",
        }}
      >
        {value}
      </span>
    </div>
  );
}
