/**
 * Who may use the vendor admin panel (/admin, /api/admin/*): Singularity staff
 * listed by Clerk user id in AIDR_VENDOR_ADMIN_USER_IDS, signed in with
 * two-step verification in this session within the last
 * AIDR_VENDOR_ADMIN_MAX_2FA_AGE_MINUTES (default 720).
 *
 * The panel signs licenses, so it fails closed: no list, demo mode, an
 * unconfigured Clerk or an in-memory Firestore fallback all deny. Anyone else
 * gets a plain 404, so the panel's existence is not advertised.
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { isDemoMode } from "@/lib/demo";
import { clerkServerConfigured } from "@/lib/clerk-config";
import { firebaseAdminEnvError } from "@/lib/firebase/admin";
import type { Actor } from "./customers";

export type AccessResult =
  | { ok: true; actor: Actor }
  | { ok: false; status: 404 | 403 | 503; reason: "not_found" | "second_factor_required" | "unavailable" };

const USER_ID = /^user_[A-Za-z0-9]{10,64}$/;

/** Allowlisted Clerk user ids; malformed entries are ignored. */
export function vendorAdminIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.AIDR_VENDOR_ADMIN_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => USER_ID.test(id)),
  );
}

function maxSecondFactorAge(env: NodeJS.ProcessEnv): number {
  const raw = Number((env.AIDR_VENDOR_ADMIN_MAX_2FA_AGE_MINUTES ?? "720").trim());
  return Number.isInteger(raw) && raw >= 5 && raw <= 1440 ? raw : 720;
}

export interface AccessDeps {
  env: NodeJS.ProcessEnv;
  demo: boolean;
  clerkConfigured: boolean;
  firestoreError: string | null;
  session(): Promise<{ userId: string | null; factorVerificationAge: [number, number] | null }>;
  user(): Promise<{ id: string; twoFactorEnabled: boolean; primaryEmailAddress?: { emailAddress: string } | null } | null>;
}

const defaultDeps = (): AccessDeps => ({
  env: process.env,
  demo: isDemoMode(),
  clerkConfigured: clerkServerConfigured(),
  firestoreError: firebaseAdminEnvError,
  session: async () => {
    const a = await auth();
    return { userId: a.userId, factorVerificationAge: a.factorVerificationAge ?? null };
  },
  user: async () => currentUser(),
});

export async function checkVendorAdmin(deps: AccessDeps = defaultDeps()): Promise<AccessResult> {
  if (deps.demo || !deps.clerkConfigured || deps.firestoreError) return { ok: false, status: 503, reason: "unavailable" };
  const admins = vendorAdminIds(deps.env);
  if (admins.size === 0) return { ok: false, status: 404, reason: "not_found" };
  const session = await deps.session();
  if (!session.userId || !admins.has(session.userId)) return { ok: false, status: 404, reason: "not_found" };
  const user = await deps.user();
  if (!user || user.id !== session.userId) return { ok: false, status: 404, reason: "not_found" };
  const secondFactorAge = session.factorVerificationAge?.[1] ?? -1;
  if (!user.twoFactorEnabled || secondFactorAge < 0 || secondFactorAge > maxSecondFactorAge(deps.env)) {
    return { ok: false, status: 403, reason: "second_factor_required" };
  }
  return { ok: true, actor: { userId: user.id, email: user.primaryEmailAddress?.emailAddress ?? user.id } };
}
