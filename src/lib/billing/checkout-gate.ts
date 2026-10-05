/**
 * Checkout is not a self-serve flow. It is enabled per deployment only after an
 * order has been approved: the owner creates the Polar product for that order,
 * sets POLAR_PRICE_MONTHLY_ID to it, and flips AIDR_BILLING_CHECKOUT_ENABLED=1.
 * No price is hard-coded anywhere in this codebase; the amount is whatever the
 * approved Polar product says, and the app never displays one.
 */
export const CHECKOUT_DISABLED_ERROR = "billing_checkout_disabled";

export function isCheckoutEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.AIDR_BILLING_CHECKOUT_ENABLED?.trim() === "1" &&
    Boolean(env.POLAR_ACCESS_TOKEN?.trim()) &&
    Boolean(env.POLAR_PRICE_MONTHLY_ID?.trim())
  );
}

/** The approval flag alone, for providers that bring their own configuration (legacy Lemon Squeezy). */
export function isCheckoutApproved(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AIDR_BILLING_CHECKOUT_ENABLED?.trim() === "1";
}
