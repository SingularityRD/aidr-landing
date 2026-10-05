import { describe, expect, it } from "vitest";
import { clerkServerConfigured } from "../clerk-config";

const live = { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_abc", CLERK_SECRET_KEY: "sk_live_abc" };
const env = (extra: Record<string, string>) => ({ ...extra }) as unknown as NodeJS.ProcessEnv;

describe("clerkServerConfigured", () => {
  it("is false when either key is missing or blank", () => {
    expect(clerkServerConfigured(env({}))).toBe(false);
    expect(clerkServerConfigured(env({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_abc" }))).toBe(false);
    expect(clerkServerConfigured(env({ CLERK_SECRET_KEY: "sk_live_abc" }))).toBe(false);
    expect(clerkServerConfigured(env({ ...live, CLERK_SECRET_KEY: "  " }))).toBe(false);
  });

  it("is true for a complete live key pair", () => {
    expect(clerkServerConfigured(env({ ...live, NODE_ENV: "production", VERCEL_ENV: "production" }))).toBe(true);
  });

  it("rejects test keys only in production", () => {
    const test = { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc", CLERK_SECRET_KEY: "sk_test_abc" };
    expect(clerkServerConfigured(env({ ...test, NODE_ENV: "development" }))).toBe(true);
    expect(clerkServerConfigured(env({ ...test, NODE_ENV: "production", VERCEL_ENV: "production" }))).toBe(false);
    expect(clerkServerConfigured(env({ ...test, NODE_ENV: "production", AIDR_ENFORCE_PROD_KEYS: "1" }))).toBe(false);
  });
});
