import { verifyHmacSha256Signature } from "./signature";

// Lemon Squeezy API client
const LEMON_API_KEY = process.env.LEMON_SQUEEZY_API_KEY;
const LEMON_STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID;

// Pre-created Lemon Squeezy products
const PRODUCTS = {
  "agent-seat-monthly": {
    variantId: process.env.LEMON_SQUEEZY_VARIANT_MONTHLY || "123456", // Lemon Squeezy variant ID
    price: 2, // $2/month per agent
    name: "AIDR Agent Seat - Monthly",
  },
  "agent-seat-yearly": {
    variantId: process.env.LEMON_SQUEEZY_VARIANT_YEARLY || "123457",
    price: 20, // $20/year per agent (2 months free)
    name: "AIDR Agent Seat - Yearly",
  },
};

export interface CheckoutResult {
  checkoutUrl: string;
  checkoutId: string;
}

export async function createCheckout(
  userId: string,
  email: string,
  seats: number,
  plan: "monthly" | "yearly",
  referralCode?: string
): Promise<CheckoutResult> {
  if (!LEMON_API_KEY) {
    throw new Error("LEMON_SQUEEZY_API_KEY is not set");
  }
  if (!LEMON_STORE_ID) {
    throw new Error("LEMON_SQUEEZY_STORE_ID is not set");
  }

  const product = PRODUCTS[`agent-seat-${plan}`];

  const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${LEMON_API_KEY}`,
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: email,
            custom: {
              user_id: userId,
              seats: seats.toString(),
              referral_code: referralCode || null,
            },
          },
        },
        relationships: {
          store: {
            data: {
              type: "stores",
              id: LEMON_STORE_ID,
            },
          },
          variant: {
            data: {
              type: "variants",
              id: product.variantId,
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Lemon Squeezy API error: ${response.status} - ${JSON.stringify(errorData)}`
    );
  }

  const data = await response.json();
  return {
    checkoutUrl: data.data.attributes.url,
    checkoutId: data.data.id,
  };
}

// Get user subscriptions
export async function getUserSubscriptions(userEmail: string) {
  if (!LEMON_API_KEY) {
    throw new Error("LEMON_SQUEEZY_API_KEY is not set");
  }
  if (!LEMON_STORE_ID) {
    throw new Error("LEMON_SQUEEZY_STORE_ID is not set");
  }

  const response = await fetch(
    `https://api.lemonsqueezy.com/v1/subscriptions?filter[store_id]=${LEMON_STORE_ID}&filter[user_email]=${encodeURIComponent(
      userEmail
    )}`,
    {
      headers: {
        Accept: "application/vnd.api+json",
        Authorization: `Bearer ${LEMON_API_KEY}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Lemon Squeezy API error: ${response.status} - ${JSON.stringify(errorData)}`
    );
  }

  return await response.json();
}

// Cancel subscription
export async function cancelSubscription(subscriptionId: string) {
  if (!LEMON_API_KEY) {
    throw new Error("LEMON_SQUEEZY_API_KEY is not set");
  }

  const response = await fetch(
    `https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.api+json",
        Authorization: `Bearer ${LEMON_API_KEY}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Lemon Squeezy API error: ${response.status} - ${JSON.stringify(errorData)}`
    );
  }
}

// Create customer portal URL
export async function createCustomerPortal(customerId: string): Promise<string> {
  void customerId;
  // Lemon Squeezy does not have a direct customer portal
  // Customers receive subscription management URLs via email
  return `https://${process.env.LEMON_SQUEEZY_STORE_SLUG || "store"}.lemonsqueezy.com/billing`;
}

// Webhook verification
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  return verifyHmacSha256Signature(payload, signature, secret);
}

// Pricing utilities
export const USD_PER_EXTRA_AGENT_PER_MONTH = 5;
export const USD_PER_EXTRA_AGENT_PER_YEAR = 48; // $4/agent/month billed yearly

export function calculateMonthlyEstimate(agentCount: number): number {
  // Commercial model: first agent is free, each additional is $5/mo
  const billable = Math.max(0, agentCount - 1);
  return billable * USD_PER_EXTRA_AGENT_PER_MONTH;
}

export function calculateYearlyEstimate(agentCount: number): number {
  // Yearly billing: $4/agent/month ($48/agent/year)
  const billable = Math.max(0, agentCount - 1);
  return billable * USD_PER_EXTRA_AGENT_PER_YEAR;
}
