"use client";

import { useState } from "react";

interface ProviderOption {
  id: "lemon_squeezy";
  name: string;
  icon: string;
  features: string[];
  recommended?: boolean;
}

interface PaymentProviderSelectorProps {
  onSelect: () => void;
  isSelected?: boolean;
}

export function PaymentProviderSelector({
  onSelect,
  isSelected = true,
}: PaymentProviderSelectorProps) {
  const provider: ProviderOption = {
    id: "lemon_squeezy",
    name: "🍋 Lemon Squeezy",
    icon: "/lemon-squeezy-logo.svg",
    features: [
      "Global payments",
      "Subscription management",
      "Tax compliance",
      "Instant invoicing",
    ],
    recommended: true,
  };

  return (
    <div className="payment-provider-selector">
      <h3 style={{ fontSize: 18, marginBottom: 16, color: "var(--text-primary)" }}>
        Payment Method
      </h3>
      <ProviderCard
        provider={provider}
        isSelected={isSelected}
        onClick={onSelect}
      />
    </div>
  );
}

interface ProviderCardProps {
  provider: ProviderOption;
  isSelected: boolean;
  onClick: () => void;
}

function ProviderCard({ provider, isSelected, onClick }: ProviderCardProps) {
  return (
    <div
      className={`provider-card ${isSelected ? "selected" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      style={{
        padding: 20,
        borderRadius: 12,
        border: `2px solid ${isSelected ? "#3862e8" : "var(--panel-border)"}`,
        background: isSelected
          ? "rgba(56, 98, 232, 0.1)"
          : "var(--bg-secondary)",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
    >
      <span
        className="badge recommended"
        style={{
          display: "inline-block",
          padding: "4px 8px",
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 600,
          background: "#3862e8",
          color: "white",
          marginBottom: 12,
        }}
      >
        Recommended
      </span>

      <h4
        style={{
          fontSize: 20,
          marginBottom: 12,
          color: "var(--text-primary)",
        }}
      >
        {provider.name}
      </h4>

      <ul
        className="features"
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
        }}
      >
        {provider.features.map((feature) => (
          <li
            key={feature}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              fontSize: 14,
              color: "var(--text-secondary)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#3862e8",
              }}
            />
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Get payment button text
export function getPaymentButtonText(): string {
  return "Subscribe with Lemon Squeezy";
}

// Get currency display symbol
export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    TRY: "₺",
    JPY: "¥",
  };
  return symbols[currency] || currency;
}

// Format price with psychological pricing (.99)
export function formatPrice(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  const formatted = amount.toFixed(2);
  return `${symbol}${formatted}`;
}
