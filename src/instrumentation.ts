/**
 * Server-side error reporting. Next.js only loads sentry.server.config.ts / sentry.edge.config.ts through
 * this hook; without it server errors (including the route-handler 500s in SR-01) were never reported.
 *
 * Nothing is loaded unless a DSN is configured, and a failure to initialise diagnostics must never stop
 * the server from serving.
 */
import type { Instrumentation } from "next";

export function sentryServerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_SENTRY_DSN?.trim() || env.SENTRY_DSN?.trim());
}

export async function register(): Promise<void> {
  if (!sentryServerEnabled()) return;
  try {
    if (process.env.NEXT_RUNTIME === "nodejs") await import("../sentry.server.config");
    if (process.env.NEXT_RUNTIME === "edge") await import("../sentry.edge.config");
  } catch (error) {
    console.error("[instrumentation] diagnostics disabled: initialisation failed", error instanceof Error ? error.name : "error");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!sentryServerEnabled()) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(...args);
  } catch {
    // Reporting is best effort.
  }
};
