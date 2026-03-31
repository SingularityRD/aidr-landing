"use client";

import { useEffect, useState } from "react";
import { createCheckout, USD_PER_EXTRA_AGENT_PER_MONTH } from "./lemon-client";

interface Seat {
  id: string;
  agentName: string;
  agentType: "claude" | "cursor" | "vscode" | "openclaw" | "opencode";
  status: "active" | "paused" | "deleted";
  lastSeenAt?: string;
  createdAt: string;
}

interface Subscription {
  id: string;
  lemonSubscriptionId: string;
  status: string;
  planType: string;
  seats: number;
  currentPeriodEnd?: string;
  provider: string;
}

interface SeatManagerProps {
  userId: string;
  userEmail: string;
  subscription: Subscription | null;
  seats: Seat[];
  credits: number;
  onSeatUpdate?: () => void;
}

export function SeatManager({
  userId,
  userEmail,
  subscription,
  seats,
  credits,
  onSeatUpdate,
}: SeatManagerProps) {
  const [isAddingSeat, setIsAddingSeat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localSeats, setLocalSeats] = useState<Seat[]>(seats);

  useEffect(() => {
    setLocalSeats(seats);
  }, [seats]);

  async function addSeat() {
    if (!userEmail || !subscription) {
      setError("Please complete onboarding first");
      return;
    }

    setIsAddingSeat(true);
    setError(null);

    try {
      const newSeatCount = (subscription?.seats || 0) + 1;

      // Lemon Squeezy checkout oluştur (prorated upgrade)
      const { checkoutUrl } = await createCheckout(
        userId,
        userEmail,
        newSeatCount,
        (subscription?.planType as "monthly" | "yearly") || "monthly"
      );

      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create checkout");
      setIsAddingSeat(false);
    }
  }

  async function pauseSeat(seatId: string) {
    // Call API to pause seat
    try {
      const response = await fetch(`/api/seats/${seatId}/pause`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to pause seat");

      setLocalSeats((prev) =>
        prev.map((s) => (s.id === seatId ? { ...s, status: "paused" } : s))
      );
      onSeatUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause seat");
    }
  }

  async function resumeSeat(seatId: string) {
    try {
      const response = await fetch(`/api/seats/${seatId}/resume`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to resume seat");

      setLocalSeats((prev) =>
        prev.map((s) => (s.id === seatId ? { ...s, status: "active" } : s))
      );
      onSeatUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume seat");
    }
  }

  async function deleteSeat(seatId: string) {
    if (!confirm("Are you sure you want to delete this seat?")) return;

    try {
      const response = await fetch(`/api/seats/${seatId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete seat");

      setLocalSeats((prev) => prev.filter((s) => s.id !== seatId));
      onSeatUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete seat");
    }
  }

  const activeSeats = localSeats.filter((s) => s.status === "active").length;
  const maxSeats = subscription?.seats || 1;
  const canAddMore = activeSeats < maxSeats;

  const getAgentIcon = (type: string) => {
    switch (type) {
      case "claude":
        return "🤖";
      case "cursor":
        return "💻";
      case "vscode":
        return "📝";
      case "openclaw":
        return "🦀";
      case "opencode":
        return "🚀";
      default:
        return "🤖";
    }
  };

  return (
    <div className="card">
      <h2 style={{ fontSize: 24, marginBottom: 16, color: "var(--text-primary)" }}>
        Agent Seats
      </h2>

      {error && (
        <div
          className="notice notice-danger"
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#ef4444",
          }}
        >
          ⚠️ {error}
        </div>
      )}

      <div
        className="grid"
        style={{
          marginTop: 16,
          marginBottom: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 16,
        }}
      >
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: "var(--bg-secondary)",
            border: "1px solid var(--panel-border)",
          }}
        >
          <div className="muted small" style={{ fontSize: 12, color: "var(--text-faint)" }}>
            Active Seats
          </div>
          <div
            className="mono"
            style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)" }}
          >
            {activeSeats}
          </div>
        </div>
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: "var(--bg-secondary)",
            border: "1px solid var(--panel-border)",
          }}
        >
          <div className="muted small" style={{ fontSize: 12, color: "var(--text-faint)" }}>
            Total Seats
          </div>
          <div
            className="mono"
            style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)" }}
          >
            {maxSeats}
          </div>
        </div>
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: "var(--bg-secondary)",
            border: "1px solid var(--panel-border)",
          }}
        >
          <div className="muted small" style={{ fontSize: 12, color: "var(--text-faint)" }}>
            Plan
          </div>
          <div
            className="mono"
            style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}
          >
            {subscription?.planType === "yearly"
              ? "Yearly"
              : subscription?.planType === "monthly"
              ? "Monthly"
              : "Free"}
          </div>
        </div>
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: "var(--bg-secondary)",
            border: "1px solid var(--panel-border)",
          }}
        >
          <div className="muted small" style={{ fontSize: 12, color: "var(--text-faint)" }}>
            Provider
          </div>
          <div
            className="mono"
            style={{ fontSize: 16, color: "var(--text-primary)" }}
          >
            {subscription?.provider === "lemon_squeezy"
              ? "🍋 Lemon Squeezy"
              : subscription?.provider || "Free"}
          </div>
        </div>
      </div>

      {credits > 0 && (
        <div
          className="notice"
          style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
          }}
        >
          🎉 You have <strong>{credits}</strong> free month(s) from referrals!
        </div>
      )}

      {subscription?.currentPeriodEnd && (
        <div className="muted small" style={{ marginBottom: 16, color: "var(--text-faint)" }}>
          Next billing: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
        </div>
      )}

      {/* Seats Table */}
      <div style={{ marginTop: 20 }}>
        <h4 style={{ fontSize: 16, marginBottom: 12, color: "var(--text-primary)" }}>
          Your Agent Seats
        </h4>
        {localSeats.length === 0 ? (
          <p className="muted" style={{ color: "var(--text-secondary)" }}>
            No agents registered yet
          </p>
        ) : (
          <table
            className="table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--table-border)",
                }}
              >
                <th style={{ textAlign: "left", padding: "12px 8px" }}>Agent</th>
                <th style={{ textAlign: "left", padding: "12px 8px" }}>Type</th>
                <th style={{ textAlign: "left", padding: "12px 8px" }}>Status</th>
                <th style={{ textAlign: "left", padding: "12px 8px" }}>Last Seen</th>
                <th style={{ textAlign: "right", padding: "12px 8px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {localSeats.map((seat) => (
                <tr
                  key={seat.id}
                  style={{
                    borderBottom: "1px solid var(--table-border)",
                  }}
                >
                  <td style={{ padding: "12px 8px" }}>
                    <span>{getAgentIcon(seat.agentType)}</span> {seat.agentName}
                  </td>
                  <td className="mono" style={{ padding: "12px 8px", color: "var(--text-faint)" }}>
                    {seat.agentType}
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 8px",
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 500,
                        background:
                          seat.status === "active"
                            ? "rgba(34, 197, 94, 0.1)"
                            : seat.status === "paused"
                            ? "rgba(234, 179, 8, 0.1)"
                            : "rgba(239, 68, 68, 0.1)",
                        color:
                          seat.status === "active"
                            ? "#22c55e"
                            : seat.status === "paused"
                            ? "#eab308"
                            : "#ef4444",
                      }}
                    >
                      {seat.status === "active"
                        ? "🟢 Active"
                        : seat.status === "paused"
                        ? "⏸️ Paused"
                        : "❌ Deleted"}
                    </span>
                  </td>
                  <td className="muted small" style={{ padding: "12px 8px", color: "var(--text-faint)" }}>
                    {seat.lastSeenAt
                      ? new Date(seat.lastSeenAt).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td style={{ padding: "12px 8px", textAlign: "right" }}>
                    <div
                      className="row"
                      style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
                    >
                      {seat.status === "active" ? (
                        <button
                          className="button button-sm button-secondary"
                          onClick={() => pauseSeat(seat.id)}
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            borderRadius: 6,
                            border: "1px solid var(--panel-border)",
                            background: "transparent",
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                          }}
                        >
                          Pause
                        </button>
                      ) : seat.status === "paused" ? (
                        <button
                          className="button button-sm"
                          onClick={() => resumeSeat(seat.id)}
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            borderRadius: 6,
                            border: "none",
                            background: "#3862e8",
                            color: "white",
                            cursor: "pointer",
                          }}
                        >
                          Resume
                        </button>
                      ) : null}
                      <button
                        className="button button-sm button-danger"
                        onClick={() => deleteSeat(seat.id)}
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          borderRadius: 6,
                          border: "none",
                          background: "#ef4444",
                          color: "white",
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div
        className="row"
        style={{ marginTop: 20, display: "flex", gap: 12 }}
      >
        <button
          className="button"
          onClick={addSeat}
          disabled={!canAddMore || isAddingSeat}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            background: canAddMore ? "#3862e8" : "var(--bg-tertiary)",
            color: canAddMore ? "white" : "var(--text-faint)",
            cursor: canAddMore ? "pointer" : "not-allowed",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {isAddingSeat ? "Loading..." : canAddMore ? "+ Add Seat" : "Seat Limit Reached"}
        </button>
        <button
          className="button button-secondary"
          onClick={() => onSeatUpdate?.()}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "1px solid var(--panel-border)",
            background: "transparent",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Refresh
        </button>
      </div>

      {!canAddMore && subscription && (
        <p
          className="muted small"
          style={{
            marginTop: 12,
            color: "var(--text-faint)",
            fontSize: 12,
          }}
        >
          You&apos;ve reached your seat limit. Upgrade your plan to add more agents.
        </p>
      )}
    </div>
  );
}

// Calculate monthly estimate
export function calculateMonthlyEstimate(agentCount: number): number {
  // Commercial model: first agent is free, each additional is $2/mo
  const billable = Math.max(0, agentCount - 1);
  return billable * USD_PER_EXTRA_AGENT_PER_MONTH;
}
