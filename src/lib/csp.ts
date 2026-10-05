/**
 * Content-Security-Policy with a per-request script nonce.
 *
 * Built in `src/proxy.ts` for every request: the nonce is generated there, sent to the app as a request
 * header (Next.js stamps its own inline bootstrap scripts with a nonce found in the request's CSP header, and
 * ClerkProvider does the same for its script tags) and returned in the response header. Scripts therefore run
 * only when they carry this request's nonce (or are loaded by such a script, via 'strict-dynamic'); there is
 * no 'unsafe-inline' in script-src. 'unsafe-eval' is development-only (React refresh).
 *
 * Styles keep 'unsafe-inline': React renders inline `style` attributes, which cannot carry a nonce. Style
 * injection is a much weaker primitive than script injection, and this is the documented residual.
 */

/** Clerk's frontend API host is encoded in the publishable key (base64 of "<host>$"). */
export function clerkFrontendOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  const match = /^pk_(?:test|live)_(.+)$/.exec(key);
  if (!match) return null;
  try {
    const host = atob(match[1]).replace(/\$+$/, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? `https://${host}` : null;
  } catch {
    return null;
  }
}

/** Origin of the configured Sentry DSN, so a custom ingest host is allowed without opening up wildcards. */
export function sentryIngestOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const dsn = env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return null;
  try {
    return new URL(dsn).origin;
  } catch {
    return null;
  }
}

/** 128 bits of randomness, base64 (no characters that need HTML escaping). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildContentSecurityPolicy(input: {
  nonce: string;
  isProduction?: boolean;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = input.env ?? process.env;
  const isProduction = input.isProduction ?? env.NODE_ENV === "production";
  const clerk = clerkFrontendOrigin(env);
  const sentry = sentryIngestOrigin(env);
  const unique = (values: Array<string | null | false>) => Array.from(new Set(values.filter(Boolean) as string[]));

  const scriptSrc = unique([
    `'self'`,
    `'nonce-${input.nonce}'`,
    `'strict-dynamic'`,
    !isProduction && `'unsafe-eval'`,
    // Host sources are ignored by browsers that honour 'strict-dynamic'; they keep older browsers working.
    "https://challenges.cloudflare.com",
    "https://*.clerk.accounts.dev",
    clerk,
  ]);
  const connectSrc = unique([
    `'self'`,
    "https://*.clerk.accounts.dev",
    "https://clerk-telemetry.com",
    clerk,
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
    "https://*.ingest.de.sentry.io",
    sentry,
    "https://firestore.googleapis.com",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    !isProduction && "ws://localhost:*",
    !isProduction && "ws://127.0.0.1:*",
  ]);
  const frameSrc = unique([`'self'`, "https://challenges.cloudflare.com", "https://*.clerk.accounts.dev", clerk]);

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(" ")}`,
    `style-src 'self' 'unsafe-inline'`,
    `frame-src ${frameSrc.join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
    `img-src 'self' data: blob: https://img.clerk.com https://*.clerk.com`,
    `font-src 'self' data:`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
  ];
  if (isProduction) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
