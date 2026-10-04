import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDoc = vi.fn();
const state = { error: null as string | null };

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: getDoc }) }) },
  get firebaseAdminEnvError() {
    return state.error;
  },
}));

const ENV_KEYS = [
  "AIDR_DEMO_MODE",
  "NEXT_PUBLIC_AIDR_E2E_MODE",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "AIDR_AGENT_TOKEN_SECRET",
  "POLAR_ACCESS_TOKEN",
  "POLAR_WEBHOOK_SECRET",
  "CONTACT_WEBHOOK_URL",
] as const;

// base64("clerk.example.com$")
const PUBLISHABLE = "pk_live_Y2xlcmsuZXhhbXBsZS5jb20k";

describe("health endpoints", () => {
  const saved: Record<string, string | undefined> = {};
  const fetchMock = vi.fn();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    state.error = null;
    getDoc.mockReset();
    getDoc.mockResolvedValue({ exists: false });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = PUBLISHABLE;
    process.env.CLERK_SECRET_KEY = "sk_live_not_a_real_key_for_tests_only";
    process.env.AIDR_AGENT_TOKEN_SECRET = "x".repeat(40);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("GET /api/health is a cheap no-store liveness response", async () => {
    const { GET } = await import("../route");
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const json = await response.json();
    expect(json.status).toBe("ok");
    expect(json.service).toBe("aidr-landing");
    expect(typeof json.uptimeSeconds).toBe("number");
    expect(getDoc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("GET /api/ready reports ready after real dependency round trips", async () => {
    const { GET } = await import("../../ready/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const json = await response.json();
    expect(json.status).toBe("ready");
    expect(getDoc).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://clerk.example.com/.well-known/jwks.json");
    expect(json.checks.database.status).toBe("ok");
    expect(json.checks.auth_provider.status).toBe("ok");
    // Optional integrations that are not configured are reported, not hidden, and do not fail readiness.
    expect(json.checks.billing_config.status).toBe("not_configured");
    expect(json.checks.contact_destination.status).toBe("not_configured");
    expect(json.checks.billing_config.required).toBe(false);
  });

  it("returns 503 when the database round trip fails, without leaking the error", async () => {
    getDoc.mockRejectedValue(new Error("secret-internal-hostname:5432 refused"));
    const { GET } = await import("../../ready/route");
    const response = await GET();
    expect(response.status).toBe(503);
    const text = JSON.stringify(await response.json());
    expect(text).toContain('"status":"not_ready"');
    expect(text).toContain('"reason":"error"');
    expect(text).not.toContain("secret-internal-hostname");
  });

  it("returns 503 when database credentials are missing", async () => {
    state.error = "Missing FIREBASE_PRIVATE_KEY";
    const { GET } = await import("../../ready/route");
    const response = await GET();
    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.checks.database).toMatchObject({ status: "not_configured", required: true, reason: "credentials_missing" });
    expect(JSON.stringify(json)).not.toContain("FIREBASE_PRIVATE_KEY");
  });

  it("returns 503 when the identity provider is unreachable or erroring", async () => {
    fetchMock.mockResolvedValue(new Response("down", { status: 503 }));
    const { GET } = await import("../../ready/route");
    expect((await GET()).status).toBe(503);
    fetchMock.mockRejectedValue(new Error("network"));
    expect((await GET()).status).toBe(503);
  });

  it("returns 503 when the agent token secret is missing or too short", async () => {
    process.env.AIDR_AGENT_TOKEN_SECRET = "short";
    const { GET } = await import("../../ready/route");
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).checks.agent_token_secret.reason).toBe("agent_token_secret_too_short");
  });

  it("times out a hung dependency instead of hanging the endpoint", async () => {
    vi.useFakeTimers();
    try {
      getDoc.mockReturnValue(new Promise(() => undefined));
      const { getReadiness } = await import("@/lib/site/health");
      const pending = getReadiness();
      await vi.advanceTimersByTimeAsync(3000);
      const readiness = await pending;
      expect(readiness.status).toBe("not_ready");
      expect(readiness.checks.database).toMatchObject({ status: "fail", reason: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports optional contact and billing configuration as ok when present", async () => {
    process.env.POLAR_ACCESS_TOKEN = "polar-test-token";
    process.env.POLAR_WEBHOOK_SECRET = "polar-test-webhook-secret";
    process.env.CONTACT_WEBHOOK_URL = "https://hooks.example/intake";
    const { getReadiness } = await import("@/lib/site/health");
    const readiness = await getReadiness();
    expect(readiness.checks.billing_config.status).toBe("ok");
    expect(readiness.checks.contact_destination.status).toBe("ok");
  });
});

describe("clerkFrontendHost", () => {
  it("decodes the frontend API host from a publishable key", async () => {
    const { clerkFrontendHost } = await import("@/lib/site/health");
    expect(clerkFrontendHost(PUBLISHABLE)).toBe("clerk.example.com");
    expect(clerkFrontendHost("pk_test_Y2xlcmsubG9jYWw")).toBe("clerk.local");
    expect(clerkFrontendHost("garbage")).toBeNull();
    expect(clerkFrontendHost(undefined)).toBeNull();
  });
});
