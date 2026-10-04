import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The shared (Firestore) limiter is exercised elsewhere; keep this suite hermetic.
vi.mock("@/lib/firebase/admin", () => ({ firebaseAdminEnvError: "not configured in tests", adminDb: {}, adminAuth: {} }));
vi.mock("@/lib/control-plane/request-guard", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const ORIGIN = "https://aidr.example";

function body(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    company: "Analytical Engines",
    topic: "sales",
    message: "We would like to evaluate AIDR for forty developers.",
    consent: true,
    website: "",
    startedAt: Date.now() - 60_000,
    ...overrides,
  };
}

function request(payload: unknown, headers: Record<string, string> = {}, raw?: string) {
  return new Request(`${ORIGIN}/api/contact`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      host: "aidr.example",
      "x-real-ip": "203.0.113.7",
      ...headers,
    },
    body: raw ?? JSON.stringify(payload),
  });
}

describe("POST /api/contact", () => {
  const fetchMock = vi.fn();
  let POST: (req: Request) => Promise<Response>;
  let counter = 0;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    process.env.NEXT_PUBLIC_SITE_URL = ORIGIN;
    process.env.CONTACT_WEBHOOK_URL = "https://hooks.example/intake";
    delete process.env.TURNSTILE_SECRET_KEY;
    ({ POST } = await import("../route"));
    counter += 1;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CONTACT_WEBHOOK_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  const unique = () => ({ "x-real-ip": `198.51.100.${counter}` });

  it("delivers a valid submission to the configured destination", async () => {
    const response = await POST(request(body(), unique()));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.example/intake");
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.email).toBe("ada@example.com");
    expect(sent.topic).toBe("sales");
  });

  it("fails closed with 503 when no destination is configured", async () => {
    delete process.env.CONTACT_WEBHOOK_URL;
    const response = await POST(request(body(), unique()));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("contact_unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 when the destination rejects the message", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    const response = await POST(request(body(), unique()));
    expect(response.status).toBe(502);
  });

  it("rejects cross-origin posts", async () => {
    const response = await POST(request(body(), { ...unique(), origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-JSON content and malformed JSON", async () => {
    expect((await POST(request(body(), { ...unique(), "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(request(null, unique(), "{not json"))).status).toBe(400);
    expect((await POST(request(null, unique(), "[1,2]"))).status).toBe(400);
  });

  it("rejects oversized bodies", async () => {
    const response = await POST(request(body({ message: "x".repeat(40_000) }), unique()));
    expect(response.status).toBe(413);
  });

  it("returns field errors for invalid input", async () => {
    const response = await POST(request(body({ email: "nope", consent: false }), unique()));
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.fields.email).toBeTruthy();
    expect(json.fields.consent).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("silently discards honeypot and too-fast submissions without delivering", async () => {
    const honeypot = await POST(request(body({ website: "http://spam.example" }), unique()));
    expect(honeypot.status).toBe(200);
    const fast = await POST(request(body({ startedAt: Date.now() - 100 }), { "x-real-ip": `198.51.101.${counter}` }));
    expect(fast.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rate limits repeated submissions from one client", async () => {
    const headers = { "x-real-ip": "192.0.2.99" };
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await POST(request(body(), headers))).status);
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses.slice(3)).toEqual([429, 429]);
    const limited = await POST(request(body(), headers));
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });

  it("requires a valid bot-challenge token when Turnstile is configured", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const missing = await POST(request(body(), unique()));
    expect(missing.status).toBe(400);

    fetchMock.mockImplementation(async (url: string) =>
      url.includes("turnstile") ? new Response(JSON.stringify({ success: true }), { status: 200 }) : new Response("ok"),
    );
    const ok = await POST(request(body({ turnstileToken: "token" }), { "x-real-ip": `198.51.102.${counter}` }));
    expect(ok.status).toBe(200);
  });

  it("does not accept GET", async () => {
    const { GET } = await import("../route");
    expect(GET().status).toBe(405);
  });
});
