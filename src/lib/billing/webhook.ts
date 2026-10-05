import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { hashStable, recordControlPlaneAudit, releaseIdempotencyKey, reserveIdempotencyKey } from "@/lib/control-plane/request-guard";
import { applyEntitlementChange, parseExtraAgents, parseTenantId } from "./entitlement-write";
import { verifyWebhookSignature } from "./lemon-client";

export type LemonWebhookPayload = {
  meta?: {
    event_name?: string;
    event_id?: string;
    custom_data?: {
      user_id?: string;
      seats?: number | string;
      referral_code?: string | null;
    };
  };
  data?: {
    id?: string;
    attributes?: {
      status?: string;
      cancel_at_period_end?: boolean;
      renews_at?: string | null;
      updated_at?: string | null;
      ends_at?: string | null;
      first_subscription_item?: {
        quantity?: number | string;
      };
      customer_email?: string | null;
    };
  };
};

type BillingWebhookResult = {
  ok: true;
  duplicate?: boolean;
  uid?: string;
  subscription_id?: string;
};

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeSeats(payload: LemonWebhookPayload): number | null {
  const custom = payload.meta?.custom_data?.seats;
  const quantity = payload.data?.attributes?.first_subscription_item?.quantity;
  const parsed = parseExtraAgents(custom !== undefined && custom !== null && custom !== "" ? custom : quantity, 1);
  return parsed === null ? null : Math.max(1, parsed);
}

function resolveSubscriptionStatus(eventName: string, status?: string, cancelAtPeriodEnd?: boolean) {
  const lower = eventName.toLowerCase();
  if (lower.includes("cancel")) return "canceled";
  if (cancelAtPeriodEnd) return "canceling";
  if (status) return status;
  return "active";
}

/** Events older than the replay-protection window can no longer be deduplicated, so they are refused. */
const REPLAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Lemon Squeezy signs only the body (HMAC-SHA256, no timestamp), so replay protection is by delivery
 * identity: `meta.event_id`/`meta.webhook_id`, falling back to the digest of the exact raw body. It is never
 * the subscription id, which every event of a subscription shares.
 */
function deliveryIdentity(payload: LemonWebhookPayload, rawBody: string): string {
  const meta = (payload.meta ?? {}) as Record<string, unknown>;
  const explicit = getString(meta.event_id) || getString(meta.webhook_id);
  return explicit || `body_${createHash("sha256").update(rawBody).digest("hex")}`;
}

export async function applyLemonWebhook(input: {
  payload: LemonWebhookPayload;
  rawBody: string;
  signature: string;
  secret: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<BillingWebhookResult> {
  // Authenticate before looking at anything the sender controls.
  if (!verifyWebhookSignature(input.rawBody, input.signature, input.secret)) {
    throw new Error("invalid_signature");
  }

  const eventName = getString(input.payload.meta?.event_name, "unknown");
  const eventId = deliveryIdentity(input.payload, input.rawBody);
  const uid = parseTenantId(input.payload.meta?.custom_data?.user_id);
  if (!uid) throw new Error("missing_user_id");
  const subscriptionId = getString(input.payload.data?.id).trim();
  if (!subscriptionId) throw new Error("missing_subscription_id");

  const updatedAt = Date.parse(getString(input.payload.data?.attributes?.updated_at));
  if (Number.isFinite(updatedAt) && Date.now() - updatedAt > REPLAY_WINDOW_MS) {
    throw new Error("billing_webhook_stale");
  }

  const seats = normalizeSeats(input.payload);
  if (seats === null) throw new Error("invalid_seats");
  const includedAgents = 1;
  const extraAgents = Math.max(0, seats - includedAgents);
  const subscriptionStatus = resolveSubscriptionStatus(
    eventName,
    input.payload.data?.attributes?.status,
    Boolean(input.payload.data?.attributes?.cancel_at_period_end),
  );
  const ended = ["canceled", "cancelled", "expired", "unpaid", "past_due"].includes(subscriptionStatus);

  const idempotency = await reserveIdempotencyKey({
    namespace: "billing-webhook",
    key: eventId,
    fingerprint: hashStable({ eventName, uid, payload: input.payload }),
    ttlSeconds: REPLAY_WINDOW_MS / 1000,
    existingValue: { uid, eventId, eventName },
  });
  if (idempotency.state === "duplicate") {
    return { ok: true, duplicate: true, uid, subscription_id: subscriptionId };
  }
  if (idempotency.state === "conflict") {
    throw new Error("billing_webhook_conflict");
  }

  const currentPeriodEnd = input.payload.data?.attributes?.renews_at ?? input.payload.data?.attributes?.ends_at ?? null;
  const eventDocId = hashStable({ provider: "lemon_squeezy", eventId }).slice(0, 48);
  const eventRef = adminDb.collection("billing_events").doc(eventDocId);

  try {
    await adminDb.runTransaction(async (tx) => {
      const existing = await tx.get(eventRef);
      if (existing.exists) {
        throw new Error("billing_webhook_duplicate");
      }

      await applyEntitlementChange(tx, {
        provider: "lemon_squeezy",
        uid,
        providerSubscriptionId: subscriptionId,
        subscriptionDocId: "current",
        status: subscriptionStatus,
        extraAgents,
        currentPeriodEnd,
        cancelAtPeriodEnd: Boolean(input.payload.data?.attributes?.cancel_at_period_end),
        ended,
      });

      tx.set(eventRef, {
        provider: "lemon_squeezy",
        event_id: eventId,
        event_name: eventName,
        uid,
        subscription_id: subscriptionId,
        raw: {
          meta: input.payload.meta ?? {},
          data: input.payload.data ?? {},
        },
        created_at: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    // Let the provider's retry process the event instead of acknowledging work that never happened.
    if (!(error instanceof Error && error.message === "billing_webhook_duplicate")) {
      await releaseIdempotencyKey({ namespace: "billing-webhook", key: eventId }).catch(() => {});
    }
    throw error;
  }

  await recordControlPlaneAudit({
    action: "billing-webhook",
    outcome: subscriptionStatus,
    uid,
    subject: eventId.slice(0, 64),
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
    metadata: {
      provider: "lemon_squeezy",
      subscription_id: subscriptionId,
      extra_agents: ended ? 0 : extraAgents,
      event_name: eventName,
    },
  });

  return { ok: true, uid, subscription_id: subscriptionId };
}
