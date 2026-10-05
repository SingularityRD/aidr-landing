import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

export type BillingProvider = "polar" | "lemon_squeezy";

/** Tenant ids become Firestore path segments; anything else could address another collection. */
const TENANT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_EXTRA_AGENTS = 1000;

export function parseTenantId(value: unknown): string | null {
  return typeof value === "string" && TENANT_ID.test(value.trim()) ? value.trim() : null;
}

/** A purchased agent count must be a plain non-negative integer within a sane bound. */
export function parseExtraAgents(value: unknown, fallback: number): number | null {
  if (value === undefined || value === null || value === "") return fallback;
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_EXTRA_AGENTS ? n : null;
}

type Tx = Parameters<Parameters<typeof adminDb.runTransaction>[0]>[0];

export type EntitlementChange = {
  provider: BillingProvider;
  uid: string;
  providerSubscriptionId: string;
  /** Document id under users/{uid}/subscriptions. */
  subscriptionDocId: string;
  status: string;
  extraAgents: number;
  currentPeriodEnd: unknown;
  cancelAtPeriodEnd: boolean;
  /** True when the paid entitlement ends: extra agents drop to 0 and the revocation epoch advances. */
  ended: boolean;
};

/**
 * Apply a verified provider event to a single tenant inside the caller's
 * transaction. Does all reads before any write (Firestore requirement) and
 * binds the provider subscription id to the first tenant that claimed it, so a
 * later event cannot steer an existing subscription's entitlement to another
 * tenant. Writes exactly the fields the entitlement code reads
 * (`included_agents`, `extra_agents`, `revoked_serials`, `revocation_epoch`).
 */
export async function applyEntitlementChange(tx: Tx, change: EntitlementChange): Promise<void> {
  const bindingRef = adminDb
    .collection("billing_subscriptions")
    .doc(`${change.provider}_${change.providerSubscriptionId}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 200));
  const entitlementRef = adminDb.collection(`users/${change.uid}/entitlements`).doc("current");
  const usageRef = adminDb.collection(`users/${change.uid}/seat_usage`).doc("current");

  const [binding, entitlement, usage] = await Promise.all([tx.get(bindingRef), tx.get(entitlementRef), tx.get(usageRef)]);
  if (binding.exists && (binding.data() as Record<string, unknown>).uid !== change.uid) {
    throw new Error("billing_tenant_mismatch");
  }

  const entData = entitlement.exists ? (entitlement.data() as Record<string, unknown>) : {};
  const usageData = usage.exists ? (usage.data() as Record<string, unknown>) : {};
  const includedRaw = Number(usageData.included_agents ?? entData.included_agents ?? 1);
  const included = Number.isSafeInteger(includedRaw) && includedRaw >= 1 ? includedRaw : 1;
  const extra = change.ended ? 0 : change.extraAgents;
  const revokedSerials = Array.isArray(entData.revoked_serials)
    ? entData.revoked_serials.filter((s): s is string => typeof s === "string")
    : [];
  const epochRaw = Number(entData.revocation_epoch ?? 1);
  const epoch = Number.isSafeInteger(epochRaw) && epochRaw >= 1 ? epochRaw : 1;

  if (!binding.exists) {
    tx.set(bindingRef, {
      uid: change.uid,
      provider: change.provider,
      provider_subscription_id: change.providerSubscriptionId,
      created_at: FieldValue.serverTimestamp(),
    });
  }
  tx.set(
    entitlementRef,
    {
      provider: change.provider,
      included_agents: included,
      extra_agents: extra,
      revoked_serials: revokedSerials,
      revocation_epoch: change.ended ? epoch + 1 : epoch,
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  tx.set(
    adminDb.collection(`users/${change.uid}/subscriptions`).doc(change.subscriptionDocId),
    {
      provider: change.provider,
      provider_subscription_id: change.providerSubscriptionId,
      status: change.status,
      extra_agents: extra,
      current_period_end: change.currentPeriodEnd ?? null,
      cancel_at_period_end: change.cancelAtPeriodEnd,
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  tx.set(
    usageRef,
    {
      included_agents: included,
      extra_agents: extra,
      allowed_agents: included + extra,
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
