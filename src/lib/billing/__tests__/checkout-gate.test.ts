import { describe, expect, it } from "vitest";
import { isCheckoutApproved, isCheckoutEnabled } from "../checkout-gate";

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe("checkout gate", () => {
  it("is disabled by default", () => {
    expect(isCheckoutEnabled(env({}))).toBe(false);
    expect(isCheckoutApproved(env({}))).toBe(false);
  });

  it("needs the explicit flag AND the approved order's provider configuration", () => {
    const base = { POLAR_ACCESS_TOKEN: "t", POLAR_PRICE_MONTHLY_ID: "p" };
    expect(isCheckoutEnabled(env(base))).toBe(false);
    expect(isCheckoutEnabled(env({ ...base, AIDR_BILLING_CHECKOUT_ENABLED: "true" }))).toBe(false);
    expect(isCheckoutEnabled(env({ ...base, AIDR_BILLING_CHECKOUT_ENABLED: "1" }))).toBe(true);
    expect(isCheckoutEnabled(env({ AIDR_BILLING_CHECKOUT_ENABLED: "1", POLAR_ACCESS_TOKEN: "t" }))).toBe(false);
    expect(isCheckoutEnabled(env({ AIDR_BILLING_CHECKOUT_ENABLED: "1", POLAR_PRICE_MONTHLY_ID: "p" }))).toBe(false);
  });
});
