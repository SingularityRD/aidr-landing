import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

export type InstallCodeValidationReason = "not_found" | "used" | "expired" | "wrong_user";
export type InstallCodeValidation =
  | { valid: true }
  | { valid: false; reason: InstallCodeValidationReason };

type FirestoreSnapshot = {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
};

type FirestoreDocRef = {
  get(): Promise<FirestoreSnapshot>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
};

type FirestoreTransaction = {
  get(ref: FirestoreDocRef): Promise<FirestoreSnapshot>;
  set(ref: FirestoreDocRef, data: Record<string, unknown>, options?: { merge?: boolean }): unknown;
};

export type InstallCodeDb = {
  collection(name: "install_codes"): {
    doc(id: string): FirestoreDocRef;
  };
  runTransaction<T>(updateFunction: (transaction: FirestoreTransaction) => Promise<T>): Promise<T>;
};

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function serverTimestamp() {
  return FieldValue.serverTimestamp();
}

export function generateInstallCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export function normalizeInstallCode(code: string): string {
  return code.trim().toUpperCase();
}

export function validateInstallCodeRecord(
  data: Record<string, unknown> | null | undefined,
  uid: string,
  now = new Date(),
): InstallCodeValidation {
  if (!data) return { valid: false, reason: "not_found" };
  if (data.used === true) return { valid: false, reason: "used" };

  const expiresAt = new Date(getString(data.expires_at));
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    return { valid: false, reason: "expired" };
  }

  if (getString(data.user_id) !== uid) return { valid: false, reason: "wrong_user" };
  return { valid: true };
}

export async function createInstallCode(
  db: InstallCodeDb,
  input: { code: string; uid: string; email?: string; expiresAt: Date },
): Promise<void> {
  const code = normalizeInstallCode(input.code);
  if (!code) throw new Error("missing_code");

  await db.collection("install_codes").doc(code).set({
    user_id: input.uid,
    email: input.email ?? null,
    created_at: serverTimestamp(),
    expires_at: input.expiresAt.toISOString(),
    used: false,
  });
}

export async function isInstallCodeValid(
  db: InstallCodeDb,
  code: string,
  uid: string,
  now = new Date(),
): Promise<boolean> {
  const normalized = normalizeInstallCode(code);
  if (!normalized) return false;

  const doc = await db.collection("install_codes").doc(normalized).get();
  const result = validateInstallCodeRecord(doc.exists ? doc.data() : null, uid, now);
  return result.valid;
}

export async function consumeInstallCode(
  db: InstallCodeDb,
  code: string,
  uid: string,
  now = new Date(),
): Promise<{ ok: true }> {
  const normalized = normalizeInstallCode(code);
  if (!normalized) throw new Error("missing_code");

  const ref = db.collection("install_codes").doc(normalized);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const result = validateInstallCodeRecord(snap.exists ? snap.data() : null, uid, now);
    if (!result.valid) throw new Error("invalid_or_used_code");

    await tx.set(
      ref,
      {
        used: true,
        consumed_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      },
      { merge: true },
    );

    return { ok: true };
  });
}
