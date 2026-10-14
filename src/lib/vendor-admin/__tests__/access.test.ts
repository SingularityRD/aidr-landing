import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ firebaseAdminEnvError: null, adminDb: {} }));

import { checkVendorAdmin, vendorAdminIds, type AccessDeps } from "../access";

const ADMIN = "user_2abcdefghijklmnop";

function deps(overrides: Partial<AccessDeps> = {}): AccessDeps {
  return {
    env: { AIDR_VENDOR_ADMIN_USER_IDS: `${ADMIN}, user_other0000000` },
    demo: false,
    clerkConfigured: true,
    firestoreError: null,
    session: async () => ({ userId: ADMIN, factorVerificationAge: [3, 3] }),
    user: async () => ({ id: ADMIN, twoFactorEnabled: true, primaryEmailAddress: { emailAddress: "ops@singularityrd.com" } }),
    ...overrides,
  };
}

describe("vendor admin access", () => {
  it("admits an allowlisted user whose session passed two-step verification", async () => {
    expect(await checkVendorAdmin(deps())).toEqual({ ok: true, actor: { userId: ADMIN, email: "ops@singularityrd.com" } });
  });

  it("hides the panel (404) from everyone else", async () => {
    const hidden = [
      deps({ env: {} }),
      deps({ env: { AIDR_VENDOR_ADMIN_USER_IDS: "not-a-user-id" } }),
      deps({ session: async () => ({ userId: null, factorVerificationAge: null }) }),
      deps({ session: async () => ({ userId: "user_someoneelse000", factorVerificationAge: [1, 1] }) }),
      deps({ user: async () => null }),
    ];
    for (const d of hidden) expect(await checkVendorAdmin(d)).toEqual({ ok: false, status: 404, reason: "not_found" });
  });

  it("requires two-step verification in this session, recently", async () => {
    const needs2fa = [
      deps({ user: async () => ({ id: ADMIN, twoFactorEnabled: false }) }),
      deps({ session: async () => ({ userId: ADMIN, factorVerificationAge: [3, -1] }) }),
      deps({ session: async () => ({ userId: ADMIN, factorVerificationAge: null }) }),
      deps({ session: async () => ({ userId: ADMIN, factorVerificationAge: [3, 721] }) }),
    ];
    for (const d of needs2fa) expect(await checkVendorAdmin(d)).toMatchObject({ ok: false, status: 403, reason: "second_factor_required" });
    const shorter = deps({ env: { AIDR_VENDOR_ADMIN_USER_IDS: ADMIN, AIDR_VENDOR_ADMIN_MAX_2FA_AGE_MINUTES: "30" }, session: async () => ({ userId: ADMIN, factorVerificationAge: [40, 40] }) });
    expect(await checkVendorAdmin(shorter)).toMatchObject({ ok: false, status: 403 });
  });

  it("fails closed in demo mode, without Clerk or with the in-memory Firestore fallback", async () => {
    for (const d of [deps({ demo: true }), deps({ clerkConfigured: false }), deps({ firestoreError: "Missing FIREBASE_PROJECT_ID" })]) {
      expect(await checkVendorAdmin(d)).toEqual({ ok: false, status: 503, reason: "unavailable" });
    }
  });

  it("reads the allowlist strictly", () => {
    expect([...vendorAdminIds({ AIDR_VENDOR_ADMIN_USER_IDS: ` ${ADMIN},,bad, user_x ` })]).toEqual([ADMIN]);
  });
});
