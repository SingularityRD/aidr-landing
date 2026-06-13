import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { hashStable, recordControlPlaneAudit, reserveIdempotencyKey } from "@/lib/control-plane/request-guard";
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

function getNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

function normalizeSeats(payload: LemonWebhookPayload): number {
  const direct = getNumber(payload.meta?.custom_data?.seats, Number.NaN);
  if (Number.isFinite(direct) && direct > 0) return Math.floor(direct);
  const qty = getNumber(payload.data?.attributes?.first_subscription_item?.quantity, Number.NaN);
  if (Number.isFinite(qty) && qty > 0) return Math.floor(qty);
  return 1;
}

function resolveSubscriptionStatus(eventName: string, status?: string, cancelAtPeriodEnd?: boolean) {
  const lower = eventName.toLowerCase();
  if (lower.includes("cancel")) return "canceled";
  if (cancelAtPeriodEnd) return "canceling";
  if (status) return status;
  return "active";
}

export async function applyLemonWebhook(input: {
  payload: LemonWebhookPayload;
  rawBody: string;
  signature: string;
  secret: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<BillingWebhookResult> {
  const eventName = getString(input.payload.meta?.event_name, "unknown");
  const eventId = getString(input.payload.meta?.event_id, getString(input.payload.data?.id, ""));
  const uid = getString(input.payload.meta?.custom_data?.user_id, "").trim();
  if (!uid) throw new Error("missing_user_id");
  if (!eventId) throw new Error("missing_event_id");
  if (!verifyWebhookSignature(input.rawBody, input.signature, input.secret)) {
    throw new Error("invalid_signature");
  }

  const idempotency = await reserveIdempotencyKey({
    namespace: "billing-webhook",
    key: eventId,
    fingerprint: hashStable({ eventName, uid, payload: input.payload }),
    ttlSeconds: 60 * 60 * 24 * 30,
    existingValue: { uid, eventId, eventName },
  });
  if (idempotency.state === "duplicate") {
    return { ok: true, duplicate: true, uid, subscription_id: getString(input.payload.data?.id, "") };
  }
  if (idempotency.state === "conflict") {
    throw new Error("billing_webhook_conflict");
  }

  const seats = normalizeSeats(input.payload);
  const includedAgents = 1;
  const extraAgents = Math.max(0, seats - includedAgents);
  const subscriptionStatus = resolveSubscriptionStatus(
    eventName,
    input.payload.data?.attributes?.status,
    Boolean(input.payload.data?.attributes?.cancel_at_period_end),
  );
  const subscriptionId = getString(input.payload.data?.id, `ls_${hashStable({ eventName, uid }).slice(0, 16)}`);
  const currentPeriodEnd = input.payload.data?.attributes?.renews_at ?? input.payload.data?.attributes?.ends_at ?? null;
  const eventDocId = hashStable({ provider: "lemon_squeezy", eventId }).slice(0, 48);
  const eventRef = adminDb.collection("billing_events").doc(eventDocId);

  await adminDb.runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) {
      throw new Error("billing_webhook_duplicate");
    }

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

    tx.set(
      adminDb.collection(`users/${uid}/entitlements`).doc("current"),
      {
        provider: "lemon_squeezy",
        included_agents: includedAgents,
        extra_agents: subscriptionStatus === "canceled" ? 0 : extraAgents,
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    tx.set(
      adminDb.collection(`users/${uid}/subscriptions`).doc("current"),
      {
        provider: "lemon_squeezy",
        provider_subscription_id: subscriptionId,
        status: subscriptionStatus,
        extra_agents: subscriptionStatus === "canceled" ? 0 : extraAgents,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: Boolean(input.payload.data?.attributes?.cancel_at_period_end),
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    tx.set(
      adminDb.collection(`users/${uid}/seat_usage`).doc("current"),
      {
        included_agents: includedAgents,
        extra_agents: subscriptionStatus === "canceled" ? 0 : extraAgents,
        allowed_agents: includedAgents + (subscriptionStatus === "canceled" ? 0 : extraAgents),
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  await recordControlPlaneAudit({
    action: "billing-webhook",
    outcome: subscriptionStatus,
    uid,
    subject: eventId,
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
    metadata: {
      provider: "lemon_squeezy",
      subscription_id: subscriptionId,
      extra_agents: subscriptionStatus === "canceled" ? 0 : extraAgents,
      event_name: eventName,
    },
  });

  return { ok: true, uid, subscription_id: subscriptionId };
}
