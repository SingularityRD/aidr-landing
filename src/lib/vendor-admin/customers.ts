/**
 * Vendor customer records and the licenses issued from them (Firestore,
 * backend-only: firestore.rules denies every client read and write).
 *
 *   vendor_customers/{customer_id}                       the company's terms
 *   vendor_customers/{customer_id}/issuances/{license_id} each signed license + packet
 *   vendor_admin_audit/{auto}                            who did what (kept, no TTL)
 *
 * A customer record is only the input: what an endpoint enforces is the signed
 * license issued from it. Changing the record never changes a license already
 * delivered; issuing again produces a new license and packet (renewal).
 */
import { randomBytes } from "node:crypto";
import {
  CUSTOMER_ID_PATTERN,
  DEPLOYMENTS,
  LicenseIssueError,
  MAX_GRACE_DAYS,
  MAX_SEATS,
  PLAN_IDS,
  SENSITIVITIES,
  type CustomerPacketPayload,
  type Deployment,
  type LicensePayload,
  type PlanId,
  type Sensitivity,
  type SignedDocument,
  type SigningKey,
  checkControlPlaneUrl,
  checkDisplayName,
  documentFileText,
  isoSeconds,
  sha256Hex,
  signCustomerPacket,
  signLicense,
  updatesUntil,
  validateLicensePayload,
} from "./license";

export const CUSTOMERS = "vendor_customers";
export const ISSUANCES = "issuances";
export const AUDIT = "vendor_admin_audit";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FEATURE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;

/** The editable terms of one customer company. */
export interface CustomerTerms {
  /** Install and leak-trace id; also the installer file name (SingularityAIDR-<ID>-…). Never changes. */
  customer_id: string;
  /** Legal name in the license (`customer`, up to 120 characters). */
  legal_name: string;
  /** Name the installer and `aidr status` show (`display_name`, up to 60 characters). */
  display_name: string;
  /** Device limit: enrolled computers the customer's server admits. */
  seats: number;
  plan_id: PlanId;
  deployment: Deployment;
  features: string[];
  /** First and last day of the term, YYYY-MM-DD (UTC). */
  starts_on: string;
  ends_on: string;
  grace_days: number;
  /** The customer's own AIDR server, written into the installer; empty when none. */
  control_plane_url: string;
  sensitivity: Sensitivity | "";
  contact_email: string;
  notes: string;
}

export interface CustomerRecord extends CustomerTerms {
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  /** The latest issuance, for the list view. */
  latest_license_id: string | null;
  latest_issued_at: string | null;
}

export interface IssuanceRecord {
  license_id: string;
  packet_id: string;
  issued_at: string;
  issued_by: string;
  key_id: string;
  seats: number;
  starts_on: string;
  ends_on: string;
  updates_until: string;
  license_json: string;
  license_sha256: string;
  packet_json: string;
  packet_sha256: string;
  builds: Array<{ requested_at: string; requested_by: string; release_tag: string; build_exe: boolean }>;
}

export interface Actor {
  userId: string;
  email: string;
}

/** The Firestore subset this module uses (the Admin SDK, or the test fake). */
export interface VendorDb {
  collection(path: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export class CustomerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly field?: string,
  ) {
    super(message);
    this.name = "CustomerError";
  }
}

function text(value: unknown, field: string, max: number, required: boolean): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (required && !s) throw new CustomerError(`${field} is required`, 400, field);
  if ([...s].length > max) throw new CustomerError(`${field} is longer than ${max} characters`, 400, field);
  if (/[\x00-\x1f\x7f]/.test(s)) throw new CustomerError(`${field} has control characters`, 400, field);
  return s;
}

function wholeNumber(value: unknown, field: string, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new CustomerError(`${field} must be a whole number from ${min} to ${max}`, 400, field);
  }
  return n;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value as T)) throw new CustomerError(`${field} must be one of ${allowed.join(", ")}`, 400, field);
  return value as T;
}

function day(value: unknown, field: string): string {
  if (typeof value !== "string" || !DATE.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) {
    throw new CustomerError(`${field} must be a date (YYYY-MM-DD)`, 400, field);
  }
  return value;
}

/** Validate and normalise customer terms from a form; `existing` fixes the customer id. */
export function parseCustomerTerms(input: Record<string, unknown>, existingId?: string): CustomerTerms {
  const customerId = existingId ?? text(input.customer_id, "customer_id", 32, true).toLowerCase();
  if (!CUSTOMER_ID_PATTERN.test(customerId)) {
    throw new CustomerError("customer id must be 2..32 characters of a-z, 0-9 and '-', starting with a letter or digit", 400, "customer_id");
  }
  const features = (Array.isArray(input.features) ? input.features : String(input.features ?? "").split(","))
    .map((f) => String(f).trim())
    .filter(Boolean);
  if (features.length > 64 || features.some((f) => !FEATURE.test(f)) || new Set(features).size !== features.length) {
    throw new CustomerError("features must be at most 64 unique identifiers of a-z, 0-9 and . _ : -", 400, "features");
  }
  const terms: CustomerTerms = {
    customer_id: customerId,
    legal_name: text(input.legal_name, "legal_name", 120, true),
    display_name: text(input.display_name, "display_name", 60, true),
    seats: wholeNumber(input.seats, "seats", 1, MAX_SEATS),
    plan_id: oneOf(input.plan_id, PLAN_IDS, "plan_id"),
    deployment: oneOf(input.deployment, DEPLOYMENTS, "deployment"),
    features,
    starts_on: day(input.starts_on, "starts_on"),
    ends_on: day(input.ends_on, "ends_on"),
    grace_days: wholeNumber(input.grace_days ?? 14, "grace_days", 0, MAX_GRACE_DAYS),
    control_plane_url: text(input.control_plane_url, "control_plane_url", 2048, false),
    sensitivity: input.sensitivity ? oneOf(input.sensitivity, SENSITIVITIES, "sensitivity") : "",
    contact_email: text(input.contact_email, "contact_email", 254, false),
    notes: text(input.notes, "notes", 2000, false),
  };
  if (terms.ends_on <= terms.starts_on) throw new CustomerError("the term must end after it starts", 400, "ends_on");
  if (terms.deployment === "airgap" && terms.plan_id !== "enterprise") {
    throw new CustomerError("an air-gapped deployment needs the enterprise plan", 400, "plan_id");
  }
  try {
    checkDisplayName(terms.display_name);
    if (terms.control_plane_url) checkControlPlaneUrl(terms.control_plane_url);
  } catch (error) {
    if (error instanceof LicenseIssueError) throw new CustomerError(error.message, 400, error.field);
    throw error;
  }
  return terms;
}

async function audit(db: VendorDb, actor: Actor, action: string, customerId: string, metadata: Record<string, unknown>, now: string) {
  await db.collection(AUDIT).add({ action, customer_id: customerId, actor_user_id: actor.userId, actor_email: actor.email, metadata, at: now });
}

const issuances = (db: VendorDb, customerId: string) => db.collection(`${CUSTOMERS}/${customerId}/${ISSUANCES}`);

export async function listCustomers(db: VendorDb): Promise<CustomerRecord[]> {
  const snap = await db.collection(CUSTOMERS).get();
  const rows = snap.docs.map((doc: { data(): CustomerRecord }) => doc.data());
  return rows.sort((a: CustomerRecord, b: CustomerRecord) => a.customer_id.localeCompare(b.customer_id));
}

export async function getCustomer(db: VendorDb, customerId: string): Promise<CustomerRecord | null> {
  if (!CUSTOMER_ID_PATTERN.test(customerId)) return null;
  const snap = await db.collection(CUSTOMERS).doc(customerId).get();
  return snap.exists ? (snap.data() as CustomerRecord) : null;
}

export async function listIssuances(db: VendorDb, customerId: string): Promise<IssuanceRecord[]> {
  const snap = await issuances(db, customerId).get();
  const rows: IssuanceRecord[] = snap.docs.map((doc: { data(): IssuanceRecord }) => doc.data());
  return rows.sort((a, b) => b.issued_at.localeCompare(a.issued_at));
}

export async function getIssuance(db: VendorDb, customerId: string, licenseId: string): Promise<IssuanceRecord | null> {
  if (!CUSTOMER_ID_PATTERN.test(customerId) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(licenseId)) return null;
  const snap = await issuances(db, customerId).doc(licenseId).get();
  return snap.exists ? (snap.data() as IssuanceRecord) : null;
}

/** Create a customer; its id is taken for good (installers and licenses carry it). */
export async function createCustomer(db: VendorDb, terms: CustomerTerms, actor: Actor, now = new Date()): Promise<CustomerRecord> {
  const at = now.toISOString();
  const ref = db.collection(CUSTOMERS).doc(terms.customer_id);
  const record: CustomerRecord = {
    ...terms,
    created_at: at,
    created_by: actor.email,
    updated_at: at,
    updated_by: actor.email,
    latest_license_id: null,
    latest_issued_at: null,
  };
  await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) throw new CustomerError(`customer ${terms.customer_id} already exists`, 409, "customer_id");
    tx.set(ref, record);
  });
  await audit(db, actor, "customer.create", terms.customer_id, { seats: terms.seats, ends_on: terms.ends_on }, at);
  return record;
}

export async function updateCustomer(db: VendorDb, terms: CustomerTerms, actor: Actor, now = new Date()): Promise<CustomerRecord> {
  const at = now.toISOString();
  const ref = db.collection(CUSTOMERS).doc(terms.customer_id);
  const updated = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new CustomerError(`customer ${terms.customer_id} does not exist`, 404);
    const record: CustomerRecord = { ...(snap.data() as CustomerRecord), ...terms, updated_at: at, updated_by: actor.email };
    tx.set(ref, record);
    return record;
  });
  await audit(db, actor, "customer.update", terms.customer_id, { seats: terms.seats, ends_on: terms.ends_on }, at);
  return updated;
}

function documentId(prefix: string, customerId: string, now: Date): string {
  const stamp = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${customerId}-${stamp}-${randomBytes(3).toString("hex")}`;
}

/** The license payload for a customer's current terms (field order as scripts/license-issue.mjs writes it). */
export function buildLicensePayload(customer: CustomerTerms, licenseId: string, now: Date): LicensePayload {
  const issuedAt = isoSeconds(now.getTime());
  const license: LicensePayload = {
    license_id: licenseId,
    customer: customer.legal_name,
    customer_id: customer.customer_id,
    plan_id: customer.plan_id,
    seats: customer.seats,
    features: customer.features,
    deployment: customer.deployment,
    issued_at: issuedAt,
    not_before: `${customer.starts_on}T00:00:00Z`,
    // The whole last day is in the term.
    expires_at: `${customer.ends_on}T23:59:59Z`,
    grace_days: customer.grace_days,
  };
  validateLicensePayload(license);
  return license;
}

/** The customer packet payload around a signed license (field order as scripts/customer-packet-issue.mjs writes it). */
export function buildPacketPayload(customer: CustomerTerms, packetId: string, license: SignedDocument<LicensePayload>): CustomerPacketPayload {
  return {
    customer_id: customer.customer_id,
    packet_id: packetId,
    issued_at: license.payload.issued_at,
    license,
    ...(customer.control_plane_url ? { control_plane_url: customer.control_plane_url } : {}),
    ...(customer.sensitivity ? { sensitivity: customer.sensitivity } : {}),
    display_name: customer.display_name,
  };
}

/** Sign a new license and customer packet from the customer's current terms and record them. */
export async function issueForCustomer(db: VendorDb, customerId: string, key: SigningKey, actor: Actor, now = new Date()): Promise<IssuanceRecord> {
  const customer = await getCustomer(db, customerId);
  if (!customer) throw new CustomerError(`customer ${customerId} does not exist`, 404);
  const ids = { licenseId: documentId("LIC", customerId, now), packetId: documentId("PKT", customerId, now) };
  let licenseDoc, packetDoc;
  try {
    licenseDoc = signLicense(buildLicensePayload(customer, ids.licenseId, now), key);
    packetDoc = signCustomerPacket(buildPacketPayload(customer, ids.packetId, licenseDoc), key);
  } catch (error) {
    if (error instanceof LicenseIssueError) throw new CustomerError(error.message, 400, error.field);
    throw error;
  }
  const licenseJson = documentFileText(licenseDoc);
  const packetJson = documentFileText(packetDoc);
  const record: IssuanceRecord = {
    license_id: ids.licenseId,
    packet_id: ids.packetId,
    issued_at: licenseDoc.payload.issued_at,
    issued_by: actor.email,
    key_id: key.keyId,
    seats: customer.seats,
    starts_on: customer.starts_on,
    ends_on: customer.ends_on,
    updates_until: updatesUntil(licenseDoc.payload),
    license_json: licenseJson,
    license_sha256: sha256Hex(licenseJson),
    packet_json: packetJson,
    packet_sha256: sha256Hex(packetJson),
    builds: [],
  };
  const customerRef = db.collection(CUSTOMERS).doc(customerId);
  await db.runTransaction(async (tx) => {
    tx.set(issuances(db, customerId).doc(ids.licenseId), record);
    tx.set(customerRef, { latest_license_id: ids.licenseId, latest_issued_at: record.issued_at }, { merge: true });
  });
  await audit(db, actor, "license.issue", customerId, { license_id: ids.licenseId, packet_id: ids.packetId, key_id: key.keyId, seats: customer.seats, ends_on: customer.ends_on }, now.toISOString());
  return record;
}

/** Record an installer build request against an issuance. */
export async function recordBuild(
  db: VendorDb,
  customerId: string,
  licenseId: string,
  build: { release_tag: string; build_exe: boolean },
  actor: Actor,
  now = new Date(),
): Promise<void> {
  const ref = issuances(db, customerId).doc(licenseId);
  const at = now.toISOString();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new CustomerError(`license ${licenseId} does not exist`, 404);
    const builds = [...((snap.data() as IssuanceRecord).builds ?? []), { requested_at: at, requested_by: actor.email, ...build }];
    tx.set(ref, { builds }, { merge: true });
  });
  await audit(db, actor, "installer.build", customerId, { license_id: licenseId, ...build }, at);
}
