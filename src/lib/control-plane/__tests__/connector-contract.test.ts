/**
 * Connector <-> control-plane contract test.
 *
 * This runs the REAL AIDR connector code (aidr `packages/core`: ControlPlaneClient,
 * runSessionStart, managed-state/entitlement verification, remote policy sync)
 * against the REAL route handlers under `src/app/v1/*` and `src/app/api/v1`,
 * in-process, over an in-memory Firestore. No network, no real credentials: every
 * secret and signing key is generated locally for the test.
 *
 * The aidr checkout is located via AIDR_CORE_SRC (path to `packages/core/src`) or
 * the sibling directory `../aidr`. When it is absent the suite is skipped, so the
 * landing repo's own CI keeps working without the connector source.
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeFirestore } from "./helpers/fake-firestore";

vi.mock("@/lib/firebase/admin", async () => {
  const { FakeFirestore: Fake } = await import("./helpers/fake-firestore");
  return { adminDb: new Fake(), adminAuth: {}, firebaseAdminEnvError: null };
});
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => new Date().toISOString() },
  Timestamp: class {},
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: null })), currentUser: vi.fn() }));

const AIDR_CORE_SRC =
  process.env.AIDR_CORE_SRC ?? resolve(process.cwd(), "../aidr/packages/core/src");
const aidrAvailable = existsSync(join(AIDR_CORE_SRC, "clients", "control-plane.ts"));
const ENDPOINT = "https://aidr.test";

/* eslint-disable @typescript-eslint/no-explicit-any -- the connector source is loaded dynamically from a sibling checkout */
type Core = Record<string, any> & {
  ControlPlaneClient: any;
  ConfigSchema: any;
  DEFAULT_CONTROL_PLANE_ENDPOINT: string;
};

describe.skipIf(!aidrAvailable)("AIDR connector <-> control-plane contract", () => {
  let core: Core;
  let db: FakeFirestore;
  let home: string;
  let aidrDir: string;
  let publicKeyPem: string;
  let clientIpCounter = 0;
  let fixedClientIp: string | null = null;
  let interceptResponse: ((op: string, response: Response) => Promise<Response>) | null = null;
  const calls: Array<{ op: string; method: string; status: number }> = [];

  // ── route table: the paths the connector resolves with controlPlaneUrl() ────
  const routes: Record<string, () => Promise<Record<string, (r: NextRequest) => Promise<Response>>>> = {
    "device-start": () => import("@/app/v1/device-start/route"),
    "device-poll": () => import("@/app/v1/device-poll/route"),
    enroll: () => import("@/app/v1/enroll/route"),
    ingest: () => import("@/app/v1/ingest/route"),
    policy: () => import("@/app/v1/policy/route"),
    revocations: () => import("@/app/v1/revocations/route"),
  };

  async function dispatch(url: URL, init: RequestInit): Promise<Response> {
    const match = url.pathname.match(/^\/(?:api\/)?v1\/([a-z-]+)$/);
    if (url.origin !== ENDPOINT || !match) throw new TypeError("fetch failed (offline)");
    const op = match[1];
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers as HeadersInit);
    headers.set("x-real-ip", fixedClientIp ?? `10.1.${Math.floor(clientIpCounter / 250)}.${(clientIpCounter += 1) % 250}`);
    const request = new NextRequest(url, {
      method,
      headers,
      ...(method === "GET" ? {} : { body: init.body as BodyInit | undefined }),
    });
    let response: Response;
    if (url.pathname.startsWith("/api/v1/")) {
      const mod = await import("@/app/api/v1/[[...action]]/route");
      const handler = method === "GET" ? mod.GET : mod.POST;
      response = await handler(request, { params: Promise.resolve({ action: [op] }) });
    } else {
      const mod = await routes[op]!();
      const handler = mod[method];
      response = handler ? await handler(request) : new Response("{}", { status: 405 });
    }
    calls.push({ op, method, status: response.status });
    return interceptResponse ? interceptResponse(op, response) : response;
  }

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "aidr-contract-"));
    aidrDir = join(home, ".singularity-aidr");
    mkdirSync(aidrDir, { recursive: true });
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    // Locally generated key material only.
    process.env.AIDR_AGENT_TOKEN_SECRET = randomBytes(32).toString("hex");
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    process.env.AIDR_ENTITLEMENT_SIGNING_KEY_ID = "test-key-1";
    process.env.AIDR_ENTITLEMENT_SIGNING_PRIVATE_KEY_PKCS8_B64 = privateKey
      .export({ type: "pkcs8", format: "der" })
      .toString("base64");
    delete process.env.NEXT_PUBLIC_APP_URL;

    vi.stubGlobal("fetch", (input: RequestInfo | URL, init: RequestInit = {}) =>
      dispatch(new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url), init),
    );

    const base = (name: string) => import(/* @vite-ignore */ join(AIDR_CORE_SRC, name));
    const [cp, types, ss, managed, rp, cpUrl] = await Promise.all([
      base("clients/control-plane.ts"),
      base("types.ts"),
      base("session-start.ts"),
      base("managed.ts"),
      base("remote-policy.ts"),
      base("clients/control-plane-url.ts"),
    ]);
    core = {
      ControlPlaneClient: cp.ControlPlaneClient,
      ConfigSchema: types.ConfigSchema,
      runSessionStart: ss.runSessionStart,
      applyIngestResult: managed.applyIngestResult,
      loadManagedState: managed.loadManagedState,
      isPremiumUnlocked: managed.isPremiumUnlocked,
      syncRemoteRuntimePolicy: rp.syncRemoteRuntimePolicy,
      clearRemoteRuntimePolicyCacheForTests: rp.clearRemoteRuntimePolicyCacheForTests,
      DEFAULT_CONTROL_PLANE_ENDPOINT: cpUrl.DEFAULT_CONTROL_PLANE_ENDPOINT,
    };
    db = (await import("@/lib/firebase/admin")).adminDb as unknown as FakeFirestore;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    rmSync(home, { recursive: true, force: true });
  });

  beforeEach(() => {
    fixedClientIp = null;
    interceptResponse = null;
    calls.length = 0;
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  const configInput = (overrides: Record<string, unknown> = {}) => ({
    mode: "managed",
    control_plane: {
      endpoint: ENDPOINT,
      timeout_seconds: 5,
      remote_policy_cache_path: join(aidrDir, "remote-policy-cache.json"),
    },
    licensing: { public_keys_pem: [publicKeyPem] },
    version_check: { enabled: false },
    ...overrides,
  });

  const clientFor = (token: string, config = configInput(), queueRoot = join(home, "queue")) => {
    const parsed = core.ConfigSchema.parse(config);
    return new core.ControlPlaneClient(parsed.control_plane, token, undefined, {
      telemetryQueueRoot: queueRoot,
    });
  };

  const approve = (uid: string, userCode: string, allowed = 10) =>
    import("../device-auth").then(({ deviceVerifyUserCode }) =>
      deviceVerifyUserCode({
        uid,
        user_code: userCode,
        ensureSeatUsage: async () => ({ allowed_agents: allowed, current_agents: 0 }),
      }),
    );

  /** Full device-code enrollment driven by the real client: start -> approve -> poll -> enroll. */
  async function enrollDevice(uid: string, iid = `iid-${randomBytes(6).toString("hex")}`) {
    const anon = clientFor("");
    const started = await anon.deviceStart({ iid, agent_runtime: "claude-code", agent_runtime_version: "1.2.3" });
    expect(started.ok).toBe(true);
    const body = started.body as Record<string, string>;
    await approve(uid, body.user_code);
    const polled = await anon.devicePoll({ device_code: body.device_code });
    expect(polled.ok).toBe(true);
    const enrollmentToken = String(polled.body?.enrollment_token);
    const enrolled = await clientFor(enrollmentToken).enroll({ iid, agent_runtime: "claude-code" });
    expect(enrolled.ok).toBe(true);
    return {
      uid,
      iid,
      deviceCode: body.device_code,
      userCode: body.user_code,
      enrollmentToken,
      apiKey: String(enrolled.body?.api_key),
      agentId: String(enrolled.body?.agent_id),
      enrollBody: enrolled.body as Record<string, unknown>,
    };
  }

  const rawPost = (op: string, body: unknown, token: string, headers: Record<string, string> = {}) =>
    fetch(`${ENDPOINT}/v1/${op}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const rawGet = (op: string, token: string) =>
    fetch(`${ENDPOINT}/v1/${op}`, { method: "GET", headers: { authorization: `Bearer ${token}` } });

  const event = (id = `evt-${randomBytes(6).toString("hex")}`, extra: Record<string, unknown> = {}) => ({
    event_id: id,
    type: "runtime_verdict",
    verdict: "deny",
    severity: "critical",
    ...extra,
  });

  // ── 0. defaults ────────────────────────────────────────────────────────────
  describe("defaults", () => {
    it("local mode contacts nobody; managed mode defaults to the origin that serves /v1/*", async () => {
      const { loadConfig } = await import(/* @vite-ignore */ join(AIDR_CORE_SRC, "config.ts"));
      const cfgPath = join(home, "defaults.json");
      writeFileSync(cfgPath, JSON.stringify({}));
      expect((await loadConfig(cfgPath)).control_plane.endpoint).toBe("");
      writeFileSync(cfgPath, JSON.stringify({ mode: "managed" }));
      const managed = await loadConfig(cfgPath);
      expect(managed.control_plane.endpoint).toBe(core.DEFAULT_CONTROL_PLANE_ENDPOINT);
      expect(managed.control_plane.endpoint).toBe("https://aidr.singularityrd.com");
      writeFileSync(cfgPath, JSON.stringify({ mode: "managed", control_plane: { endpoint: "https://x.example" } }));
      expect((await loadConfig(cfgPath)).control_plane.endpoint).toBe("https://x.example");
    });
  });

  // ── 1. real session-start: device-start -> poll -> enroll ─────────────────
  describe("session start enrollment (real runSessionStart)", () => {
    const uid = "tenant_session_uid";

    it("shows a verification code, then enrolls after approval and stores a verified signed entitlement", async () => {
      const configPath = join(aidrDir, "config.json");
      writeFileSync(configPath, JSON.stringify(configInput()));
      const ctx = {
        plugins: [],
        threatsDir: resolve(AIDR_CORE_SRC, "../../../threats"),
        allowlistsDir: resolve(AIDR_CORE_SRC, "../../../allowlists"),
        version: "0.0.0-contract",
        agentRuntime: "claude-code" as const,
        configPath,
        aidrDirPath: aidrDir,
        checkUrls: false,
        checkFileHashes: false,
      };

      // First start: pending. The user sees a code and a verification URL.
      const first = await core.runSessionStart(ctx);
      expect(first.enabled).toBe(false);
      expect(first.disabled_reason).toBe("auth_required");
      expect(first.bootstrap?.user_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(first.bootstrap?.verification_url).toBe(
        `${ENDPOINT}/verify?code=${encodeURIComponent(first.bootstrap!.user_code)}`,
      );
      expect(calls.map((c) => c.op)).toEqual(["device-start", "device-poll"]);
      // The server bound the device flow to this installation id.
      const iid = readFileSync(join(aidrDir, "installation-id"), "utf8").trim();
      const deviceDoc = [...db.docs.entries()].find(([path]) => path.startsWith("device_codes/"));
      expect((deviceDoc![1].meta as Record<string, unknown>).iid).toBe(iid);

      // A second start before approval reuses the same code (no new device session).
      const again = await core.runSessionStart(ctx);
      expect(again.bootstrap?.user_code).toBe(first.bootstrap!.user_code);
      expect(calls.filter((c) => c.op === "device-start")).toHaveLength(1);

      // The user approves in the dashboard; the next start enrolls.
      await approve(uid, first.bootstrap!.user_code);
      calls.length = 0;
      const enrolled = await core.runSessionStart(ctx);
      expect(enrolled.enabled).toBe(true);
      expect(calls.map((c) => c.op)).toEqual(expect.arrayContaining(["device-poll", "enroll", "ingest"]));
      expect(calls.every((c) => c.status === 200)).toBe(true);

      // managed.json holds the credential and a signed entitlement the connector verified itself.
      const state = await core.loadManagedState(join(aidrDir, "managed.json"), {
        publicKeysPem: [publicKeyPem],
      });
      expect(state.api_key).toBeTruthy();
      expect(state.entitlement_alg).toBe("ed25519");
      expect(state.entitlement_key_id).toBe("test-key-1");
      expect(state.entitlement?.schema_version).toBe(2);
      expect(state.device_code).toBeUndefined();
      expect(state.seat_status).toBe("ok");
      // The agent exists, is bound to the installation, and is connected.
      const agent = [...db.docs.entries()].find(([p]) => p.startsWith(`users/${uid}/agents/`))![1];
      expect(agent).toMatchObject({ status: "connected", iid, runtime: "claude-code" });
    });
  });

  // ── 2. device states ───────────────────────────────────────────────────────
  describe("device-start / device-poll states", () => {
    it("pending -> approved, with the response shape the client reads", async () => {
      const anon = clientFor("");
      const started = await anon.deviceStart({ iid: "iid-states-1" });
      expect(started.status).toBe(200);
      expect(started.body).toMatchObject({
        ok: true,
        device_code: expect.stringMatching(/^[a-f0-9]{48}$/),
        user_code: expect.stringMatching(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/),
        verification_url: expect.stringContaining(`${ENDPOINT}/verify?code=`),
        interval_seconds: 5,
      });
      const body = started.body as Record<string, string>;
      expect(Date.parse(body.expires_at)).toBeGreaterThan(Date.now());

      const pending = await anon.devicePoll({ device_code: body.device_code });
      expect(pending.body).toMatchObject({ ok: true, status: "authorization_pending" });
      expect(pending.body?.enrollment_token).toBeUndefined();

      await approve("tenant_states", body.user_code);
      const approved = await anon.devicePoll({ device_code: body.device_code });
      expect(approved.body).toMatchObject({
        ok: true,
        status: "authorized",
        enrollment_token: expect.stringMatching(/^aidr_enroll_/),
        agent_id: expect.stringMatching(/^aidr_ag_/),
      });
    });

    it("expired, denied and unknown device codes are refused with distinct errors", async () => {
      const anon = clientFor("");
      const a = (await anon.deviceStart({ iid: "iid-states-2" })).body as Record<string, string>;
      db.seed(`device_codes/${a.device_code}`, {
        ...db.peek(`device_codes/${a.device_code}`)!,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      const expired = await anon.devicePoll({ device_code: a.device_code });
      expect(expired).toMatchObject({ ok: false, status: 401, error: "device_code_expired" });

      const b = (await anon.deviceStart({ iid: "iid-states-3" })).body as Record<string, string>;
      const { deviceDenyUserCode } = await import("../device-auth");
      await deviceDenyUserCode({ uid: "tenant_states", user_code: b.user_code });
      const denied = await anon.devicePoll({ device_code: b.device_code });
      expect(denied).toMatchObject({ ok: false, status: 403, error: "access_denied" });
      // A denied code can no longer be approved.
      await expect(approve("tenant_states", b.user_code)).rejects.toThrow("invalid_device_state");

      const unknown = await anon.devicePoll({ device_code: "f".repeat(48) });
      expect(unknown).toMatchObject({ ok: false, status: 401, error: "device_code_invalid" });
      const missing = await fetch(`${ENDPOINT}/v1/device-poll`, { method: "POST", body: "{}" });
      expect(missing.status).toBe(401);
    });

    it("rate limits device-start per client and reports 429 with Retry-After", async () => {
      fixedClientIp = "203.0.113.9";
      const anon = clientFor("");
      for (let i = 0; i < 6; i += 1) expect((await anon.deviceStart({ iid: `iid-rl-${i}` })).ok).toBe(true);
      const limited = await anon.deviceStart({ iid: "iid-rl-x" });
      expect(limited).toMatchObject({ ok: false, status: 429, error: "rate_limited" });
      const raw = await fetch(`${ENDPOINT}/v1/device-start`, { method: "POST", body: "{}" });
      expect(raw.status).toBe(429);
      expect(Number(raw.headers.get("retry-after"))).toBeGreaterThan(0);
    });

    it("does not persist arbitrary client JSON from the unauthenticated device-start", async () => {
      const res = await fetch(`${ENDPOINT}/v1/device-start`, {
        method: "POST",
        body: JSON.stringify({ iid: "iid-meta", evil: "x".repeat(5000), agent_runtime: "r".repeat(500) }),
      });
      const body = (await res.json()) as { device_code: string };
      const stored = db.peek(`device_codes/${body.device_code}`)!;
      expect(Object.keys(stored.meta as object).sort()).toEqual(
        ["agent_runtime", "agent_runtime_version", "iid", "ip", "user_agent"].sort(),
      );
      expect((stored.meta as Record<string, unknown>).agent_runtime).toBeNull();
      const huge = await fetch(`${ENDPOINT}/v1/device-start`, {
        method: "POST",
        body: JSON.stringify({ pad: "x".repeat(40_000) }),
      });
      expect(huge.status).toBe(413);
    });
  });

  // ── 3. enroll ──────────────────────────────────────────────────────────────
  describe("enroll", () => {
    it("returns the legacy api_key credential plus a signed v2 entitlement the client verifies", async () => {
      const e = await enrollDevice("tenant_enroll_1");
      expect(e.enrollBody).toMatchObject({
        ok: true,
        api_key: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),
        ingest_url: `${ENDPOINT}/v1/ingest`,
        agent_id: e.agentId,
        allowed_agents: expect.any(Number),
        entitlement_signed: { alg: "ed25519", key_id: "test-key-1", sig_b64: expect.any(String) },
      });
      const state = core.applyIngestResult({}, { ok: true, status: 200, body: e.enrollBody }, 72, {
        authToken: e.apiKey,
        publicKeysPem: [publicKeyPem],
      });
      expect(state.entitlement_alg).toBe("ed25519");
      expect(state.entitlement).toMatchObject({ schema_version: 2, tenant_id: "tenant_enroll_1" });
    });

    it("is idempotent for a retried enrollment token (lost response) and returns the same credential", async () => {
      const e = await enrollDevice("tenant_enroll_2");
      const retry = await clientFor(e.enrollmentToken).enroll({ iid: e.iid });
      expect(retry.ok).toBe(true);
      expect(retry.body?.api_key).toBe(e.apiKey);
      // ...and the poll keeps handing the token back so a lost enroll response is recoverable.
      const poll = await clientFor("").devicePoll({ device_code: e.deviceCode });
      expect(poll.body?.enrollment_token).toBe(e.enrollmentToken);
    });

    it("refuses an unknown token, a missing token, and a token redeemed from another installation", async () => {
      const e = await enrollDevice("tenant_enroll_3");
      expect(await clientFor("aidr_enroll_" + "0".repeat(40)).enroll({ iid: e.iid })).toMatchObject({
        ok: false,
        status: 401,
        error: "invalid_enrollment_token",
      });
      expect((await fetch(`${ENDPOINT}/v1/enroll`, { method: "POST", body: "{}" })).status).toBe(401);
      expect(await clientFor(e.enrollmentToken).enroll({ iid: "some-other-machine" })).toMatchObject({
        ok: false,
        status: 403,
        error: "agent_key_mismatch",
      });
    });

    it("refuses to enroll once the device code has expired", async () => {
      const anon = clientFor("");
      const iid = "iid-enroll-exp";
      const started = (await anon.deviceStart({ iid })).body as Record<string, string>;
      await approve("tenant_enroll_4", started.user_code);
      const token = String((await anon.devicePoll({ device_code: started.device_code })).body?.enrollment_token);
      db.seed(`device_codes/${started.device_code}`, {
        ...db.peek(`device_codes/${started.device_code}`)!,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      expect(await clientFor(token).enroll({ iid })).toMatchObject({ ok: false, status: 401, error: "device_code_expired" });
    });

    it("redeems a dashboard-minted enrollment token exactly once, bound to the installation", async () => {
      const uid = "tenant_enroll_dash";
      const plain = `aidr_enroll_${randomBytes(20).toString("hex")}`;
      const { createHash } = await import("node:crypto");
      db.seed(`users/${uid}/enrollment_tokens/tok1`, {
        token_hash: createHash("sha256").update(plain).digest("hex"),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        consumed_at: null,
      });
      expect(await clientFor(plain).enroll({ iid: "" as unknown as string })).toMatchObject({ ok: false });
      const ok = await clientFor(plain).enroll({ iid: "iid-dashboard-token" });
      expect(ok).toMatchObject({ ok: true, body: { agent_id: expect.stringMatching(/^aidr_ag_/) } });
      expect(db.peek(`users/${uid}/seat_usage/current`)).toMatchObject({ current_agents: 1 });
      expect(await clientFor(plain).enroll({ iid: "iid-dashboard-token" })).toMatchObject({
        ok: false,
        status: 401,
      });
      // The credential works for ingest.
      const key = String(ok.body?.api_key);
      const sent = await clientFor(key).ingest({ iid: "iid-dashboard-token", events: [event()] });
      expect(sent.ok).toBe(true);
    });

    it("enforces the tenant seat limit for dashboard tokens (402 agent_limit_exceeded)", async () => {
      const uid = "tenant_enroll_seats";
      const plain = `aidr_enroll_${randomBytes(20).toString("hex")}`;
      const { createHash } = await import("node:crypto");
      db.seed(`users/${uid}/seat_usage/current`, { allowed_agents: 1, current_agents: 1 });
      db.seed(`users/${uid}/enrollment_tokens/tok1`, {
        token_hash: createHash("sha256").update(plain).digest("hex"),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        consumed_at: null,
      });
      const res = await clientFor(plain).enroll({ iid: "iid-seat" });
      expect(res).toMatchObject({ ok: false, status: 402, error: "agent_limit_exceeded" });
      expect(res.body).toMatchObject({ allowed_agents: 1, current_agents: 1 });
    });
  });

  // ── 4. ingest ──────────────────────────────────────────────────────────────
  describe("ingest", () => {
    it("delivers a batch through the real durable queue: events stored, ids acknowledged, entitlement refreshed", async () => {
      const e = await enrollDevice("tenant_ingest_1");
      const client = clientFor(e.apiKey, configInput(), join(home, "queue-ingest-1"));
      const events = [event("evt-ok-1"), event("evt-ok-2", { verdict: "allow", severity: "info" })];
      const result = await client.ingest({ iid: e.iid, agent_runtime: "claude-code", events });
      expect(result.ok).toBe(true);
      expect(result.body?.acknowledged_event_ids).toEqual(expect.arrayContaining(["evt-ok-1", "evt-ok-2"]));
      expect(result.body?.telemetry_queue).toMatchObject({ deliveryState: "available" });
      const stored = db.peek(`users/${e.uid}/events/evt-ok-1`)!;
      expect(stored).toMatchObject({ agent_id: e.agentId, verdict: "deny", severity: "critical" });
      expect(db.peek(`users/${e.uid}/agents/${e.agentId}`)).toMatchObject({ status: "connected" });
      // The connector can refresh its signed entitlement from the ingest response.
      const state = core.applyIngestResult({}, result, 72, { authToken: e.apiKey, publicKeysPem: [publicKeyPem] });
      expect(state.entitlement_alg).toBe("ed25519");
    });

    it("heartbeat (no events) succeeds and returns the entitlement", async () => {
      const e = await enrollDevice("tenant_ingest_2");
      const result = await clientFor(e.apiKey, configInput(), join(home, "queue-ingest-2")).ingest({
        iid: e.iid,
        events: [],
      });
      expect(result.ok).toBe(true);
      expect(result.body?.entitlement_signed).toBeTruthy();
    });

    it("rejects a tampered token (bad signature, bad payload, wrong secret) and stores nothing", async () => {
      const e = await enrollDevice("tenant_ingest_3");
      const [h, p, s] = e.apiKey.split(".");
      const flipped = `${h}.${p}.${s!.slice(0, -2)}${s!.endsWith("AA") ? "BB" : "AA"}`;
      const payload = JSON.parse(Buffer.from(p!, "base64url").toString());
      const forged = `${h}.${Buffer.from(JSON.stringify({ ...payload, uid: "tenant_ingest_victim" })).toString("base64url")}.${s}`;
      for (const token of [flipped, forged, "not-a-token", `${h}.${p}`]) {
        const res = await rawPost("ingest", { iid: e.iid, events: [event("evt-tamper")] }, token);
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: "invalid_api_key" });
      }
      const viaClient = await clientFor(flipped, configInput(), join(home, "queue-ingest-3")).ingest({
        iid: e.iid,
        events: [event("evt-tamper-2")],
      });
      expect(viaClient).toMatchObject({ ok: false, status: 401, error: "invalid_api_key" });
      expect(db.peek(`users/tenant_ingest_victim/events/evt-tamper`)).toBeUndefined();
      expect(db.peek(`users/${e.uid}/events/evt-tamper`)).toBeUndefined();
      expect((await rawPost("ingest", { events: [] }, "")).status).toBe(401);
    });

    it("a rejected credential invalidates the connector's cached grant (invalid_api_key contract)", async () => {
      const e = await enrollDevice("tenant_ingest_4");
      const state = core.applyIngestResult(
        { api_key: e.apiKey, entitlement_alg: "ed25519" },
        { ok: false, status: 401, error: "invalid_api_key", body: { error: "invalid_api_key" } },
        72,
        { authToken: e.apiKey },
      );
      expect(state.api_key).toBeUndefined();
      expect(state.sync_disabled_reason).toBe("invalid_api_key");
    });

    it("treats an identical replay as idempotent and re-acknowledges the ids", async () => {
      const e = await enrollDevice("tenant_ingest_5");
      const body = { iid: e.iid, request_id: "req-replay-1", events: [event("evt-replay-1")] };
      const first = await rawPost("ingest", body, e.apiKey);
      expect(await first.json()).toMatchObject({ ok: true, accepted: 1, acknowledged_event_ids: ["evt-replay-1"] });
      const second = await rawPost("ingest", body, e.apiKey);
      expect(second.status).toBe(200);
      expect(await second.json()).toMatchObject({
        ok: true,
        accepted: 0,
        duplicate: true,
        acknowledged_event_ids: ["evt-replay-1"],
      });
      const stored = [...db.docs.keys()].filter((p) => p.startsWith(`users/${e.uid}/events/`));
      expect(stored).toEqual([`users/${e.uid}/events/evt-replay-1`]);
    });

    it("rejects a request id reused with different content (tampered replay) with 409", async () => {
      const e = await enrollDevice("tenant_ingest_6");
      await rawPost("ingest", { iid: e.iid, request_id: "req-conflict", events: [event("evt-c1")] }, e.apiKey);
      const tampered = await rawPost(
        "ingest",
        { iid: e.iid, request_id: "req-conflict", events: [event("evt-c1", { verdict: "allow", severity: "info" })] },
        e.apiKey,
      );
      expect(tampered.status).toBe(409);
      expect(await tampered.json()).toEqual({ error: "ingest_idempotency_conflict" });
      expect(db.peek(`users/${e.uid}/events/evt-c1`)).toMatchObject({ verdict: "deny" });
    });

    it("enforces size limits: batch count, per-event bytes, body bytes, malformed events", async () => {
      const e = await enrollDevice("tenant_ingest_7");
      const tooMany = Array.from({ length: 201 }, (_, i) => event(`evt-many-${i}`));
      const r1 = await rawPost("ingest", { iid: e.iid, events: tooMany }, e.apiKey);
      expect(r1.status).toBe(413);
      expect(await r1.json()).toEqual({ error: "events_batch_too_large" });

      const r2 = await rawPost("ingest", { iid: e.iid, events: [event("evt-big", { blob: "x".repeat(300_000) })] }, e.apiKey);
      expect(r2.status).toBe(413);
      expect(await r2.json()).toEqual({ error: "events_batch_too_large" });

      const r3 = await rawPost("ingest", JSON.stringify({ iid: e.iid, events: [], pad: "x".repeat(5 * 1024 * 1024 + 10) }), e.apiKey);
      expect(r3.status).toBe(413);
      expect(await r3.json()).toEqual({ error: "payload_too_large" });

      for (const [events, code] of [
        [[{ type: "runtime_verdict" }], "missing_event_id"],
        [["not-an-object"], "invalid_event"],
        [[event("dup"), event("dup")], "invalid_event"],
        [[event("bad id with spaces")], "invalid_event"],
      ] as const) {
        const r = await rawPost("ingest", { iid: e.iid, events }, e.apiKey);
        expect(r.status).toBe(400);
        expect(await r.json()).toEqual({ error: code });
      }
      expect((await rawPost("ingest", "{not json", e.apiKey)).status).toBe(400);
      expect((await rawPost("ingest", { events: [event("evt-no-iid")] }, e.apiKey)).status).toBe(400);
      expect([...db.docs.keys()].filter((p) => p.startsWith(`users/${e.uid}/events/`))).toEqual([]);
    });

    it("keeps oversized batches out of the connector's retry loop (non-retryable status mapping)", async () => {
      const e = await enrollDevice("tenant_ingest_8");
      const res = await rawPost("ingest", { iid: e.iid, events: Array.from({ length: 201 }, (_, i) => event(`e${i}`)) }, e.apiKey);
      // 413 is a client error: not in the connector's {408,429,5xx} retry set.
      expect([408, 429].includes(res.status) || res.status >= 500).toBe(false);
    });

    it("isolates tenants: body-supplied tenant/agent fields cannot redirect writes", async () => {
      const a = await enrollDevice("tenant_iso_a");
      const b = await enrollDevice("tenant_iso_b");
      const sent = await rawPost(
        "ingest",
        {
          iid: a.iid,
          uid: b.uid,
          tenant_id: b.uid,
          agent_id: b.agentId,
          events: [event("evt-iso-1", { uid: b.uid, agent_id: b.agentId, tenant_id: b.uid })],
        },
        a.apiKey,
      );
      expect(sent.status).toBe(200);
      expect(db.peek(`users/${a.uid}/events/evt-iso-1`)).toMatchObject({ agent_id: a.agentId });
      expect(db.peek(`users/${b.uid}/events/evt-iso-1`)).toBeUndefined();
      expect([...db.docs.keys()].filter((p) => p.startsWith(`users/${b.uid}/events/`))).toEqual([]);
    });

    it("namespaces idempotency by tenant+agent: another tenant cannot collide with or probe a request id", async () => {
      const a = await enrollDevice("tenant_idem_a");
      const b = await enrollDevice("tenant_idem_b");
      expect((await rawPost("ingest", { iid: a.iid, request_id: "shared-req", events: [event("evt-idem-a")] }, a.apiKey)).status).toBe(200);
      const other = await rawPost("ingest", { iid: b.iid, request_id: "shared-req", events: [event("evt-idem-b")] }, b.apiKey);
      expect(other.status).toBe(200);
      expect(await other.json()).toMatchObject({ accepted: 1, acknowledged_event_ids: ["evt-idem-b"] });
      expect(db.peek(`users/${b.uid}/events/evt-idem-b`)).toBeDefined();
    });

    it("does not let one agent overwrite another agent's event id within a tenant", async () => {
      const uid = "tenant_peers";
      const a = await enrollDevice(uid);
      const b = await enrollDevice(uid);
      await rawPost("ingest", { iid: a.iid, events: [event("evt-peer", { note: "original" })] }, a.apiKey);
      const clash = await rawPost("ingest", { iid: b.iid, events: [event("evt-peer", { note: "forged" })] }, b.apiKey);
      expect(clash.status).toBe(409);
      expect(await clash.json()).toEqual({ error: "event_id_conflict" });
      expect(db.peek(`users/${uid}/events/evt-peer`)).toMatchObject({ agent_id: a.agentId });
    });

    it("binds the token to its installation (agent_key_mismatch -> connector clears the grant)", async () => {
      const e = await enrollDevice("tenant_bind_1");
      const res = await rawPost("ingest", { iid: "another-machine", events: [] }, e.apiKey);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "agent_key_mismatch" });
      const state = core.applyIngestResult(
        { api_key: e.apiKey, entitlement_alg: "ed25519" },
        { ok: false, status: 403, error: "agent_key_mismatch", body: { error: "agent_key_mismatch" } },
        72,
        { authToken: e.apiKey },
      );
      expect(state.entitlement).toBeUndefined();
      expect(state.sync_disabled_reason).toBe("agent_key_mismatch");
    });

    it("reports transient backend failures as retryable 503 without leaking internals", async () => {
      const e = await enrollDevice("tenant_transient");
      const original = db.collection.bind(db);
      let failures = 1;
      (db as unknown as { collection: unknown }).collection = (path: string) => {
        if (failures > 0 && path === "control_plane_rate_limits") {
          failures -= 1;
          throw new Error("secret firestore detail: project-xyz DEADLINE_EXCEEDED");
        }
        return original(path);
      };
      try {
        const res = await rawPost("ingest", { iid: e.iid, events: [event("evt-transient")] }, e.apiKey);
        expect(res.status).toBe(503);
        const text = await res.text();
        expect(text).toBe(JSON.stringify({ error: "control_plane_unavailable" }));
      } finally {
        (db as unknown as { collection: unknown }).collection = original;
      }
    });
  });

  // ── 5. revoked / deleted devices ───────────────────────────────────────────
  describe("revoked devices", () => {
    it.each(["deleted", "paused"])("a %s agent is refused on ingest, policy and revocations (token still validly signed)", async (status) => {
      const e = await enrollDevice(`tenant_revoke_${status}`);
      db.seed(`users/${e.uid}/settings/current`, { runtime_policy: { command_default: "deny" }, updated_at: "2026-01-01T00:00:00.000Z" });
      expect((await rawPost("ingest", { iid: e.iid, events: [event(`evt-before-${status}`)] }, e.apiKey)).status).toBe(200);
      expect((await rawGet("policy", e.apiKey)).status).toBe(200);

      // Dashboard "agent-update" semantics.
      await db.doc(`users/${e.uid}/agents/${e.agentId}`).update({ status, ...(status === "deleted" ? { deleted_at: "now" } : {}) });

      const viaClient = await clientFor(e.apiKey, configInput(), join(home, `queue-revoke-${status}`)).ingest({
        iid: e.iid,
        events: [event(`evt-after-${status}`)],
      });
      expect(viaClient).toMatchObject({ ok: false, status: 403, error: "agent_not_authorized" });
      expect(db.peek(`users/${e.uid}/events/evt-after-${status}`)).toBeUndefined();
      for (const op of ["policy", "revocations"]) {
        const res = await rawGet(op, e.apiKey);
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "agent_not_authorized" });
      }
      // A rejected agent must not be resurrected by its own telemetry.
      expect(db.peek(`users/${e.uid}/agents/${e.agentId}`)).toMatchObject({ status });
      // ...and cannot re-enroll with its old enrollment token either.
      expect(await clientFor(e.enrollmentToken).enroll({ iid: e.iid })).toMatchObject({ ok: false, status: 403, error: "agent_not_authorized" });
      // Client side: 403 agent_not_authorized is not retried as a transient fault.
      expect(viaClient.status! >= 500 || viaClient.status === 429 || viaClient.status === 408).toBe(false);
    });

    it("a token for an agent that never existed in the tenant is refused", async () => {
      const { mintAgentAccessToken } = await import("../agent-token");
      const ghost = mintAgentAccessToken({ uid: "tenant_ghost", agent_id: "aidr_ag_ghost" }).token;
      const res = await rawPost("ingest", { events: [] }, ghost);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "agent_not_authorized" });
    });

    it("an expired token is refused as invalid_api_key", async () => {
      const e = await enrollDevice("tenant_expired_token");
      const { mintAgentAccessToken } = await import("../agent-token");
      const old = mintAgentAccessToken({
        uid: e.uid,
        agent_id: e.agentId,
        now: new Date(Date.now() - 8 * 24 * 3600 * 1000),
      }).token;
      const res = await rawPost("ingest", { events: [] }, old);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "invalid_api_key" });
    });
  });

  // ── 6. policy ──────────────────────────────────────────────────────────────
  describe("policy fetch + digest verification", () => {
    const published = {
      command_default: "deny",
      file_default: "ask",
      url_default: "allow",
      package_default: "ask",
      output_default: "allow",
      mcp_unknown: "ask",
      mcp_risky: "deny",
      mcp_allow_servers: ["github"],
      mcp_require_approval_servers: ["filesystem"],
      mcp_deny_servers: ["shell-wrapper"],
    };

    beforeEach(() => core.clearRemoteRuntimePolicyCacheForTests(join(aidrDir, "remote-policy-cache.json")));

    it("serves nothing for a tenant that never published (instead of default 'ask everything')", async () => {
      const e = await enrollDevice("tenant_policy_none");
      const res = await core.ControlPlaneClient.prototype.fetchRuntimePolicy.call(clientFor(e.apiKey));
      expect(res).toMatchObject({ ok: false, status: 404, error: "policy_not_published" });
      const config = core.ConfigSchema.parse(configInput());
      const synced = await core.syncRemoteRuntimePolicy(config, e.apiKey);
      expect(synced.policy.enabled).toBe(false);
      // A tenant that requires central policy fails closed instead.
      const required = core.ConfigSchema.parse(
        configInput({ control_plane: { endpoint: ENDPOINT, timeout_seconds: 5, remote_policy_required: true, remote_policy_cache_path: join(aidrDir, "remote-policy-cache.json") } }),
      );
      await expect(core.syncRemoteRuntimePolicy(required, e.apiKey)).rejects.toThrow(/central policy is unavailable/);
    });

    it("delivers a published policy whose digest the connector recomputes and applies to its config", async () => {
      const e = await enrollDevice("tenant_policy_1");
      db.seed(`users/${e.uid}/settings/current`, {
        runtime_policy: { ...published, mcp_allow_servers: ["GitHub", "github"] },
        runtime_policy_version: "pol_20260506101000",
        updated_at: "2026-05-06T10:10:00.000Z",
      });
      const fetched = await clientFor(e.apiKey).fetchRuntimePolicy();
      expect(fetched.body).toMatchObject({
        ok: true,
        policy_version: "pol_20260506101000",
        policy_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        runtime_policy: published,
        cache_seconds: 60,
      });
      const config = core.ConfigSchema.parse(configInput());
      const synced = await core.syncRemoteRuntimePolicy(config, e.apiKey);
      expect(synced.policy.enabled).toBe(true);
      expect(synced.policy.runtime_defaults).toMatchObject({ command_action: "block", url_action: "allow", file_action: "require_approval" });
      expect(synced.policy.mcp).toMatchObject({
        allow_servers: ["github"],
        require_approval_servers: ["filesystem"],
        deny_servers: ["shell-wrapper"],
        unknown_server_action: "require_approval",
        risky_server_action: "block",
      });
    });

    it("works in required mode (version label is opaque) and persists a verified offline cache", async () => {
      const e = await enrollDevice("tenant_policy_2");
      db.seed(`users/${e.uid}/settings/current`, { runtime_policy: published, runtime_policy_version: "pol_20260506101000", runtime_policy_published_at: "2026-05-06T10:10:00.000Z" });
      const cachePath = join(aidrDir, "remote-policy-cache.json");
      const required = core.ConfigSchema.parse(
        configInput({ control_plane: { endpoint: ENDPOINT, timeout_seconds: 5, remote_policy_required: true, remote_policy_cache_path: cachePath } }),
      );
      const synced = await core.syncRemoteRuntimePolicy(required, e.apiKey);
      expect(synced.policy.runtime_defaults).toMatchObject({ command_action: "block" });
      const cache = JSON.parse(readFileSync(cachePath, "utf8"));
      expect(cache).toMatchObject({ policy_version: "pol_20260506101000", key_hash: expect.any(String) });
    });

    it("rejects a policy tampered in transit (digest mismatch) and a digest swapped for another policy", async () => {
      const e = await enrollDevice("tenant_policy_3");
      db.seed(`users/${e.uid}/settings/current`, { runtime_policy: published, runtime_policy_version: "pol_1", runtime_policy_published_at: "2026-05-06T10:10:00.000Z" });
      const required = core.ConfigSchema.parse(
        configInput({ control_plane: { endpoint: ENDPOINT, timeout_seconds: 5, remote_policy_required: true, remote_policy_cache_path: join(aidrDir, "remote-policy-cache.json") } }),
      );
      interceptResponse = async (op, response) => {
        if (op !== "policy") return response;
        const body = (await response.json()) as Record<string, unknown>;
        // Attacker (or a broken proxy) loosens the policy but cannot recompute the digest.
        body.runtime_policy = { ...(body.runtime_policy as object), command_default: "allow" };
        return new Response(JSON.stringify(body), { status: 200 });
      };
      await expect(core.syncRemoteRuntimePolicy(required, e.apiKey)).rejects.toThrow(/central policy is unavailable/);
      // Non-required mode: the tampered policy is ignored, not applied.
      core.clearRemoteRuntimePolicyCacheForTests(join(aidrDir, "remote-policy-cache.json"));
      const optional = await core.syncRemoteRuntimePolicy(core.ConfigSchema.parse(configInput()), e.apiKey);
      expect(optional.policy.enabled).toBe(false);
    });

    it("never serves another tenant's policy: tenant comes from the token only", async () => {
      const a = await enrollDevice("tenant_policy_a");
      const b = await enrollDevice("tenant_policy_b");
      db.seed(`users/${a.uid}/settings/current`, { runtime_policy: { ...published, command_default: "deny" }, runtime_policy_version: "pol_a", runtime_policy_published_at: "2026-05-06T10:10:00.000Z" });
      db.seed(`users/${b.uid}/settings/current`, { runtime_policy: { ...published, command_default: "allow" }, runtime_policy_version: "pol_b", runtime_policy_published_at: "2026-05-06T10:10:00.000Z" });
      const fetched = async (key: string) =>
        (await (await fetch(`${ENDPOINT}/v1/policy?uid=${a.uid}&tenant=${a.uid}`, { headers: { authorization: `Bearer ${key}`, "x-tenant-id": a.uid } })).json()) as Record<string, any>;
      expect((await fetched(b.apiKey)).runtime_policy.command_default).toBe("allow");
      expect((await fetched(a.apiKey)).runtime_policy.command_default).toBe("deny");
      expect((await fetched(b.apiKey)).agent_id).toBe(b.agentId);
    });

    describe("Ed25519 policy signature", () => {
      const POLICY_ENV = ["AIDR_POLICY_SIGNING_KEY_ID", "AIDR_POLICY_SIGNING_PRIVATE_KEY_PKCS8_B64", "AIDR_ENTITLEMENT_SIGNING_KEY_ID", "AIDR_ENTITLEMENT_SIGNING_PRIVATE_KEY_PKCS8_B64"] as const;
      const saved: Partial<Record<(typeof POLICY_ENV)[number], string | undefined>> = {};
      let cacheN = 0;
      let policyPublicPem: string;
      let wrongPublicPem: string;

      beforeAll(() => {
        const pair = generateKeyPairSync("ed25519");
        policyPublicPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
        wrongPublicPem = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
        for (const k of POLICY_ENV) saved[k] = process.env[k];
        process.env.AIDR_POLICY_SIGNING_KEY_ID = "policy-key-1";
        process.env.AIDR_POLICY_SIGNING_PRIVATE_KEY_PKCS8_B64 = pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
      });
      afterAll(() => {
        for (const k of POLICY_ENV) {
          if (saved[k] === undefined) delete process.env[k];
          else process.env[k] = saved[k];
        }
      });

      const publish = (uid: string, publishedAt: string, extra: Record<string, unknown> = {}) =>
        db.seed(`users/${uid}/settings/current`, {
          runtime_policy: published,
          runtime_policy_version: "pol_20260506101000",
          runtime_policy_published_at: publishedAt,
          ...extra,
        });
      const connectorConfig = (policyKeys: string[], required = true) => {
        const cachePath = join(aidrDir, `signed-policy-cache-${++cacheN}.json`);
        return core.ConfigSchema.parse(
          configInput({
            control_plane: { endpoint: ENDPOINT, timeout_seconds: 5, remote_policy_required: required, remote_policy_cache_path: cachePath, policy_public_keys_pem: policyKeys },
          }),
        );
      };

      it("delivers key_id, algorithm, signature, version, sequence and validity that the connector verifies with the policy key", async () => {
        const e = await enrollDevice("tenant_sig_1");
        publish(e.uid, "2026-05-06T10:10:00.000Z");
        const fetched = await clientFor(e.apiKey).fetchRuntimePolicy();
        const signed = (fetched.body as Record<string, any>).policy_signed;
        expect(signed).toMatchObject({
          alg: "ed25519",
          key_id: "policy-key-1",
          sig_b64: expect.any(String),
          envelope: {
            schema_version: 1,
            key_id: "policy-key-1",
            policy_version: "pol_20260506101000",
            policy_sha256: (fetched.body as Record<string, unknown>).policy_sha256,
            sequence: Date.parse("2026-05-06T10:10:00.000Z"),
            tenant_id: e.uid,
          },
        });
        expect(Date.parse(signed.envelope.expires_at) - Date.parse(signed.envelope.issued_at)).toBe(24 * 3_600_000);
        // Policy key (not the entitlement key) verifies it.
        const synced = await core.syncRemoteRuntimePolicy(connectorConfig([policyPublicPem]), e.apiKey);
        expect(synced.policy.runtime_defaults).toMatchObject({ command_action: "block" });
      });

      it("a connector trusting a different key refuses the policy (required mode fails closed, optional ignores it)", async () => {
        const e = await enrollDevice("tenant_sig_2");
        publish(e.uid, "2026-05-06T10:10:00.000Z");
        await expect(core.syncRemoteRuntimePolicy(connectorConfig([wrongPublicPem]), e.apiKey)).rejects.toThrow(/central policy is unavailable/);
        const optional = await core.syncRemoteRuntimePolicy(connectorConfig([wrongPublicPem], false), e.apiKey);
        expect(optional.policy.enabled).toBe(false);
      });

      it("rejects an unsigned policy when the connector holds policy keys", async () => {
        const e = await enrollDevice("tenant_sig_3");
        publish(e.uid, "2026-05-06T10:10:00.000Z");
        interceptResponse = async (op, response) => {
          if (op !== "policy") return response;
          const body = (await response.json()) as Record<string, unknown>;
          delete body.policy_signed;
          return new Response(JSON.stringify(body), { status: 200 });
        };
        await expect(core.syncRemoteRuntimePolicy(connectorConfig([policyPublicPem]), e.apiKey)).rejects.toThrow(/central policy is unavailable/);
      });

      it("rejects a policy whose body is tampered after signing, even with the digest recomputed", async () => {
        const e = await enrollDevice("tenant_sig_4");
        publish(e.uid, "2026-05-06T10:10:00.000Z");
        const { runtimePolicySha256 } = await import("../policy");
        interceptResponse = async (op, response) => {
          if (op !== "policy") return response;
          const body = (await response.json()) as Record<string, any>;
          body.runtime_policy = { ...body.runtime_policy, command_default: "allow" };
          body.policy_sha256 = runtimePolicySha256(body.runtime_policy);
          return new Response(JSON.stringify(body), { status: 200 });
        };
        await expect(core.syncRemoteRuntimePolicy(connectorConfig([policyPublicPem]), e.apiKey)).rejects.toThrow(/central policy is unavailable/);
      });

      it("rejects a replayed older signed policy after a newer one was applied", async () => {
        const e = await enrollDevice("tenant_sig_5");
        publish(e.uid, "2026-05-06T10:10:00.000Z");
        const config = connectorConfig([policyPublicPem]);
        let captured: string | null = null;
        interceptResponse = async (op, response) => {
          if (op === "policy") captured = await response.clone().text();
          return response;
        };
        await core.syncRemoteRuntimePolicy(config, e.apiKey);
        const older = captured as unknown as string;
        // Operator publishes a stricter policy later.
        publish(e.uid, "2026-05-06T11:00:00.000Z", { runtime_policy: { ...published, command_default: "ask" }, runtime_policy_version: "pol_20260506110000" });
        interceptResponse = null;
        core.clearRemoteRuntimePolicyCacheForTests();
        const later = Date.now() + 120_000;
        expect((await core.syncRemoteRuntimePolicy(config, e.apiKey, undefined, later)).policy.runtime_defaults.command_action).toBe("require_approval");
        // Attacker replays the old, validly signed, still-unexpired response.
        interceptResponse = async (op, response) => (op === "policy" ? new Response(older, { status: 200 }) : response);
        core.clearRemoteRuntimePolicyCacheForTests();
        await expect(core.syncRemoteRuntimePolicy(config, e.apiKey, undefined, later + 120_000)).rejects.toThrow(/central policy is unavailable/);
      });

      it("rejects a signed policy once its validity window has passed", async () => {
        const e = await enrollDevice("tenant_sig_6");
        publish(e.uid, "2026-05-06T10:10:00.000Z");
        const farFuture = Date.now() + 3 * 24 * 3_600_000;
        await expect(core.syncRemoteRuntimePolicy(connectorConfig([policyPublicPem]), e.apiKey, undefined, farFuture)).rejects.toThrow(/central policy is unavailable/);
      });

      it("falls back to the entitlement key (licensing.public_keys_pem) when no policy key is provisioned", async () => {
        const e = await enrollDevice("tenant_sig_7");
        publish(e.uid, "2026-05-06T10:10:00.000Z");
        const keepId = process.env.AIDR_POLICY_SIGNING_KEY_ID;
        const keepKey = process.env.AIDR_POLICY_SIGNING_PRIVATE_KEY_PKCS8_B64;
        delete process.env.AIDR_POLICY_SIGNING_KEY_ID;
        delete process.env.AIDR_POLICY_SIGNING_PRIVATE_KEY_PKCS8_B64;
        try {
          const fetched = await clientFor(e.apiKey).fetchRuntimePolicy();
          expect((fetched.body as Record<string, any>).policy_signed.key_id).toBe("test-key-1");
          const synced = await core.syncRemoteRuntimePolicy(connectorConfig([]), e.apiKey);
          expect(synced.policy.runtime_defaults).toMatchObject({ command_action: "block" });
        } finally {
          process.env.AIDR_POLICY_SIGNING_KEY_ID = keepId;
          process.env.AIDR_POLICY_SIGNING_PRIVATE_KEY_PKCS8_B64 = keepKey;
        }
      });

      it("a half-provisioned policy key fails closed with 503 instead of serving an unsigned policy", async () => {
        const e = await enrollDevice("tenant_sig_8");
        publish(e.uid, "2026-05-06T10:10:00.000Z");
        const keep = process.env.AIDR_POLICY_SIGNING_KEY_ID;
        delete process.env.AIDR_POLICY_SIGNING_KEY_ID;
        try {
          expect(await clientFor(e.apiKey).fetchRuntimePolicy()).toMatchObject({ ok: false, status: 503, error: "policy_signing_unavailable" });
        } finally {
          process.env.AIDR_POLICY_SIGNING_KEY_ID = keep;
        }
      });
    });

    it("computes policy_sha256 with the connector's canonical form for every policy shape", async () => {
      const { runtimePolicySha256 } = await import("../policy");
      const { createHash } = await import("node:crypto");
      // Keys that sort differently under localeCompare vs code-unit order.
      const tricky = { mcp_deny_servers: [], mcp_allow_servers: ["a"], command_default: "ask", mcp_require_approval_servers: [] };
      const expected = createHash("sha256")
        .update(JSON.stringify({ command_default: "ask", mcp_allow_servers: ["a"], mcp_deny_servers: [], mcp_require_approval_servers: [] }))
        .digest("hex");
      expect(runtimePolicySha256(tricky)).toBe(expected);
    });
  });

  // ── 7. entitlement verification ────────────────────────────────────────────
  describe("entitlement verification", () => {
    it("derives seats and modules from tenant records and signs them", async () => {
      const uid = "tenant_ent_1";
      db.seed(`users/${uid}/seat_usage/current`, { included_agents: 1, extra_agents: 4, allowed_agents: 5 });
      db.seed(`users/${uid}/entitlements/current`, { premium_intel: true, revocation_epoch: 3 });
      const e = await enrollDevice(uid);
      const state = core.applyIngestResult({}, { ok: true, status: 200, body: e.enrollBody }, 72, {
        authToken: e.apiKey,
        publicKeysPem: [publicKeyPem],
      });
      expect(state.entitlement).toMatchObject({
        schema_version: 2,
        tenant_id: uid,
        subscription_tier: "pro",
        included_agents: 1,
        extra_agents: 4,
        allowed_agents: 5,
        premium_modules: ["premium_intel"],
        revocation_epoch: 3,
      });
      expect(core.isPremiumUnlocked(state)).toBe(true);
    });

    it("rejects a tampered snapshot, a wrong-key signature, and an unsigned entitlement", async () => {
      const e = await enrollDevice("tenant_ent_2");
      const signed = e.enrollBody.entitlement_signed as { snapshot: Record<string, unknown>; sig_b64: string };
      const apply = (body: Record<string, unknown>, keys = [publicKeyPem]) =>
        core.applyIngestResult({}, { ok: true, status: 200, body }, 72, { authToken: e.apiKey, publicKeysPem: keys });

      // Seat count inflated after signing.
      const inflated = apply({
        ...e.enrollBody,
        entitlement_signed: { ...signed, snapshot: { ...signed.snapshot, included_agents: 500, allowed_agents: 500 } },
      });
      expect(inflated.entitlement_alg).not.toBe("ed25519");
      expect(core.isPremiumUnlocked(inflated)).toBe(false);

      // Signature from a different key.
      const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
      expect(apply(e.enrollBody, [other]).entitlement_alg).not.toBe("ed25519");

      // Unsigned.
      const unsigned = { ...e.enrollBody };
      delete unsigned.entitlement_signed;
      expect(apply(unsigned).entitlement_alg).not.toBe("ed25519");
    });

    it("a half-provisioned signing key fails closed with 503 before consuming a one-time enrollment token", async () => {
      const keep = process.env.AIDR_ENTITLEMENT_SIGNING_KEY_ID;
      const anon = clientFor("");
      const iid = "iid-halfkey";
      const started = (await anon.deviceStart({ iid })).body as Record<string, string>;
      await approve("tenant_ent_3", started.user_code);
      const token = String((await anon.devicePoll({ device_code: started.device_code })).body?.enrollment_token);
      delete process.env.AIDR_ENTITLEMENT_SIGNING_KEY_ID;
      try {
        expect(await clientFor(token).enroll({ iid })).toMatchObject({ ok: false, status: 503, error: "entitlement_signing_unavailable" });
      } finally {
        process.env.AIDR_ENTITLEMENT_SIGNING_KEY_ID = keep;
      }
      // The token was not burned: enrolling after the operator fixes the config works.
      expect((await clientFor(token).enroll({ iid })).ok).toBe(true);
    });
  });

  // ── 8. revocations feed ────────────────────────────────────────────────────
  describe("revocations", () => {
    it("serves an Ed25519-signed list the connector verifies, including revoked entitlement serials", async () => {
      const uid = "tenant_rev_1";
      db.seed(`users/${uid}/entitlements/current`, { revoked_serials: ["serial-old"], revocation_epoch: 2 });
      const e = await enrollDevice(uid);
      const res = await clientFor(e.apiKey).fetchRevocations();
      expect(res.ok).toBe(true);
      const mod = await import(/* @vite-ignore */ join(AIDR_CORE_SRC, "managed.ts"));
      const parsed = mod.parseSignedRevocationsFromControlPlaneBody(res.body);
      expect(parsed).toBeTruthy();
      expect(
        mod.verifyEd25519SignedRevocationList({ list: parsed.payload, sig_b64: parsed.sig_b64, public_keys_pem: [publicKeyPem] }),
      ).toBe(true);
      expect(parsed.payload.revocations.entitlement_serials).toEqual(["serial-old"]);
      expect(parsed.payload.revocation_epoch).toBe(2);
      // Tampering with the list invalidates the signature.
      const tampered = { ...parsed.payload, revocations: { ...parsed.payload.revocations, entitlement_serials: [] } };
      expect(
        mod.verifyEd25519SignedRevocationList({ list: tampered, sig_b64: parsed.sig_b64, public_keys_pem: [publicKeyPem] }),
      ).toBe(false);
    });
  });

  // ── 9. /api/v1 mount parity ────────────────────────────────────────────────
  describe("/api/v1 mount speaks the same connector contract", () => {
    it("works end to end when the endpoint is the /api base (controlPlaneUrl -> /api/v1/*)", async () => {
      const config = configInput({ control_plane: { endpoint: `${ENDPOINT}/api`, timeout_seconds: 5 } });
      const anon = clientFor("", config);
      const iid = "iid-api-mount";
      const started = await anon.deviceStart({ iid, agent_runtime: "cursor" });
      expect(started).toMatchObject({ ok: true, body: { user_code: expect.any(String) } });
      const body = started.body as Record<string, string>;
      // iid reached the server (top-level fields, not only body.meta).
      expect((db.peek(`device_codes/${body.device_code}`)!.meta as Record<string, unknown>).iid).toBe(iid);
      await approve("tenant_api_mount", body.user_code);
      const polled = await anon.devicePoll({ device_code: body.device_code });
      expect(polled.body).toMatchObject({ status: "authorized" });
      const enrolled = await clientFor(String(polled.body?.enrollment_token), config).enroll({ iid });
      expect(enrolled.ok).toBe(true);
      const key = String(enrolled.body?.api_key);
      const sent = await clientFor(key, config, join(home, "queue-api-mount")).ingest({ iid, events: [event("evt-api-mount")] });
      expect(sent.ok).toBe(true);
      expect(calls.filter((c) => c.status !== 200)).toEqual([]);
    }, 90_000); // first import of the dashboard catch-all route is slow
  });
});
