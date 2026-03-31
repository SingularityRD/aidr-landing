"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "../../../lib/supabase/client";
import { PaymentProviderSelector } from "../../../lib/billing/provider-selector";
import { SeatManager } from "../../../lib/billing/seat-manager";
import { calculateMonthlyEstimate } from "../../../lib/billing/lemon-client";

const USD_PER_EXTRA_AGENT_PER_MONTH = 2;

type EntitlementsRow = { included_agents: number; extra_agents: number };
type SeatUsageRow = {
  included_agents: number;
  extra_agents: number;
  allowed_agents: number;
  current_agents: number;
};
type SubscriptionRow = {
  provider: string;
  provider_subscription_id: string;
  status: string;
  extra_agents: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
};

type AgentSeat = {
  id: string;
  agent_name: string;
  agent_type: "claude" | "cursor" | "vscode" | "openclaw" | "opencode";
  status: "active" | "paused" | "deleted";
  updated_at?: string;
  created_at: string;
};

function BillingContent() {
  const searchParams = useSearchParams();
  const [entitlements, setEntitlements] = useState<EntitlementsRow | null>(null);
  const [agentCount, setAgentCount] = useState<number>(0);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seats, setSeats] = useState<AgentSeat[]>([]);
  const [credits, setCredits] = useState(0);
  const [userId, setUserId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  const supabase = getSupabaseBrowserClient();

  async function loadData() {
    setError(null);
    setIsLoading(true);

    // Get current user
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setError("Please sign in to view billing information");
      setIsLoading(false);
      return;
    }

    setUserId(session.user.id);
    setUserEmail(session.user.email || "");

    // Load seat usage, subscription, and checkout
    const [seatRes, subRes, checkoutRes, seatsRes, creditsRes] = await Promise.all([
      (async () => {
        const res = await supabase
          .from("seat_usage")
          .select("included_agents,extra_agents,allowed_agents,current_agents")
          .maybeSingle();
        if (!res.error) return res;
        // Back-compat if the view hasn't been deployed yet
        const [entRes, agentsRes] = await Promise.all([
          supabase.from("entitlements").select("included_agents,extra_agents").maybeSingle(),
          supabase.from("agents").select("id", { count: "exact", head: true }),
        ]);
        if (entRes.error) return { data: null, error: entRes.error } as typeof res;
        const ent = (entRes.data ?? null) as EntitlementsRow | null;
        const included = Number(ent?.included_agents ?? 1);
        const extra = Number(ent?.extra_agents ?? 0);
        return {
          data: {
            included_agents: included,
            extra_agents: extra,
            allowed_agents: included + extra,
            current_agents: Number(agentsRes.count ?? 0),
          },
          error: null,
        } as unknown as typeof res;
      })(),
      supabase
        .from("subscriptions")
        .select(
          "provider,provider_subscription_id,status,extra_agents,current_period_end,cancel_at_period_end,updated_at"
        )
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.functions.invoke("billing-checkout", { method: "GET" }),
      supabase
        .from("agent_seats")
        .select("*")
        .eq("user_id", session.user.id)
        .neq("status", "deleted"),
      supabase
        .from("referral_credits")
        .select("credit_months")
        .eq("referrer_id", session.user.id)
        .eq("status", "active"),
    ]);

    if (seatRes.error) {
      setError(seatRes.error.message);
      setEntitlements(null);
      setAgentCount(0);
    } else {
      const row = (seatRes.data ?? null) as SeatUsageRow | null;
      setEntitlements(
        row
          ? {
              included_agents: Number(row.included_agents ?? 1),
              extra_agents: Number(row.extra_agents ?? 0),
            }
          : null
      );
      setAgentCount(Number(row?.current_agents ?? 0));
    }

    if (subRes.error) setError(subRes.error.message);
    else setSubscription((subRes.data ?? null) as SubscriptionRow | null);

    if (!checkoutRes.error) {
      const data = (checkoutRes.data ?? {}) as { checkout_url?: string };
      setCheckoutUrl(typeof data.checkout_url === "string" ? data.checkout_url : null);
    }

    // Load seats
    if (seatsRes.error) {
      console.error("Failed to load seats:", seatsRes.error);
    } else {
      setSeats((seatsRes.data || []) as AgentSeat[]);
    }

    // Calculate credits
    if (!creditsRes.error && creditsRes.data) {
      const totalCredits = (creditsRes.data as { credit_months: number }[]).reduce(
        (sum, c) => sum + (c.credit_months || 0),
        0
      );
      setCredits(totalCredits);
    }

    setIsLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  // Handle success/cancel from Lemon Squeezy redirect
  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");

    if (success) {
      setError(null);
      // Refresh data after successful payment
      loadData();
    }
    if (canceled) {
      setError("Payment was canceled. You can try again anytime.");
    }
  }, [searchParams]);

  const included = Number(entitlements?.included_agents ?? 1);
  const extra = Number(entitlements?.extra_agents ?? 0);
  const allowed = Math.max(0, included + extra);
  const overLimit = allowed > 0 && agentCount > allowed;

  const monthlyEstimateUsd = useMemo(() => {
    return calculateMonthlyEstimate(agentCount);
  }, [agentCount]);

  // Format subscription data for SeatManager
  const formattedSubscription = subscription
    ? {
        id: subscription.provider_subscription_id,
        lemonSubscriptionId: subscription.provider_subscription_id,
        status: subscription.status,
        planType: subscription.extra_agents > 0 ? "monthly" : "free",
        seats: allowed,
        currentPeriodEnd: subscription.current_period_end || undefined,
        provider: subscription.provider,
      }
    : null;

  // Format seats for SeatManager
  const formattedSeats = seats.map((s) => ({
    id: s.id,
    agentName: s.agent_name,
    agentType: s.agent_type,
    status: s.status,
    lastSeenAt: s.updated_at,
    createdAt: s.created_at,
  }));

  if (isLoading) {
    return (
      <div className="stack" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
        <div
          className="card"
          style={{
            border: "1px solid var(--panel-border)",
            background: "var(--panel-bg)",
            borderRadius: 16,
            padding: 24,
          }}
        >
          <div style={{ color: "var(--text-secondary)" }}>Loading billing information...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
      <div
        className="card"
        style={{
          border: "1px solid var(--panel-border)",
          background: "var(--panel-bg)",
          borderRadius: 16,
          padding: 24,
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 32, marginBottom: 8, color: "var(--text-primary)" }}>Billing</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
          1 agent is free. Additional agents are{" "}
          <b>${USD_PER_EXTRA_AGENT_PER_MONTH}/month</b> each.
        </p>
        {error ? (
          <div
            className="notice notice-danger"
            style={{
              padding: 12,
              borderRadius: 8,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#ef4444",
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        ) : null}
      </div>

      {/* Payment Provider Selector */}
      <div
        className="card"
        style={{
          border: "1px solid var(--panel-border)",
          background: "var(--panel-bg)",
          borderRadius: 16,
          padding: 24,
          marginBottom: 20,
        }}
      >
        <PaymentProviderSelector onSelect={() => {}} isSelected={true} />
      </div>

      {/* Subscription Info */}
      <div
        className="card"
        style={{
          border: "1px solid var(--panel-border)",
          background: "var(--panel-bg)",
          borderRadius: 16,
          padding: 24,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 24, marginBottom: 16, color: "var(--text-primary)" }}>
          Subscription
        </h2>
        {subscription ? (
          <div
            className="notice"
            style={{
              padding: 16,
              borderRadius: 12,
              background: "var(--bg-secondary)",
              border: "1px solid var(--panel-border)",
            }}
          >
            <div
              className="grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 16,
              }}
            >
              <div>
                <div className="muted small" style={{ fontSize: 12, color: "var(--text-faint)" }}>
                  Provider
                </div>
                <div className="mono" style={{ color: "var(--text-primary)" }}>
                  {subscription.provider === "lemon_squeezy"
                    ? "🍋 Lemon Squeezy"
                    : subscription.provider}
                </div>
              </div>
              <div>
                <div className="muted small" style={{ fontSize: 12, color: "var(--text-faint)" }}>
                  Status
                </div>
                <div className="mono" style={{ color: "var(--text-primary)" }}>
                  {subscription.status}
                </div>
              </div>
              <div>
                <div className="muted small" style={{ fontSize: 12, color: "var(--text-faint)" }}>
                  Extra agents
                </div>
                <div className="mono" style={{ color: "var(--text-primary)" }}>
                  {subscription.extra_agents}
                </div>
              </div>
            </div>
            {subscription.current_period_end ? (
              <div className="muted small" style={{ marginTop: 12, color: "var(--text-faint)" }}>
                Period end:{" "}
                <span className="mono" style={{ color: "var(--text-primary)" }}>
                  {new Date(subscription.current_period_end).toLocaleString()}
                </span>
              </div>
            ) : null}
            {subscription.cancel_at_period_end ? (
              <div
                className="notice notice-danger"
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 8,
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#ef4444",
                }}
              >
                Cancellation scheduled at period end.
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className="notice"
            style={{
              padding: 16,
              borderRadius: 12,
              background: "var(--bg-secondary)",
              border: "1px solid var(--panel-border)",
            }}
          >
            <div style={{ color: "var(--text-secondary)" }}>
              No active subscription found yet.
            </div>
          </div>
        )}

        {checkoutUrl ? (
          <div className="row" style={{ marginTop: 16, display: "flex", gap: 12 }}>
            <a
              className="button"
              href={checkoutUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                padding: "12px 24px",
                borderRadius: 8,
                background: "#3862e8",
                color: "white",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              Upgrade seats
            </a>
          </div>
        ) : (
          <div className="muted small" style={{ marginTop: 16, color: "var(--text-faint)" }}>
            Checkout is not configured.
          </div>
        )}
      </div>

      {/* Seats Summary */}
      <div
        className="card"
        style={{
          border: "1px solid var(--panel-border)",
          background: "var(--panel-bg)",
          borderRadius: 16,
          padding: 24,
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 24, marginBottom: 16, color: "var(--text-primary)" }}>Seats</h2>
        <div
          className="grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 16,
            marginBottom: 16,
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
              Included
            </div>
            <div className="mono" style={{ fontSize: 24, color: "var(--text-primary)" }}>
              {included}
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
              Extra
            </div>
            <div className="mono" style={{ fontSize: 24, color: "var(--text-primary)" }}>
              {extra}
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
              Allowed
            </div>
            <div className="mono" style={{ fontSize: 24, color: "var(--text-primary)" }}>
              {allowed}
            </div>
          </div>
        </div>

        <div
          className="notice"
          style={{
            padding: 16,
            borderRadius: 12,
            background: "var(--bg-secondary)",
            border: "1px solid var(--panel-border)",
          }}
        >
          <div className="muted small" style={{ fontSize: 12, color: "var(--text-faint)" }}>
            Current connected agents
          </div>
          <div className="mono" style={{ fontSize: 24, marginTop: 4, color: "var(--text-primary)" }}>
            {agentCount}
          </div>
          <div className="muted small" style={{ marginTop: 12, color: "var(--text-faint)" }}>
            Estimated monthly total (based on connected agents):{" "}
            <span className="mono" style={{ color: "var(--text-primary)" }}>
              ${monthlyEstimateUsd}
            </span>
          </div>
          {overLimit ? (
            <div
              className="notice notice-danger"
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 8,
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#ef4444",
              }}
            >
              Over limit: new agents may be rejected by the ingest function until you upgrade seats.
            </div>
          ) : null}
        </div>
      </div>

      {/* Seat Manager */}
      {userId && (
        <SeatManager
          userId={userId}
          userEmail={userEmail}
          subscription={formattedSubscription}
          seats={formattedSeats}
          credits={credits}
          onSeatUpdate={loadData}
        />
      )}

      {/* Support */}
      <div
        className="card"
        style={{
          border: "1px solid var(--panel-border)",
          background: "var(--panel-bg)",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <h2 style={{ fontSize: 24, marginBottom: 16, color: "var(--text-primary)" }}>Support</h2>
        <p style={{ color: "var(--text-secondary)", lineHeight: "24px" }}>
          If your seat count does not update after purchase, wait a few minutes for the billing
          webhook to reconcile entitlements, then refresh. Manual entitlement grants are available
          for support escalations.
        </p>
      </div>
    </div>
  );
}

// Loading fallback
function BillingLoading() {
  return (
    <div className="stack" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
      <div
        className="card"
        style={{
          border: "1px solid var(--panel-border)",
          background: "var(--panel-bg)",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <div style={{ color: "var(--text-secondary)" }}>Loading billing information...</div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingLoading />}>
      <BillingContent />
    </Suspense>
  );
}
