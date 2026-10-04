/**
 * Optional browser diagnostics (Sentry), OFF by default.
 *
 * Nothing is sent from the browser unless a visitor explicitly opts in. The
 * choice is stored only in this browser's localStorage under CONSENT_KEY and
 * can be changed at any time from the footer ("Privacy settings").
 */

export const CONSENT_KEY = "aidr_diagnostics_consent";
export type DiagnosticsConsent = "granted" | "denied";

export function readConsent(): DiagnosticsConsent | null {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function writeConsent(value: DiagnosticsConsent): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // Storage unavailable: the choice applies to this page view only.
  }
}

let initialised = false;

/** Initialise browser diagnostics. Safe to call repeatedly; no-op without consent or a DSN. */
export async function initClientDiagnosticsIfConsented(): Promise<void> {
  if (initialised || typeof window === "undefined") return;
  if (readConsent() !== "granted") return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return;
  initialised = true;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn,
    // No session replay, no default PII, low trace sampling.
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

/** Stop sending and close the client when a visitor withdraws consent. */
export async function disableClientDiagnostics(): Promise<void> {
  if (!initialised) return;
  initialised = false;
  const Sentry = await import("@sentry/nextjs");
  await Sentry.close();
}
