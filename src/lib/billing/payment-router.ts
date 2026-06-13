import { createCheckout } from "./lemon-client";

export type ProviderType = "polar" | "lemon_squeezy";

export interface PaymentResult {
  url: string;
  provider: ProviderType;
  session_id?: string;
  checkout_id?: string;
}

export interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: "succeeded" | "failed" | "pending" | "unknown";
  created_at: string;
  pdf_url: string | null;
}

interface UserLocation {
  country: string;
  region?: string;
  currency?: string;
}

interface ProviderConfig {
  primary: ProviderType;
  supportedCurrencies: string[];
  features: string[];
}

// Region-based provider configuration. Polar is the target production billing
// provider; Lemon Squeezy is kept as a legacy compatibility path.
const REGION_CONFIG: Record<string, ProviderConfig> = {
  US: {
    primary: "polar",
    supportedCurrencies: ["USD", "EUR", "GBP"],
    features: ["Subscription management", "Webhook-signed entitlement sync"],
  },
  EU: {
    primary: "polar",
    supportedCurrencies: ["EUR", "USD", "GBP"],
    features: ["Global SaaS billing", "Seat enforcement"],
  },
  GLOBAL: {
    primary: "polar",
    supportedCurrencies: ["USD", "EUR", "GBP", "JPY", "AUD", "CAD"],
    features: ["Global coverage", "Subscription management"],
  },
};

/**
 * Legacy payment/subscription helper via Lemon Squeezy.
 *
 * New production checkout paths should use the Polar-backed API routes. This
 * helper remains for old deployments until Lemon-era code is removed.
 */
export async function createPayment(
  userId: string,
  userEmail: string,
  seats: number,
  plan: "monthly" | "yearly",
  referralCode?: string
): Promise<PaymentResult> {
  const checkout = await createCheckout(
    userId,
    userEmail,
    seats,
    plan,
    referralCode
  );

  return {
    url: checkout.checkoutUrl,
    provider: "lemon_squeezy",
    checkout_id: checkout.checkoutId,
  };
}

/**
 * Get available providers.
 */
export function getAvailableProviders(): Array<{
  id: ProviderType;
  name: string;
  features: string[];
  recommended?: boolean;
}> {
  return [
    {
      id: "polar",
      name: "Polar",
      features: [
        "Tax compliance",
        "Subscription management",
        "Webhook-signed entitlement sync",
        "Seat enforcement",
      ],
      recommended: true,
    },
    {
      id: "lemon_squeezy",
      name: "Lemon Squeezy (legacy)",
      features: ["Legacy checkout compatibility"],
    },
  ];
}

/**
 * Get provider configuration for a region
 */
export function getRegionConfig(country: string): ProviderConfig {
  if (["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PL", "SE", "DK"].includes(country)) {
    return REGION_CONFIG.EU;
  }
  if (["US", "CA"].includes(country)) {
    return REGION_CONFIG.US;
  }
  return REGION_CONFIG.GLOBAL;
}

/**
 * Currency conversion with caching
 */
interface ExchangeRates {
  rates: Record<string, number>;
  timestamp: number;
}

let cachedRates: ExchangeRates | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  if (from === to) return amount;

  // Check cache
  if (!cachedRates || Date.now() - cachedRates.timestamp > CACHE_TTL) {
    try {
      const response = await fetch(
        `https://api.exchangerate-api.com/v4/latest/${from}`
      );
      const data = await response.json();
      cachedRates = {
        rates: data.rates,
        timestamp: Date.now(),
      };
    } catch {
      // Fallback rates if API fails
      const fallbackRates: Record<string, number> = {
        USD: 1,
        EUR: 0.85,
        GBP: 0.73,
        TRY: 35,
        JPY: 150,
        CAD: 1.35,
        AUD: 1.52,
      };
      cachedRates = {
        rates: fallbackRates,
        timestamp: Date.now(),
      };
    }
  }

  const rate = cachedRates.rates[to];
  if (!rate) return amount; // Return original if rate not found

  // Round to nearest .99 for psychological pricing
  const converted = amount * rate;
  return Math.floor(converted) + 0.99;
}

/**
 * Detect user location from various signals
 */
export function detectUserLocation(
  ip?: string,
  browserLocale?: string,
  explicitCountry?: string
): UserLocation {
  // Explicit override takes precedence
  if (explicitCountry) {
    return { country: explicitCountry };
  }

  // Try browser locale
  if (browserLocale) {
    const country = browserLocale.split("-")[1];
    if (country) {
      return { country, currency: getCurrencyForCountry(country) };
    }
  }

  // Default to US if nothing else available
  return { country: "US", currency: "USD" };
}

function getCurrencyForCountry(country: string): string {
  const map: Record<string, string> = {
    TR: "TRY",
    US: "USD",
    GB: "GBP",
    DE: "EUR",
    FR: "EUR",
    JP: "JPY",
    CA: "CAD",
    AU: "AUD",
  };
  return map[country] || "USD";
}
