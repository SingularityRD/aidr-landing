import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDemoMode } from "../demo";
import { isPublicApiV1Action, PUBLIC_API_V1_ACTIONS } from "../control-plane/api-v1-access";

describe("demo mode", () => {
  const originalDemoMode = process.env.AIDR_DEMO_MODE;
  const originalE2EMode = process.env.NEXT_PUBLIC_AIDR_E2E_MODE;
  const originalClerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  beforeEach(() => {
    process.env.AIDR_DEMO_MODE = originalDemoMode;
    process.env.NEXT_PUBLIC_AIDR_E2E_MODE = originalE2EMode;
    if (originalClerkPublishableKey === undefined) {
      delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = originalClerkPublishableKey;
    }
  });

  afterEach(() => {
    process.env.AIDR_DEMO_MODE = originalDemoMode;
    process.env.NEXT_PUBLIC_AIDR_E2E_MODE = originalE2EMode;
    if (originalClerkPublishableKey === undefined) {
      delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = originalClerkPublishableKey;
    }
  });

  it("returns true only when explicit demo flags are set", () => {
    process.env.AIDR_DEMO_MODE = undefined;
    process.env.NEXT_PUBLIC_AIDR_E2E_MODE = undefined;
    expect(isDemoMode()).toBe(false);

    process.env.AIDR_DEMO_MODE = "1";
    expect(isDemoMode()).toBe(true);

    process.env.NEXT_PUBLIC_AIDR_E2E_MODE = "1";
    process.env.AIDR_DEMO_MODE = undefined;
    expect(isDemoMode()).toBe(true);

    process.env.AIDR_DEMO_MODE = "0";
    process.env.NEXT_PUBLIC_AIDR_E2E_MODE = "0";
    expect(isDemoMode()).toBe(false);
  });

  it("does not infer demo mode from unrelated Clerk env vars", () => {
    process.env.AIDR_DEMO_MODE = undefined;
    process.env.NEXT_PUBLIC_AIDR_E2E_MODE = undefined;
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_123";

    expect(isDemoMode()).toBe(false);
  });
});

describe("public v1 API action allowlist", () => {
  it("keeps the expected public actions and rejects unknown actions", () => {
    expect(PUBLIC_API_V1_ACTIONS).toEqual(
      new Set(["waitlist-signup", "device-start", "device-poll", "enroll", "ingest", "policy"]),
    );
    expect(isPublicApiV1Action("device-start")).toBe(true);
    expect(isPublicApiV1Action("dashboard")).toBe(false);
  });
});
