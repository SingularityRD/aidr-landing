import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";
import { hashStable, releaseIdempotencyKey, reserveIdempotencyKey } from "@/lib/control-plane/request-guard";
import { verifyPolarWebhookSignature } from "@/lib/billing/signature";
import { applyEntitlementChange, parseExtraAgents, parseTenantId } from "@/lib/billing/entitlement-write";

export const runtime = "nodejs";

type PolarWebhookPayload = {
  type?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

const MAX_BODY_BYTES = 512 * 1024;
const HANDLED_EVENTS = new Set([
  "subscription.created",
  "subscription.active",
  "subscription.updated",
  "subscription.canceled",
  "subscription.revoked",
]);
const ENDED_EVENTS = new Set(["subscription.canceled", "subscription.revoked"]);
const ENTITLED_STATUSES = new Set(["active", "trialing"]);

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/**
 * Polar webhook (Standard Webhooks). Strict by construction:
 *  - the signature (HMAC over id.timestamp.body, 5 minute timestamp tolerance) is checked first, with no
 *    unsigned or legacy fallback;
 *  - replay protection keys on the unique `webhook-id` delivery id (NOT the subscription id, which is shared
 *    by every event of a subscription), so a retried delivery is acknowledged once and a re-sent body that
 *    differs is a conflict;
 *  - the tenant comes only from signed metadata, must be a safe path segment, and a subscription id is bound to
 *    the first tenant that claimed it.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.POLAR_WEBHOOK_SECRET?.trim() || "";
  if (!secret) return json(500, { error: "Missing Polar webhook secret" });

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return json(413, { error: "payload_too_large" });
  }

  const deliveryId = request.headers.get("webhook-id")?.trim() ?? "";
  const signatureOk = verifyPolarWebhookSignature({
    rawBody,
    secret,
    headers: {
      "webhook-id": deliveryId,
      "webhook-timestamp": request.headers.get("webhook-timestamp"),
      "webhook-signature": request.headers.get("webhook-signature"),
    },
  });
  if (!signatureOk) {
    return json(401, { error: "invalid_signature" });
  }

  let payload: PolarWebhookPayload;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json(400, { error: "invalid_json_shape" });
    }
    payload = parsed as PolarWebhookPayload;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const eventType = typeof payload.type === "string" ? payload.type : "";
  if (!eventType) return json(400, { error: "missing_event_type" });
  // Acknowledge (do not retry) events this integration does not act on.
  if (!HANDLED_EVENTS.has(eventType)) {
    logger.info({ eventType }, "Polar webhook event ignored");
    return json(200, { ok: true, ignored: true });
  }

  const data = (payload.data && typeof payload.data === "object" ? payload.data : {}) as Record<string, unknown>;
  const metadata = (data.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown>;
  const uid = parseTenantId(metadata.user_id);
  const subscriptionId = typeof data.id === "string" ? data.id.trim() : "";
  if (!uid) return json(400, { error: "missing_user_id" });
  if (!subscriptionId) return json(400, { error: "missing_subscription_id" });
  const extraAgents = parseExtraAgents(metadata.seats, 1);
  if (extraAgents === null) return json(400, { error: "invalid_seats" });

  try {
    const idempotency = await reserveIdempotencyKey({
      namespace: "polar-webhook",
      key: deliveryId,
      fingerprint: hashStable({ eventType, uid, payload: data }),
      ttlSeconds: 60 * 60 * 24 * 30,
      existingValue: { uid, deliveryId, eventType },
    });
    if (idempotency.state === "duplicate") return json(200, { ok: true, duplicate: true });
    if (idempotency.state === "conflict") return json(409, { error: "webhook_conflict" });
  } catch (err) {
    logger.error({ err, deliveryId }, "Polar webhook idempotency check failed");
    return json(500, { error: "idempotency_check_failed" });
  }

  const status = typeof data.status === "string" ? data.status : "active";
  const ended = ENDED_EVENTS.has(eventType) || !ENTITLED_STATUSES.has(status);
  try {
    await adminDb.runTransaction((tx) =>
      applyEntitlementChange(tx, {
        provider: "polar",
        uid,
        providerSubscriptionId: subscriptionId,
        subscriptionDocId: subscriptionId,
        status: ENDED_EVENTS.has(eventType) ? "cancelled" : status,
        extraAgents,
        currentPeriodEnd: data.current_period_end ?? null,
        cancelAtPeriodEnd: ENDED_EVENTS.has(eventType) || data.cancel_at_period_end === true,
        ended,
      }),
    );
    return json(200, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err: message, eventType, deliveryId }, "Polar webhook handler failed");
    // Let the provider's retry run again instead of being acknowledged as a duplicate.
    await releaseIdempotencyKey({ namespace: "polar-webhook", key: deliveryId }).catch(() => {});
    return json(message === "billing_tenant_mismatch" ? 409 : 400, {
      error: message === "billing_tenant_mismatch" ? message : "webhook_processing_failed",
    });
  }
}
