"use client";

import Link from "next/link";
import { useSmartUser } from "@/hooks/useSmartUser";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "For individual developers getting started with AI agent security.",
    cta: "Get Started",
    href: "/login",
    features: [
      "1 protected agent",
      "Full detection engine (4 layers)",
      "Dashboard access",
      "Incident management",
      "Audit logging with redaction",
      "Community support",
    ],
    border: "var(--panel-border)",
    bg: "var(--bg-secondary)",
  },
  {
    name: "Pro",
    price: "$5",
    period: "/agent/month",
    desc: "For teams and power users with multiple AI agents to protect. $4/agent/month when billed yearly.",
    cta: "Upgrade to Pro",
    href: "/login",
    popular: true,
    features: [
      "Everything in Free",
      "Unlimited agents",
      "Team management",
      "Priority support",
      "Seat-based billing",
      "Polar secure checkout",
      "Yearly plan: $4/agent/month",
    ],
    border: "#3862e8",
    bg: "linear-gradient(180deg, rgba(56,98,232,0.06), var(--bg-secondary))",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "For organizations needing fleet-wide policy control and compliance.",
    cta: "Contact Sales",
    href: "mailto:sales@singularityrd.com",
    features: [
      "Everything in Pro",
      "Org-wide policy distribution",
      "Audit exports & compliance reports",
      "Dedicated SLAs",
      "Custom integrations",
      "On-premise deployment available",
    ],
    border: "var(--panel-border)",
    bg: "var(--bg-secondary)",
  },
];

const paymentInfo = [
  {
    title: "Global Payments",
    desc: "We use Polar as our payment provider, powered by Stripe. Accepts Visa, Mastercard, American Express, Apple Pay, and Google Pay worldwide — including Turkey.",
  },
  {
    title: "Merchant of Record",
    desc: "Polar acts as the Merchant of Record, handling tax compliance, VAT, and invoicing globally. No additional tax setup needed on your end.",
  },
  {
    title: "Seat-Based Billing",
    desc: "You're billed only for active agents. Add or remove agents anytime. Prorated credits for unused portions of the billing period.",
  },
  {
    title: "No Lock-In",
    desc: "Cancel anytime. Your agents remain protected with local detection even if your subscription ends. Only cloud sync features are downgraded.",
  },
];

export default function PricingPage() {
  const { isSignedIn, isLoaded } = useSmartUser();

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "60px 24px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
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
          Pricing
        </div>
        <h1
          style={{
            fontSize: "clamp(28px, 3vw, 40px)",
            fontWeight: 600,
            color: "var(--text-primary)",
            letterSpacing: "-0.025em",
            marginBottom: 12,
          }}
        >
          Simple, agent-based pricing
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 15, maxWidth: 500, margin: "0 auto", lineHeight: "24px" }}>
          1 agent is always free. No time limit, no credit card. 
          Add more agents for <strong>$5/agent/month</strong> when your fleet grows. 
          <strong>$4/agent/month</strong> when billed yearly.
        </p>
      </div>

      {/* Plans */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          marginBottom: 48,
        }}
      >
        {plans.map((plan) => (
          <div
            key={plan.name}
            style={{
              border: `1px solid ${plan.border}`,
              borderRadius: 16,
              background: plan.bg,
              padding: 28,
              position: "relative",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {plan.popular && (
              <span
                style={{
                  position: "absolute",
                  top: -12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  padding: "4px 14px",
                  borderRadius: 20,
                  background: "#3862e8",
                  color: "white",
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                Most Popular
              </span>
            )}

            <div style={{ fontSize: 14, fontWeight: 600, color: plan.popular ? "#3862e8" : "var(--text-faint)", marginBottom: 8 }}>
              {plan.name}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 36, fontWeight: 600, color: "var(--text-primary)" }}>{plan.price}</span>
              {plan.period && (
                <span style={{ fontSize: 14, color: "var(--text-secondary)", marginLeft: 4 }}>{plan.period}</span>
              )}
            </div>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: "22px", marginBottom: 20, marginTop: 8 }}>
              {plan.desc}
            </p>

            <Link
              href={plan.href}
              style={{
                display: "block",
                textAlign: "center",
                padding: "12px 20px",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 500,
                fontSize: 14,
                marginBottom: 20,
                ...(plan.popular
                  ? {
                      background: "#3862e8",
                      color: "white",
                      border: "1px solid #3862e8",
                    }
                  : {
                      background: "transparent",
                      color: "var(--text-primary)",
                      border: "1px solid var(--panel-border)",
                    }),
              }}
            >
              {plan.cta}
            </Link>

            <ul style={{ margin: 0, padding: 0, listStyle: "none", flex: 1 }}>
              {plan.features.map((f) => (
                <li
                  key={f}
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: "28px",
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: plan.popular ? "#3862e8" : "#22c55e", flexShrink: 0 }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Payment Info */}
      <div
        style={{
          border: "1px solid var(--panel-border)",
          borderRadius: 16,
          background: "var(--panel-bg)",
          padding: "28px 32px",
          marginBottom: 48,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--text-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 18,
          }}
        >
          Payment & Billing
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {paymentInfo.map((info) => (
            <div
              key={info.title}
              style={{
                border: "1px solid var(--panel-border)",
                borderRadius: 12,
                background: "var(--bg-secondary)",
                padding: 18,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                {info.title}
              </div>
              <div style={{ fontSize: 13, lineHeight: "20px", color: "var(--text-secondary)" }}>
                {info.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div
        style={{
          border: "1px solid var(--panel-border)",
          borderRadius: 16,
          background: "var(--panel-bg)",
          padding: "28px 32px",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--text-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 18,
          }}
        >
          Billing FAQ
        </div>
        {[
          { q: "Can I pay from Turkey?", a: "Yes! Polar supports global payments including cards issued in Turkey. You'll be charged in USD but your bank will handle the conversion. Polar acts as Merchant of Record and handles Turkish VAT/compliance automatically." },
          { q: "What payment methods are accepted?", a: "Visa, Mastercard, American Express, Apple Pay, and Google Pay. All processed securely through Stripe via Polar." },
          { q: "Can I cancel anytime?", a: "Yes. No lock-in contracts. Your local agent protection continues working even after cancellation — only cloud sync and dashboard features require an active subscription." },
          { q: "How does seat billing work?", a: "You're billed for the number of active agents. Add or remove agents anytime. Changes are prorated for the remainder of the billing period." },
          { q: "Do you offer refunds?", a: "Yes — full refund within 14 days of purchase, no questions asked. Contact our support team to process." },
          { q: "Is there an enterprise plan?", a: "Yes. Enterprise includes org-wide policy distribution, compliance audit exports, dedicated SLAs, and custom integrations. Contact us at sales@singularityrd.com." },
        ].map((faq) => (
          <details
            key={faq.q}
            style={{
              border: "1px solid var(--panel-border)",
              borderRadius: 12,
              padding: "14px 18px",
              background: "var(--bg-secondary)",
              cursor: "pointer",
              marginBottom: 8,
            }}
          >
            <summary style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", outline: "none" }}>
              {faq.q}
            </summary>
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: "22px", color: "var(--text-secondary)" }}>
              {faq.a}
            </div>
          </details>
        ))}
      </div>

      {/* CTA */}
      <div style={{ textAlign: "center", marginTop: 48 }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 15, marginBottom: 16 }}>
          1 free agent. No credit card. Start protecting your AI agents in minutes.
        </p>
        {isLoaded && !isSignedIn ? (
          <Link
            href="/login"
            style={{
              display: "inline-block",
              padding: "12px 28px",
              borderRadius: 10,
              background: "var(--text-primary)",
              color: "var(--bg-primary)",
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 15,
            }}
          >
            Get Started Free
          </Link>
        ) : null}
      </div>
    </div>
  );
}
