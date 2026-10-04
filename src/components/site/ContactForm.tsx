"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Turnstile } from "@/components/Turnstile";
import { CONTACT_LIMITS, CONTACT_TOPICS, type ContactErrors, type ContactTopic } from "@/lib/site/contact";

const TOPIC_LABELS: Record<ContactTopic, string> = {
  sales: "Sales and enterprise",
  pilot: "14-day evaluation",
  support: "Support",
  security: "Security (not for vulnerability details; see the security page)",
  privacy: "Privacy and data requests",
  legal: "Legal and procurement",
  other: "Something else",
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

export default function ContactForm({ initialTopic }: { initialTopic?: ContactTopic }) {
  const id = useId();
  const [errors, setErrors] = useState<ContactErrors>({});
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const [token, setToken] = useState<string | null>(null);
  const startedAt = useRef<number>(0);
  const formRef = useRef<HTMLFormElement | null>(null);
  const turnstileKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

  useEffect(() => {
    // Timing trap: remember when the form was shown so instant submissions can be discarded server-side.
    startedAt.current = Date.now();
  }, []);

  const onVerify = useCallback((value: string) => setToken(value), []);
  const onClear = useCallback(() => setToken(null), []);

  function fieldId(name: string) {
    return `${id}-${name}`;
  }

  function describedBy(name: keyof ContactErrors, hint = false) {
    const ids = [] as string[];
    if (hint) ids.push(`${fieldId(name)}-hint`);
    if (errors[name]) ids.push(`${fieldId(name)}-error`);
    return ids.length > 0 ? ids.join(" ") : undefined;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "sending") return;
    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      company: String(data.get("company") ?? ""),
      topic: String(data.get("topic") ?? ""),
      message: String(data.get("message") ?? ""),
      consent: data.get("consent") === "on",
      website: String(data.get("website") ?? ""),
      startedAt: startedAt.current || Date.now() - 60_000,
      turnstileToken: token ?? undefined,
    };
    setState({ kind: "sending" });
    setErrors({});
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setState({ kind: "sent" });
        formRef.current?.reset();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string; fields?: ContactErrors };
      if (response.status === 422 && body.fields) {
        setErrors(body.fields);
        setState({ kind: "error", message: "Please correct the highlighted fields." });
        return;
      }
      const messages: Record<string, string> = {
        rate_limited: "Too many submissions. Please wait a few minutes and try again.",
        contact_unavailable:
          "The contact route is not connected yet, so your message was not sent. Please try again later.",
        challenge_failed: "The bot check failed. Reload the page and try again.",
        delivery_failed: "We could not deliver your message. Please try again later.",
      };
      setState({ kind: "error", message: messages[body.error ?? ""] ?? "Your message was not sent. Please try again." });
    } catch {
      setState({ kind: "error", message: "Network error. Your message was not sent." });
    }
  }

  if (state.kind === "sent") {
    return (
      <div className="callout callout-info" role="status">
        <strong>Message sent.</strong> Thank you. A person will review it and reply to the email address you gave. No
        response time is committed yet.
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-describedby={fieldId("form-note")}
    >
      <p id={fieldId("form-note")} className="hint" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        All fields are required. Do not include passwords, API keys, customer data or vulnerability details.
      </p>

      <div className="form-grid" style={{ marginTop: 16 }}>
        <div className="form-field">
          <label htmlFor={fieldId("name")}>Name</label>
          <input
            id={fieldId("name")}
            name="name"
            autoComplete="name"
            maxLength={CONTACT_LIMITS.name}
            required
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy("name")}
          />
          {errors.name ? (
            <span id={`${fieldId("name")}-error`} className="field-error">
              {errors.name}
            </span>
          ) : null}
        </div>
        <div className="form-field">
          <label htmlFor={fieldId("email")}>Work email</label>
          <input
            id={fieldId("email")}
            name="email"
            type="email"
            autoComplete="email"
            maxLength={CONTACT_LIMITS.email}
            required
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describedBy("email")}
          />
          {errors.email ? (
            <span id={`${fieldId("email")}-error`} className="field-error">
              {errors.email}
            </span>
          ) : null}
        </div>
        <div className="form-field">
          <label htmlFor={fieldId("company")}>Company or organization</label>
          <input
            id={fieldId("company")}
            name="company"
            autoComplete="organization"
            maxLength={CONTACT_LIMITS.company}
            required
            aria-invalid={errors.company ? true : undefined}
            aria-describedby={describedBy("company")}
          />
          {errors.company ? (
            <span id={`${fieldId("company")}-error`} className="field-error">
              {errors.company}
            </span>
          ) : null}
        </div>
        <div className="form-field">
          <label htmlFor={fieldId("topic")}>Topic</label>
          <select
            id={fieldId("topic")}
            name="topic"
            defaultValue={initialTopic ?? "sales"}
            required
            aria-invalid={errors.topic ? true : undefined}
            aria-describedby={describedBy("topic")}
          >
            {CONTACT_TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {TOPIC_LABELS[topic]}
              </option>
            ))}
          </select>
          {errors.topic ? (
            <span id={`${fieldId("topic")}-error`} className="field-error">
              {errors.topic}
            </span>
          ) : null}
        </div>
      </div>

      <div className="form-field">
        <label htmlFor={fieldId("message")}>How can we help?</label>
        <span id={`${fieldId("message")}-hint`} className="hint">
          Agent runtimes you use, number of developers, and any procurement requirements (up to {CONTACT_LIMITS.message}{" "}
          characters).
        </span>
        <textarea
          id={fieldId("message")}
          name="message"
          maxLength={CONTACT_LIMITS.message}
          required
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={describedBy("message", true)}
        />
        {errors.message ? (
          <span id={`${fieldId("message")}-error`} className="field-error">
            {errors.message}
          </span>
        ) : null}
      </div>

      {/* Honeypot: real visitors never see or reach this field. */}
      <div className="hp-field" aria-hidden="true">
        <label htmlFor={fieldId("website")}>Leave this field empty</label>
        <input id={fieldId("website")} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="form-field">
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <input
            id={fieldId("consent")}
            name="consent"
            type="checkbox"
            style={{ width: 18, height: 18, marginTop: 3 }}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={describedBy("consent")}
          />
          <label htmlFor={fieldId("consent")} style={{ fontWeight: 400 }}>
            I agree that Singularity Research &amp; Development may use these details to reply to my request. See the
            privacy draft for how the data is handled.
          </label>
        </div>
        {errors.consent ? (
          <span id={`${fieldId("consent")}-error`} className="field-error">
            {errors.consent}
          </span>
        ) : null}
      </div>

      {turnstileKey ? <Turnstile siteKey={turnstileKey} onVerify={onVerify} onError={onClear} onExpire={onClear} /> : null}

      <div className="btn-row">
        <button type="submit" className="btn" disabled={state.kind === "sending" || (Boolean(turnstileKey) && !token)}>
          {state.kind === "sending" ? "Sending..." : "Send message"}
        </button>
      </div>

      <div role="status" aria-live="polite" style={{ marginTop: 12, minHeight: 20 }}>
        {state.kind === "error" ? <span className="field-error">{state.message}</span> : null}
      </div>
    </form>
  );
}
