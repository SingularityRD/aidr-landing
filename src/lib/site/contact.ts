/**
 * Contact / sales form: validation, abuse controls and delivery formatting.
 * Pure functions where possible so they can be unit-tested without a server.
 */

export const CONTACT_TOPICS = ["sales", "pilot", "support", "security", "privacy", "legal", "other"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const CONTACT_LIMITS = {
  name: 120,
  email: 254,
  company: 160,
  message: 4000,
  bodyBytes: 16 * 1024,
} as const;

/** Submissions faster than this after the form was rendered are treated as automated. */
export const MIN_FILL_MILLISECONDS = 2500;

export type ContactInput = {
  name: string;
  email: string;
  company: string;
  topic: ContactTopic;
  message: string;
  consent: boolean;
};

export type ContactErrors = Partial<Record<keyof ContactInput, string>>;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS, "").trim().slice(0, max);
}

const EMAIL_PATTERN = /^[^\s@<>"',;:()[\]\\]+@[^\s@<>"',;:()[\]\\]+\.[^\s@<>"',;:()[\]\\]{2,}$/;

export function validateContact(raw: unknown): { ok: true; value: ContactInput } | { ok: false; errors: ContactErrors } {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const value: ContactInput = {
    name: clean(body.name, CONTACT_LIMITS.name),
    email: clean(body.email, CONTACT_LIMITS.email).toLowerCase(),
    company: clean(body.company, CONTACT_LIMITS.company),
    topic: (CONTACT_TOPICS as readonly string[]).includes(body.topic as string) ? (body.topic as ContactTopic) : "other",
    message: typeof body.message === "string" ? body.message.replace(CONTROL_CHARS, "").trim().slice(0, CONTACT_LIMITS.message) : "",
    consent: body.consent === true,
  };

  const errors: ContactErrors = {};
  if (!value.name) errors.name = "Enter your name.";
  if (!value.email || !EMAIL_PATTERN.test(value.email)) errors.email = "Enter a valid work email address.";
  if (!value.company) errors.company = "Enter your company or organization.";
  if (!(CONTACT_TOPICS as readonly string[]).includes(String(body.topic))) errors.topic = "Choose a topic.";
  if (value.message.length < 10) errors.message = "Write at least a sentence so we can route your request.";
  if (!value.consent) errors.consent = "Confirm that we may use these details to reply.";

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

/** HTTPS webhook (Slack-compatible incoming webhook, ticketing intake, automation endpoint). */
export function getContactDestination(): string | null {
  const raw = process.env.CONTACT_WEBHOOK_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "https:" || (url.protocol === "http:" && local && process.env.NODE_ENV !== "production")) {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function neutralize(text: string): string {
  // Prevent mention/link injection in chat-style destinations.
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildDeliveryPayload(input: ContactInput, receivedAt: Date = new Date()) {
  const lines = [
    `New website enquiry (${input.topic})`,
    `Name: ${neutralize(input.name)}`,
    `Email: ${neutralize(input.email)}`,
    `Company: ${neutralize(input.company)}`,
    "",
    neutralize(input.message),
  ];
  return {
    // `text` is understood by Slack-compatible incoming webhooks; the other fields serve automation.
    text: lines.join("\n"),
    source: "aidr-landing/contact",
    topic: input.topic,
    name: input.name,
    email: input.email,
    company: input.company,
    message: input.message,
    receivedAt: receivedAt.toISOString(),
  };
}

/**
 * Small in-memory sliding-window limiter. It is per server instance (a best-effort
 * burst control); the route also applies a shared Firestore-backed limit when the
 * database is configured.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 5000,
  ) {}

  check(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      const retryAfterMs = this.windowMs - (now - recent[0]);
      this.hits.set(key, recent);
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) {
      for (const [k, times] of this.hits) {
        if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
      }
      if (this.hits.size > this.maxKeys) this.hits.clear();
    }
    return { ok: true };
  }
}

/** True when the request Origin (if present) matches the request host or the configured site origin. */
export function isSameOrigin(origin: string | null, host: string | null, siteOrigin: string): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.origin === siteOrigin) return true;
    return host !== null && parsed.host === host;
  } catch {
    return false;
  }
}
