import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { isDemoMode } from "@/lib/demo";
import { firebaseAdminEnvError } from "@/lib/firebase/admin";
import { enforceRateLimit } from "@/lib/control-plane/request-guard";
import { getSiteUrl } from "@/lib/site/config";
import {
  CONTACT_LIMITS,
  MIN_FILL_MILLISECONDS,
  SlidingWindowLimiter,
  buildDeliveryPayload,
  getContactDestination,
  isSameOrigin,
  validateContact,
} from "@/lib/site/contact";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

// Per-instance burst control: 3 submissions per minute per client.
const burstLimiter = new SlidingWindowLimiter(3, 60_000);
// Per-instance hourly control: 10 submissions per hour per client.
const hourlyLimiter = new SlidingWindowLimiter(10, 60 * 60_000);

function json(status: number, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

function clientKey(request: Request): string {
  const headers = request.headers;
  return (
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function verifyTurnstile(token: unknown, remoteIp: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true; // Bot challenge is optional until keys are configured.
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (remoteIp !== "unknown") form.set("remoteip", remoteIp);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  // 1. Same-origin only; a cross-site page must not be able to post on a visitor's behalf.
  const host = request.headers.get("host");
  if (!isSameOrigin(request.headers.get("origin"), host, getSiteUrl())) {
    return json(403, { error: "forbidden_origin" });
  }

  // 2. JSON only, bounded size.
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json(415, { error: "unsupported_media_type" });
  }
  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > CONTACT_LIMITS.bodyBytes) {
    return json(413, { error: "payload_too_large" });
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json(400, { error: "invalid_body" });
  }
  if (raw.length > CONTACT_LIMITS.bodyBytes) return json(413, { error: "payload_too_large" });
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not_object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  // 3. Rate limits (before any outbound work).
  const key = clientKey(request);
  const burst = burstLimiter.check(key);
  const hourly = hourlyLimiter.check(key);
  if (!burst.ok || !hourly.ok) {
    const retryAfter = String(!burst.ok ? burst.retryAfterSeconds : (hourly as { retryAfterSeconds: number }).retryAfterSeconds);
    return json(429, { error: "rate_limited" }, { "Retry-After": retryAfter });
  }

  // Shared (cross-instance) limit when the database is configured; falls back to the per-instance limits above.
  if (!isDemoMode() && !firebaseAdminEnvError) {
    try {
      const shared = await enforceRateLimit({ action: "contact-form", subject: key, windowSeconds: 3600, limit: 10 });
      if (!shared.ok) {
        return json(429, { error: "rate_limited" }, { "Retry-After": String(shared.retryAfterSeconds) });
      }
    } catch {
      logger.warn({ route: "contact" }, "shared rate limit unavailable; using per-instance limits");
    }
  }

  // 4. Honeypot and timing trap: pretend success so bots learn nothing, deliver nothing.
  const honeypot = typeof body.website === "string" ? body.website.trim() : "";
  const startedAt = typeof body.startedAt === "number" ? body.startedAt : 0;
  const tooFast = startedAt > 0 && Date.now() - startedAt < MIN_FILL_MILLISECONDS;
  if (honeypot.length > 0 || tooFast) {
    logger.info({ route: "contact", outcome: "discarded_bot" }, "contact submission discarded");
    return json(200, { ok: true });
  }

  // 5. Validation.
  const validated = validateContact(body);
  if (!validated.ok) {
    return json(422, { error: "validation_failed", fields: validated.errors });
  }

  // 6. Optional bot challenge.
  if (!(await verifyTurnstile(body.turnstileToken, key))) {
    return json(400, { error: "challenge_failed" });
  }

  // 7. Delivery. Fail closed and say so: never report success for a message nobody receives.
  const destination = getContactDestination();
  if (!destination) {
    logger.warn({ route: "contact", outcome: "destination_not_configured" }, "contact destination not configured");
    return json(503, { error: "contact_unavailable" });
  }
  try {
    const response = await fetch(destination, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildDeliveryPayload(validated.value)),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      logger.error({ route: "contact", outcome: "destination_rejected", status: response.status }, "contact delivery failed");
      return json(502, { error: "delivery_failed" });
    }
  } catch {
    logger.error({ route: "contact", outcome: "destination_unreachable" }, "contact delivery failed");
    return json(502, { error: "delivery_failed" });
  }

  // Log the outcome only; submitted personal data is never written to application logs.
  logger.info({ route: "contact", outcome: "delivered", topic: validated.value.topic }, "contact submission delivered");
  return json(200, { ok: true });
}

export function GET() {
  return json(405, { error: "method_not_allowed" }, { Allow: "POST" });
}
