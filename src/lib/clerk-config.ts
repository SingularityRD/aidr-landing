/**
 * Whether Clerk can run on the server. The public site (marketing, legal, status, health) must keep
 * serving when it cannot: a missing or placeholder key disables sign-in and every protected route
 * (fail closed) instead of failing every request, `/api/health` included.
 */
export function clerkServerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const publishable = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  const secret = env.CLERK_SECRET_KEY?.trim() ?? "";
  if (!publishable || !secret) return false;
  const production =
    env.NODE_ENV === "production" && (env.AIDR_ENFORCE_PROD_KEYS === "1" || env.VERCEL_ENV === "production");
  // A test-instance key in production is treated as not configured rather than trusted.
  if (production && (publishable.startsWith("pk_test_") || secret.startsWith("sk_test_"))) return false;
  return true;
}
