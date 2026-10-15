import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = [
  "AIDR_DEMO_MODE",
  "NEXT_PUBLIC_AIDR_E2E_MODE",
  "FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
] as const;

describe("Firebase Admin without credentials", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    vi.resetModules();
  });
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    vi.resetModules();
  });

  it("fails closed outside demo mode: no in-memory database, no token that verifies as a demo user", async () => {
    const admin = await import("@/lib/firebase/admin");
    expect(admin.firebaseAdminEnvError).toMatch(/Missing FIREBASE_/);
    expect(() => admin.adminDb.collection("billing_events")).toThrow(admin.FirebaseAdminUnavailableError);
    expect(() => admin.adminAuth.verifyIdToken("any-token")).toThrow(admin.FirebaseAdminUnavailableError);
    // Not mistaken for a promise and safe to log.
    expect((admin.adminDb as unknown as { then?: unknown }).then).toBeUndefined();
  });

  it("fails closed when the service account cannot be parsed", async () => {
    process.env.FIREBASE_PROJECT_ID = "project";
    process.env.FIREBASE_CLIENT_EMAIL = "svc@project.iam.gserviceaccount.com";
    process.env.FIREBASE_PRIVATE_KEY = "not a key";
    const admin = await import("@/lib/firebase/admin");
    expect(admin.firebaseAdminEnvError).toMatch(/initialization failed/);
    expect(() => admin.adminDb.collection("x")).toThrow(/not available/);
  });

  it("keeps the in-memory services for demo mode only", async () => {
    process.env.AIDR_DEMO_MODE = "1";
    const admin = await import("@/lib/firebase/admin");
    expect(admin.firebaseAdminEnvError).toBeNull();
    const snap = await admin.adminDb.collection("x").doc("y").get();
    expect(snap.exists).toBe(false);
  });
});

describe("Polar webhook without a database", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/firebase/admin");
    vi.resetModules();
  });

  it("answers 503 so the provider retries instead of acknowledging an event it cannot store", async () => {
    vi.resetModules();
    vi.doMock("@/lib/firebase/admin", () => ({ adminDb: {}, adminAuth: {}, firebaseAdminEnvError: "Missing FIREBASE_PRIVATE_KEY" }));
    const { POST } = await import("@/app/api/webhooks/polar/route");
    const { NextRequest } = await import("next/server");
    const response = await POST(new NextRequest("https://example.test/api/webhooks/polar", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("300");
  });
});
