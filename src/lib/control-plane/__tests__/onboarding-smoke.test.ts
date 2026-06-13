import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredDoc = Record<string, unknown>;

type FakeDocRef = {
  id: string;
  path: string;
  get(): Promise<{ exists: boolean; data(): StoredDoc | undefined }>;
  set(data: StoredDoc, options?: { merge?: boolean }): Promise<void>;
};

function makeDocSnap(ref: FakeDocRef, data: StoredDoc | undefined) {
  return {
    id: ref.id,
    ref,
    exists: Boolean(data),
    data: () => data,
  };
}

function createFakeDb() {
  const store = new Map<string, StoredDoc>();

  function docRef(collectionPath: string, id: string): FakeDocRef {
    const path = `${collectionPath}/${id}`;
    return {
      id,
      path,
      async get() {
        const data = store.get(path);
        return makeDocSnap(this, data);
      },
      async set(data, options) {
        const existing = options?.merge ? (store.get(path) ?? {}) : {};
        store.set(path, { ...existing, ...data });
      },
    };
  }

  function collection(collectionPath: string) {
    return {
      doc(id = `doc_${store.size + 1}`) {
        return docRef(collectionPath, id);
      },
      where(field: string, op: "==", value: unknown) {
        return {
          limit(count: number) {
            return {
              async get() {
                const prefix = `${collectionPath}/`;
                const docs = Array.from(store.entries())
                  .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
                  .map(([path, data]) => {
                    const id = path.slice(prefix.length);
                    return makeDocSnap(docRef(collectionPath, id), data);
                  })
                  .filter((snap) => (op === "==" ? snap.data()?.[field] === value : false))
                  .slice(0, count);
                return { empty: docs.length === 0, docs };
              },
            };
          },
        };
      },
      async get() {
        const prefix = `${collectionPath}/`;
        const docs = Array.from(store.entries())
          .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
          .map(([path, data]) => {
            const id = path.slice(prefix.length);
            return makeDocSnap(docRef(collectionPath, id), data);
          });
        return { empty: docs.length === 0, size: docs.length, docs };
      },
    };
  }

  return {
    store,
    collection,
    async runTransaction<T>(fn: (tx: { get(ref: FakeDocRef): Promise<ReturnType<typeof makeDocSnap>>; set(ref: FakeDocRef, data: StoredDoc, options?: { merge?: boolean }): void }) => Promise<T>) {
      return fn({
        async get(ref) {
          const data = store.get(ref.path);
          return makeDocSnap(ref, data);
        },
        set(ref, data, options) {
          const existing = options?.merge ? (store.get(ref.path) ?? {}) : {};
          store.set(ref.path, { ...existing, ...data });
        },
      });
    },
  };
}

const mocks = vi.hoisted(() => ({
  db: createFakeDb(),
  enforceRateLimit: vi.fn(),
  reserveIdempotencyKey: vi.fn(),
  recordControlPlaneAudit: vi.fn(),
  pruneExpiredControlPlaneArtifacts: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: mocks.db,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => new Date("2026-05-06T12:00:00.000Z").toISOString(),
  },
}));

vi.mock("../request-guard", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  hashStable: (value: unknown) => `hash_${JSON.stringify(value).length}`,
  pruneExpiredControlPlaneArtifacts: mocks.pruneExpiredControlPlaneArtifacts,
  recordControlPlaneAudit: mocks.recordControlPlaneAudit,
  reserveIdempotencyKey: mocks.reserveIdempotencyKey,
}));

import { devicePollByDeviceCode, deviceStart, deviceVerifyUserCode, enrollWithEnrollmentToken } from "../device-auth";
import { ingestFromRequest } from "../ingest";

describe("control-plane onboarding smoke", () => {
  beforeEach(() => {
    mocks.db.store.clear();
    mocks.enforceRateLimit.mockResolvedValue({ ok: true });
    mocks.reserveIdempotencyKey.mockResolvedValue({ state: "created" });
    mocks.recordControlPlaneAudit.mockResolvedValue(undefined);
    mocks.pruneExpiredControlPlaneArtifacts.mockResolvedValue(undefined);
    process.env.AIDR_AGENT_TOKEN_SECRET = "a-strong-test-agent-token-secret-value";
  });

  it("covers prompt-to-agent-to-first-event enrollment flow", async () => {
    await mocks.db.collection("users/user_123/seat_usage").doc("current").set({
      allowed_agents: 1,
      current_agents: 0,
    });

    const started = await deviceStart({
      origin: "https://aidr.test",
      meta: { iid: "iid_onboarding_1", ip: "127.0.0.1", user_agent: "vitest" },
    });

    expect(started.verification_url).toContain(`/verify?code=${encodeURIComponent(started.user_code)}`);

    const verified = await deviceVerifyUserCode({
      uid: "user_123",
      user_code: started.user_code,
      ensureSeatUsage: async () => ({ allowed_agents: 1, current_agents: 0 }),
      ip: "127.0.0.1",
      user_agent: "vitest",
    });

    const authorized = await devicePollByDeviceCode(started.device_code);
    expect(authorized).toEqual({
      status: "authorized",
      enrollment_token: expect.stringMatching(/^aidr_enroll_/),
      agent_id: verified.agent_id,
    });
    if (authorized.status !== "authorized" || !authorized.enrollment_token) {
      throw new Error("expected authorized device code");
    }

    const enrolled = await enrollWithEnrollmentToken({
      enrollment_token: authorized.enrollment_token,
      origin: "https://aidr.test",
      iid: "iid_onboarding_1",
      agent_runtime: "claude-code",
      agent_runtime_version: "1.0.0",
      ip: "127.0.0.1",
      user_agent: "vitest",
    });

    expect(enrolled.agent_id).toBe(verified.agent_id);
    expect(enrolled.ingest_url).toBe("https://aidr.test/v1/ingest");
    expect(enrolled.access_token).toContain(".");

    const ingested = await ingestFromRequest({
      authorizationHeader: `Bearer ${enrolled.access_token}`,
      requestId: "req_onboarding_first_event",
      body: {
        events: [
          {
            event_id: "evt_onboarding_first",
            type: "pre_tool_use",
            verdict: "allow",
            severity: "info",
            command: "pnpm test",
            runtime_policy_cache: {
              source: "valid",
              usable: true,
              present: true,
              policy_version: "pol_onboarding",
              cached_at: "2026-05-06T11:59:30.000Z",
              expires_at: "2026-05-06T12:00:30.000Z",
              age_seconds: 30,
              ttl_seconds: 30,
              key_matches: true,
            },
          },
        ],
      },
      ip: "127.0.0.1",
      userAgent: "vitest",
    });

    expect(ingested).toEqual({ ok: true, accepted: 1 });

    const agent = mocks.db.store.get(`users/user_123/agents/${verified.agent_id}`);
    expect(agent).toMatchObject({
      status: "connected",
      runtime: "claude-code",
      installation_id: "iid_onboarding_1",
      runtime_policy_cache: {
        source: "valid",
        usable: true,
        policy_version: "pol_onboarding",
        ttl_seconds: 30,
        key_matches: true,
      },
    });

    const event = mocks.db.store.get("users/user_123/events/evt_onboarding_first");
    expect(event).toMatchObject({
      agent_id: verified.agent_id,
      type: "pre_tool_use",
      verdict: "allow",
      severity: "info",
      request_id: "req_onboarding_first_event",
    });
  });
});
