"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface SeatInfo {
  included_agents: number;
  extra_agents: number;
  allowed_agents: number;
  current_agents: number;
}

export default function BillingPage() {
  const [seats, setSeats] = useState<SeatInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/agents/count")
      .then((r) => r.json())
      .then((agentData) => {
        const current = agentData.count ?? 0;
        setSeats({
          included_agents: 1,
          extra_agents: 0,
          allowed_agents: 1,
          current_agents: current,
        });
      })
      .catch(() => setSeats(null))
      .finally(() => setLoading(false));
  }, []);

  function panelStyle(): React.CSSProperties {
    return {
      border: "1px solid var(--panel-border)",
      borderRadius: 18,
      background: "var(--panel-bg)",
      boxShadow: "0 12px 36px var(--shadow-color)",
      padding: 24,
    };
  }

  if (loading) {
    return (
      <div className="stack" style={{ maxWidth: 800, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ ...panelStyle(), textAlign: "center" }}>Loading…</div>
      </div>
    );
  }

  const usagePercent = seats ? Math.min(100, (seats.current_agents / seats.allowed_agents) * 100) : 0;
  const canCheckout = !loading;

  return (
    <div className="stack" style={{ maxWidth: 800, margin: "0 auto", padding: "24px 20px" }}>
      <div style={panelStyle()}>
        <div style={{ color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em" }}>BILLING</div>
        <h1 style={{ fontSize: 28, color: "var(--text-primary)", margin: "8px 0" }}>Your Plan</h1>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 16,
            marginTop: 16,
          }}
        >
          <div style={{ padding: 16, borderRadius: 12, background: "var(--bg-secondary)", border: "1px solid var(--panel-border)" }}>
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Plan</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>Evaluation</div>
          </div>
          <div style={{ padding: 16, borderRadius: 12, background: "var(--bg-secondary)", border: "1px solid var(--panel-border)" }}>
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Agents</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
              {seats?.current_agents ?? 0} / {seats?.allowed_agents ?? 1}
            </div>
          </div>
          <div style={{ padding: 16, borderRadius: 12, background: "var(--bg-secondary)", border: "1px solid var(--panel-border)" }}>
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Pricing</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>By approved order</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 20 }}>
          <div style={{ height: 8, borderRadius: 4, background: "var(--bg-secondary)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${usagePercent}%`,
                background: usagePercent > 90 ? "#ef4444" : usagePercent > 70 ? "#f59e0b" : "#22c55e",
                borderRadius: 4,
                transition: "width 0.3s",
              }}
            />
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-faint)" }}>
            {usagePercent.toFixed(0)}% of the evaluation agent allowance used
          </div>
        </div>
      </div>

      {/* Upgrade card */}
      <div
        style={{
          ...panelStyle(),
          background: "linear-gradient(135deg, rgba(56,98,232,0.08), rgba(118,75,162,0.08))",
        }}
      >
        <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 8 }}>More agents</h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: "24px", margin: "0 0 16px" }}>
          Additional agents are added by approved order. Pricing is not published on this site and nothing here is a quote.{" "}
          <Link href="/contact?topic=sales" style={{ color: "var(--text-primary)" }}>
            Contact sales
          </Link>{" "}
          before starting checkout.
        </p>
        <button
          onClick={async () => {
            setLoading(true);
            try {
              const res = await fetch("/api/v1/billing-checkout", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ seats: 1 }),
              });
              const data = await res.json();
              if (data.checkout_url) {
                window.location.href = data.checkout_url;
              } else {
                alert("Checkout unavailable. Please try again.");
              }
            } finally {
              setLoading(false);
            }
          }}
          disabled={!canCheckout}
          style={{
            marginTop: 16,
            padding: "12px 24px",
            borderRadius: 10,
            border: "none",
            background: canCheckout ? "#3862e8" : "var(--bg-tertiary)",
            color: canCheckout ? "white" : "var(--text-faint)",
            fontSize: 14,
            fontWeight: 500,
            cursor: canCheckout ? "pointer" : "not-allowed",
          }}
        >
          {loading ? "Loading…" : "Start checkout for an agreed order"}
        </button>
      </div>
    </div>
  );
}
