import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";
import { hashStable, reserveIdempotencyKey } from "@/lib/control-plane/request-guard";
import { verifyPolarWebhookSignature } from "@/lib/billing/signature";

export const runtime = "nodejs";

type PolarWebhookPayload = {
  type?: string;
  event?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  const secret = process.env.POLAR_WEBHOOK_SECRET?.trim() || "";
  if (!secret) return json(500, { error: "Missing Polar webhook secret" });

  const rawBody = await request.text();

  // Reject oversized payloads before parsing (max 512KB)
  if (rawBody.length > 512 * 1024) {
    return json(413, { error: "payload_too_large" });
  }

  const signatureOk = verifyPolarWebhookSignature({
    rawBody,
    secret,
    headers: {
      "webhook-id": request.headers.get("webhook-id"),
      "webhook-timestamp": request.headers.get("webhook-timestamp"),
      "webhook-signature": request.headers.get("webhook-signature"),
      "x-polar-webhook-signature": request.headers.get("x-polar-webhook-signature"),
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

  const eventType = payload.type || payload.event;
  if (!eventType) return json(400, { error: "missing_event_type" });

  const data = (payload.data || payload) as Record<string, unknown>;
  const metadata = (data.metadata || {}) as Record<string, unknown>;
  const userId = metadata.user_id;
  const eventId = typeof data.id === "string" ? data.id : typeof data.event_id === "string" ? data.event_id : "";

  if (!userId || typeof userId !== "string") {
    return json(400, { error: "missing_user_id" });
  }
  if (!eventId) {
    return json(400, { error: "missing_event_id" });
  }

  // Idempotency: prevent replay attacks and duplicate processing
  try {
    const idempotency = await reserveIdempotencyKey({
      namespace: "polar-webhook",
      key: eventId,
      fingerprint: hashStable({ eventType, userId, payload: data }),
      ttlSeconds: 60 * 60 * 24 * 30,
      existingValue: { userId, eventId, eventType },
    });
    if (idempotency.state === "duplicate") {
      return json(200, { ok: true, duplicate: true });
    }
    if (idempotency.state === "conflict") {
      return json(409, { error: "webhook_conflict" });
    }
  } catch (err) {
    logger.error({ err, eventId }, "Polar webhook idempotency check failed");
    return json(500, { error: "idempotency_check_failed" });
  }

  try {
    await handlePolarWebhook(eventType, payload);
    return json(200, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err: message, eventType, eventId }, "Polar webhook handler failed");
    return json(400, { error: "webhook_processing_failed" });
  }
}

async function handlePolarWebhook(eventType: string, payload: Record<string, unknown>) {
  const data = (payload.data || payload) as Record<string, unknown>;
  const metadata = (data.metadata || {}) as Record<string, unknown>;
  const userId = metadata.user_id;
  const seats = Number(metadata.seats || 1);

  if (!userId || typeof userId !== "string") throw new Error("missing_user_id");

  const subscriptionId = typeof data.id === "string" ? data.id : typeof data.subscription_id === "string" ? data.subscription_id : "";
  const status = data.status;
  const currentPeriodEnd = data.current_period_end;

  if (!subscriptionId) throw new Error("missing_subscription_id");

  // Upsert subscription doc
  const subRef = adminDb.collection(`users/${userId}/subscriptions`).doc(subscriptionId);

  switch (eventType) {
    case "subscription.created":
    case "subscription.active": {
      await subRef.set(
        {
          provider: "polar",
          status: "active",
          extra_agents: seats,
          current_period_end: currentPeriodEnd || null,
          cancel_at_period_end: false,
          updated_at: FieldValue.serverTimestamp(),
          created_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await updateSeatUsage(userId, seats);
      break;
    }
    case "subscription.updated": {
      await subRef.set(
        {
          provider: "polar",
          status: status || "active",
          extra_agents: seats,
          current_period_end: currentPeriodEnd || null,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await updateSeatUsage(userId, seats);
      break;
    }
    case "subscription.canceled":
    case "subscription.revoked": {
      await subRef.set(
        {
          provider: "polar",
          status: "cancelled",
          cancel_at_period_end: true,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await updateSeatUsage(userId, 0);
      break;
    }
    default:
      // Unknown event — log and ignore
      logger.info(`[polar-webhook] Unhandled event type: ${eventType}`);
  }
}

async function updateSeatUsage(userId: string, extraAgents: number) {
  const usageRef = adminDb.collection(`users/${userId}/seat_usage`).doc("current");
  const snap = await usageRef.get();
  const existing = snap.exists ? (snap.data() as Record<string, unknown>) : {};
  const included = Number(existing.included_agents ?? 1);

  await usageRef.set(
    {
      included_agents: included,
      extra_agents: extraAgents,
      allowed_agents: included + extraAgents,
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
