import { adminDb, firebaseAdminEnvError } from "@/lib/firebase/admin";
import { isDemoMode } from "@/lib/demo";
import { getContactDestination } from "./contact";

export type CheckStatus = "ok" | "fail" | "not_configured" | "skipped";

export type CheckResult = {
  status: CheckStatus;
  /** Whether a failure of this check makes the service not ready. */
  required: boolean;
  latencyMs?: number;
  /** Short machine-readable reason. Never contains secrets, hostnames or raw error text. */
  reason?: string;
};

export type Liveness = {
  status: "ok";
  service: string;
  release: string;
  time: string;
  uptimeSeconds: number;
};

export type Readiness = {
  status: "ready" | "not_ready";
  service: string;
  release: string;
  time: string;
  checks: Record<string, CheckResult>;
};

const SERVICE = "aidr-landing";
const PROBE_TIMEOUT_MS = 2500;

function release(): string {
  return (
    process.env.NEXT_PUBLIC_APP_VERSION?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GIT_COMMIT_SHA?.trim() ||
    "unknown"
  );
}

export function getLiveness(): Liveness {
  return {
    status: "ok",
    service: SERVICE,
    release: release(),
    time: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  };
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function timed(required: boolean, run: () => Promise<void>): Promise<CheckResult> {
  const started = Date.now();
  try {
    await withTimeout(run(), PROBE_TIMEOUT_MS);
    return { status: "ok", required, latencyMs: Date.now() - started };
  } catch (error) {
    const reason = error instanceof Error && error.message === "timeout" ? "timeout" : "error";
    return { status: "fail", required, latencyMs: Date.now() - started, reason };
  }
}

/** Decode the Clerk frontend API host from a publishable key (pk_test_/pk_live_ + base64 + "$"). */
export function clerkFrontendHost(publishableKey: string | undefined): string | null {
  if (!publishableKey) return null;
  const match = /^pk_(?:test|live)_(.+)$/.exec(publishableKey.trim());
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8").replace(/\$+$/, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

async function checkDatabase(): Promise<CheckResult> {
  if (isDemoMode()) return { status: "skipped", required: false, reason: "demo_mode" };
  if (firebaseAdminEnvError) return { status: "not_configured", required: true, reason: "credentials_missing" };
  return timed(true, async () => {
    // A real round trip to Firestore; the document does not need to exist.
    await adminDb.collection("_health").doc("readiness").get();
  });
}

function checkAuthConfig(): CheckResult {
  if (isDemoMode()) return { status: "skipped", required: false, reason: "demo_mode" };
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  const secret = process.env.CLERK_SECRET_KEY?.trim() ?? "";
  if (!publishable || !secret) return { status: "not_configured", required: true, reason: "keys_missing" };
  if (process.env.NODE_ENV === "production" && (publishable.startsWith("pk_test_") || secret.startsWith("sk_test_"))) {
    return { status: "fail", required: true, reason: "test_keys_in_production" };
  }
  return { status: "ok", required: true };
}

async function checkAuthProvider(): Promise<CheckResult> {
  if (isDemoMode()) return { status: "skipped", required: false, reason: "demo_mode" };
  const host = clerkFrontendHost(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (!host) return { status: "not_configured", required: true, reason: "frontend_api_unknown" };
  return timed(true, async () => {
    const response = await fetch(`https://${host}/.well-known/jwks.json`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    // Any response below 500 proves the identity provider is reachable.
    if (response.status >= 500) throw new Error("upstream_error");
  });
}

function checkSecrets(): CheckResult {
  const tokenSecret = process.env.AIDR_AGENT_TOKEN_SECRET?.trim() ?? "";
  if (!tokenSecret) return { status: "not_configured", required: true, reason: "agent_token_secret_missing" };
  if (tokenSecret.length < 32) return { status: "fail", required: true, reason: "agent_token_secret_too_short" };
  return { status: "ok", required: true };
}

function checkBilling(): CheckResult {
  const configured = Boolean(process.env.POLAR_ACCESS_TOKEN?.trim() && process.env.POLAR_WEBHOOK_SECRET?.trim());
  return configured ? { status: "ok", required: false } : { status: "not_configured", required: false, reason: "polar_not_configured" };
}

function checkContactRoute(): CheckResult {
  return getContactDestination()
    ? { status: "ok", required: false }
    : { status: "not_configured", required: false, reason: "contact_destination_missing" };
}

export async function getReadiness(): Promise<Readiness> {
  const [database, authProvider] = await Promise.all([checkDatabase(), checkAuthProvider()]);
  const checks: Record<string, CheckResult> = {
    database,
    auth_config: checkAuthConfig(),
    auth_provider: authProvider,
    agent_token_secret: checkSecrets(),
    billing_config: checkBilling(),
    contact_destination: checkContactRoute(),
  };
  const ready = Object.values(checks).every((check) => !check.required || check.status === "ok" || check.status === "skipped");
  return {
    status: ready ? "ready" : "not_ready",
    service: SERVICE,
    release: release(),
    time: new Date().toISOString(),
    checks,
  };
}
