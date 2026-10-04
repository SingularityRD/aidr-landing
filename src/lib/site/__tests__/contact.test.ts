import { afterEach, describe, expect, it } from "vitest";
import {
  SlidingWindowLimiter,
  buildDeliveryPayload,
  getContactDestination,
  isSameOrigin,
  validateContact,
} from "../contact";

const valid = {
  name: "Ada Lovelace",
  email: "Ada@Example.com",
  company: "Analytical Engines Ltd",
  topic: "sales",
  message: "We run Claude Code across 40 developers and need an evaluation.",
  consent: true,
};

describe("validateContact", () => {
  it("accepts a complete submission and normalises the email", () => {
    const result = validateContact(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.email).toBe("ada@example.com");
  });

  it("reports every missing field", () => {
    const result = validateContact({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(["company", "consent", "email", "message", "name", "topic"]);
    }
  });

  it("rejects malformed email addresses and header-injection attempts", () => {
    for (const email of ["nope", "a@b", "a b@c.com", "a@b.com\nBcc: x@y.com", "<x>@y.com", "a@b.c"]) {
      const result = validateContact({ ...valid, email });
      expect(result.ok, email).toBe(false);
    }
  });

  it("requires explicit consent and a real topic", () => {
    expect(validateContact({ ...valid, consent: "true" }).ok).toBe(false);
    expect(validateContact({ ...valid, topic: "spam" }).ok).toBe(false);
  });

  it("truncates oversize input and strips control characters", () => {
    const result = validateContact({ ...valid, name: `${"x".repeat(500)}\u0000`, message: `${"m".repeat(9000)}\u0007` });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name.length).toBe(120);
      expect(result.value.message.length).toBe(4000);
      expect(result.value.message).not.toContain("\u0007");
    }
  });

  it("ignores non-object bodies", () => {
    for (const body of [null, undefined, "x", 5, []]) expect(validateContact(body).ok).toBe(false);
  });
});

describe("buildDeliveryPayload", () => {
  it("neutralises chat mention and link syntax in the text field", () => {
    const parsed = validateContact({ ...valid, message: "hello <!channel> <https://evil.example|click> & more" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const payload = buildDeliveryPayload(parsed.value, new Date("2026-10-05T00:00:00Z"));
    expect(payload.text).not.toContain("<!channel>");
    expect(payload.text).toContain("&lt;!channel&gt;");
    expect(payload.text).toContain("&amp; more");
    expect(payload.receivedAt).toBe("2026-10-05T00:00:00.000Z");
    expect(payload.topic).toBe("sales");
  });
});

describe("SlidingWindowLimiter", () => {
  it("blocks after the limit and recovers when the window passes", () => {
    const limiter = new SlidingWindowLimiter(2, 1000);
    expect(limiter.check("ip", 0).ok).toBe(true);
    expect(limiter.check("ip", 100).ok).toBe(true);
    const blocked = limiter.check("ip", 200);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(limiter.check("other", 200).ok).toBe(true);
    expect(limiter.check("ip", 1500).ok).toBe(true);
  });

  it("bounds memory by pruning stale keys", () => {
    const limiter = new SlidingWindowLimiter(1, 10, 3);
    for (let i = 0; i < 10; i += 1) limiter.check(`k${i}`, 0);
    expect(limiter.check("fresh", 1000).ok).toBe(true);
  });
});

describe("isSameOrigin", () => {
  it("accepts the site origin or the request host and rejects others", () => {
    expect(isSameOrigin("https://aidr.example", "aidr.example", "https://aidr.example")).toBe(true);
    expect(isSameOrigin("http://localhost:4567", "localhost:4567", "https://aidr.example")).toBe(true);
    expect(isSameOrigin("https://evil.example", "aidr.example", "https://aidr.example")).toBe(false);
    expect(isSameOrigin(null, "aidr.example", "https://aidr.example")).toBe(false);
    expect(isSameOrigin("not a url", "aidr.example", "https://aidr.example")).toBe(false);
  });
});

describe("getContactDestination", () => {
  const original = { url: process.env.CONTACT_WEBHOOK_URL, env: process.env.NODE_ENV };
  afterEach(() => {
    if (original.url === undefined) delete process.env.CONTACT_WEBHOOK_URL;
    else process.env.CONTACT_WEBHOOK_URL = original.url;
    (process.env as Record<string, string | undefined>).NODE_ENV = original.env;
  });

  it("is null when unset, malformed or not https", () => {
    delete process.env.CONTACT_WEBHOOK_URL;
    expect(getContactDestination()).toBeNull();
    process.env.CONTACT_WEBHOOK_URL = "not a url";
    expect(getContactDestination()).toBeNull();
    process.env.CONTACT_WEBHOOK_URL = "http://hooks.example/x";
    expect(getContactDestination()).toBeNull();
  });

  it("accepts https destinations", () => {
    process.env.CONTACT_WEBHOOK_URL = "https://hooks.example/services/T000/B000/XXXX";
    expect(getContactDestination()).toBe("https://hooks.example/services/T000/B000/XXXX");
  });
});
