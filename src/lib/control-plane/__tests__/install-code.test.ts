import { describe, expect, it } from "vitest";
import {
  consumeInstallCode,
  createInstallCode,
  isInstallCodeValid,
  normalizeInstallCode,
  validateInstallCodeRecord,
  type InstallCodeDb,
} from "../install-code";

type StoredRecord = Record<string, unknown>;

class FakeDocRef {
  constructor(
    private readonly records: Map<string, StoredRecord>,
    private readonly id: string,
  ) {}

  async get() {
    const record = this.records.get(this.id);
    return {
      exists: record !== undefined,
      data: () => (record ? { ...record } : undefined),
    };
  }

  async set(data: StoredRecord, options?: { merge?: boolean }) {
    const previous = this.records.get(this.id) ?? {};
    this.records.set(this.id, options?.merge ? { ...previous, ...data } : { ...data });
  }
}

class FakeTransaction {
  async get(ref: FakeDocRef) {
    return ref.get();
  }

  set(ref: FakeDocRef, data: StoredRecord, options?: { merge?: boolean }) {
    return ref.set(data, options);
  }
}

class FakeInstallCodeDb implements InstallCodeDb {
  readonly records = new Map<string, StoredRecord>();

  collection(name: "install_codes") {
    if (name !== "install_codes") throw new Error("unexpected_collection");
    return {
      doc: (id: string) => new FakeDocRef(this.records, id),
    };
  }

  async runTransaction<T>(updateFunction: (transaction: FakeTransaction) => Promise<T>) {
    return updateFunction(new FakeTransaction());
  }
}

const now = new Date("2026-05-06T10:00:00.000Z");
const later = new Date("2026-05-06T10:15:00.000Z");

describe("install-code control plane", () => {
  it("normalizes user supplied codes before lookup", () => {
    expect(normalizeInstallCode(" ab12cd34 ")).toBe("AB12CD34");
  });

  it("validates owner, expiry, and single-use state", () => {
    expect(validateInstallCodeRecord(null, "user_1", now)).toEqual({
      valid: false,
      reason: "not_found",
    });
    expect(
      validateInstallCodeRecord({ user_id: "user_1", expires_at: later.toISOString(), used: true }, "user_1", now),
    ).toEqual({ valid: false, reason: "used" });
    expect(
      validateInstallCodeRecord(
        { user_id: "user_1", expires_at: "2026-05-06T09:59:59.000Z", used: false },
        "user_1",
        now,
      ),
    ).toEqual({ valid: false, reason: "expired" });
    expect(
      validateInstallCodeRecord({ user_id: "user_2", expires_at: later.toISOString(), used: false }, "user_1", now),
    ).toEqual({ valid: false, reason: "wrong_user" });
    expect(
      validateInstallCodeRecord({ user_id: "user_1", expires_at: later.toISOString(), used: false }, "user_1", now),
    ).toEqual({ valid: true });
  });

  it("creates, validates, and atomically consumes a code once", async () => {
    const db = new FakeInstallCodeDb();
    await createInstallCode(db, {
      code: "ab12cd34",
      uid: "user_1",
      email: "dev@example.com",
      expiresAt: later,
    });

    expect(await isInstallCodeValid(db, "AB12CD34", "user_1", now)).toBe(true);
    await expect(consumeInstallCode(db, "ab12cd34", "user_1", now)).resolves.toEqual({ ok: true });
    expect(await isInstallCodeValid(db, "AB12CD34", "user_1", now)).toBe(false);
    await expect(consumeInstallCode(db, "AB12CD34", "user_1", now)).rejects.toThrow("invalid_or_used_code");

    expect(db.records.get("AB12CD34")).toMatchObject({
      user_id: "user_1",
      email: "dev@example.com",
      used: true,
    });
  });

  it("rejects consume for the wrong user or an expired code", async () => {
    const db = new FakeInstallCodeDb();
    await createInstallCode(db, {
      code: "CODE0001",
      uid: "user_1",
      expiresAt: later,
    });
    await createInstallCode(db, {
      code: "CODE0002",
      uid: "user_1",
      expiresAt: new Date("2026-05-06T09:00:00.000Z"),
    });

    await expect(consumeInstallCode(db, "CODE0001", "user_2", now)).rejects.toThrow("invalid_or_used_code");
    await expect(consumeInstallCode(db, "CODE0002", "user_1", now)).rejects.toThrow("invalid_or_used_code");
  });
});
