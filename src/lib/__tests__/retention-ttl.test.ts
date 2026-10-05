import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

/**
 * Firestore TTL needs a native timestamp field. Every collection with a TTL policy must (a) be declared in
 * firestore.indexes.json with ttl:true on `expire_at` and (b) actually have `expire_at` written by the code
 * that creates its documents, otherwise the policy silently deletes nothing.
 */
const WRITERS: Record<string, string[]> = {
  events: ["src/lib/control-plane/ingest.ts"],
  device_codes: ["src/lib/control-plane/device-auth.ts"],
  install_codes: ["src/lib/control-plane/install-code.ts"],
  enrollment_tokens: ["src/app/api/v1/[[...action]]/route.ts"],
  control_plane_audit: ["src/lib/control-plane/request-guard.ts"],
  control_plane_rate_limits: ["src/lib/control-plane/request-guard.ts"],
  control_plane_idempotency: ["src/lib/control-plane/request-guard.ts"],
};

describe("Firestore TTL policies", () => {
  const indexes = JSON.parse(read("firestore.indexes.json")) as {
    fieldOverrides: Array<{ collectionGroup: string; fieldPath: string; ttl?: boolean }>;
  };
  const ttl = indexes.fieldOverrides.filter((o) => o.ttl === true);

  it("declares ttl on expire_at for exactly the expiring collections", () => {
    expect(ttl.map((o) => `${o.collectionGroup}.${o.fieldPath}`).sort()).toEqual(
      Object.keys(WRITERS)
        .map((c) => `${c}.expire_at`)
        .sort(),
    );
  });

  it.each(Object.entries(WRITERS))("%s documents are written with an expire_at timestamp", (_collection, files) => {
    for (const file of files) expect(read(file)).toMatch(/expire_at:/);
  });

  it("firebase.json points at the index file and does not carry the unsupported ttlPolicies key", () => {
    const firebase = JSON.parse(read("firebase.json")) as { firestore: Record<string, unknown> };
    expect(firebase.firestore.indexes).toBe("firestore.indexes.json");
    expect(firebase.firestore.ttlPolicies).toBeUndefined();
  });

  it("states on the privacy page the retention periods the code stamps", () => {
    const ingest = read("src/lib/control-plane/ingest.ts");
    expect(ingest).toMatch(/return 365/);
    expect(ingest).toMatch(/return 180/);
    expect(ingest).toMatch(/return 90/);
    expect(read("src/lib/control-plane/request-guard.ts")).toMatch(/90 \* 24 \* 60 \* 60 \* 1000/);
    const privacy = read("src/app/(public)/privacy/page.tsx");
    for (const phrase of ["365 days", "180 days", "90 days", "15 minutes", "30 minutes"]) expect(privacy).toContain(phrase);
  });
});
