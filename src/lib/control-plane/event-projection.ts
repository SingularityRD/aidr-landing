/**
 * Server-side projection of ingested events.
 *
 * Connectors already project and redact events before sending (aidr
 * `redactRemoteEvent`), but the ingest endpoint is a trust boundary: a client
 * that bypasses the managed runtime must not be able to persist arbitrary
 * content (prompts, tool output, credentials) under an innocuous key. Only the
 * fields below are stored, each type-checked and length-bounded, and every
 * string is scrubbed for obvious credential forms. Unknown fields are dropped,
 * never stored.
 */

export const REDACTED = "[Redacted]";

export const MAX_EVENT_STRING = 500;
export const MAX_EVENT_LIST = 32;
export const MAX_PROJECTED_EVENT_BYTES = 16 * 1024;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SECRET_LIKE_IDENTIFIER =
  /(?:^|[._:-])(?:api[_-]?key|access[_-]?token|authorization|bearer|cookie|credential|password|passwd|private[_-]?key|secret|session[_-]?token|client[_-]?secret|refresh[_-]?token|signature)(?:[._:-]|$)|^(?:sk[_-]|ghp_|github_pat_|xox[baprs]-|npm_|pypi-|AKIA|eyJ)/i;

const BEARER_RE = /(\bBearer\s+)[^\s,;"']+/gi;
const KEY_VALUE_RE =
  /(\b(?:api[_-]?key|x-api-key|access[_-]?token|auth(?:orization|[_-]?token)?|client[_-]?secret|cookie|password|passwd|private[_-]?key|refresh[_-]?token|id[_-]?token|secret|session[_-]?token|signature|token)\b\s*[:=]\s*)(["']?)([^\s,;&"']+)\2/gi;
const URL_CREDENTIAL_RE = /(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi;
const URL_SECRET_QUERY_RE =
  /([?&](?:api[_-]?key|x-api-key|access[_-]?token|auth(?:orization|[_-]?token)?|code|client[_-]?secret|password|passwd|refresh[_-]?token|id[_-]?token|secret|session[_-]?token|signature|sig|token)\s*=)[^&#\s]*/gi;
const JWT_RE = /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g;
const PRIVATE_KEY_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
const KNOWN_SECRET_RE =
  /\b(?:sk-[a-zA-Z0-9_-]{16,}|sk_live_[a-zA-Z0-9_-]{12,}|ghp_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|xox[baprs]-[a-zA-Z0-9-]{12,}|npm_[a-zA-Z0-9]{12,}|pypi-[a-zA-Z0-9_-]{12,}|AKIA[0-9A-Z]{16}|aidr_enroll_[a-f0-9]{16,})\b/g;

/** Redact credential material embedded in a free-form string and bound its length. */
export function redactEventString(value: string, maxLength = MAX_EVENT_STRING): string {
  const safe = value
    .replace(PRIVATE_KEY_RE, REDACTED)
    .replace(BEARER_RE, `$1${REDACTED}`)
    .replace(KEY_VALUE_RE, `$1${REDACTED}`)
    .replace(URL_CREDENTIAL_RE, `$1$2:${REDACTED}@`)
    .replace(URL_SECRET_QUERY_RE, `$1${REDACTED}`)
    .replace(KNOWN_SECRET_RE, REDACTED)
    .replace(JWT_RE, REDACTED);
  return safe.length > maxLength ? `${safe.slice(0, maxLength)}…` : safe;
}

function identifier(value: unknown): string | undefined {
  return typeof value === "string" && IDENTIFIER.test(value) && !SECRET_LIKE_IDENTIFIER.test(value)
    ? value
    : undefined;
}

function enumValue(value: unknown, allowed: readonly string[]): string | undefined {
  return typeof value === "string" && allowed.includes(value) ? value : undefined;
}

function stringList(value: unknown, maxItems = MAX_EVENT_LIST): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .slice(0, maxItems)
    .map((item) => (typeof item === "string" ? item : item && typeof item === "object" ? JSON.stringify(item) : ""))
    .filter((item) => item.length > 0)
    .map((item) => redactEventString(item));
}

const RECOMMENDED_ACTIONS = ["review", "investigate", "isolate", "revoke", "rotate_credentials", "notify"];

/**
 * Project a validated event down to the stored allow-list. `event_id` must have
 * been validated by the caller; the verdict/severity/type used for indexing and
 * retention are taken from the projection so they cannot diverge from the stored payload.
 */
export function projectIngestEvent(event: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const key of ["event_id", "session_id", "incident_id", "tool_name", "source", "matched_threat_id", "plugin_key", "category", "type"]) {
    const value = identifier(event[key]);
    if (value !== undefined) out[key] = value;
  }
  const verdict = enumValue(event.verdict, ["allow", "ask", "deny"]);
  if (verdict) out.verdict = verdict;
  const decision = enumValue(event.decision, ["allow", "ask", "deny"]);
  if (decision) out.decision = decision;
  const severity = enumValue(event.severity, ["info", "warning", "high", "critical"]);
  if (severity) out.severity = severity;
  const status = enumValue(event.status, ["open", "acknowledged", "contained", "resolved", "suppressed"]);
  if (status) out.status = status;

  if (typeof event.timestamp === "string" && event.timestamp.length <= 40) {
    const parsed = Date.parse(event.timestamp);
    if (Number.isFinite(parsed)) out.timestamp = new Date(parsed).toISOString();
  }
  if (typeof event.findings_count === "number" && Number.isInteger(event.findings_count) && event.findings_count >= 0 && event.findings_count <= 1_000_000) {
    out.findings_count = event.findings_count;
  }
  if (typeof event.user_override === "boolean") out.user_override = event.user_override;
  if (typeof event.duration_ms === "number" && Number.isFinite(event.duration_ms) && event.duration_ms >= 0) {
    out.duration_ms = event.duration_ms;
  }

  for (const key of ["tool_input_summary", "reason", "artifact"]) {
    if (typeof event[key] === "string") out[key] = redactEventString(event[key] as string);
  }
  const artifacts = stringList(event.artifacts);
  if (artifacts) out.artifacts = artifacts;
  const reasons = stringList(event.reasons);
  if (reasons) out.reasons = reasons;
  if (Array.isArray(event.recommended_actions)) {
    out.recommended_actions = event.recommended_actions
      .slice(0, 16)
      .filter((action): action is string => typeof action === "string" && RECOMMENDED_ACTIONS.includes(action));
  }

  const cache = event.runtime_policy_cache;
  if (cache && typeof cache === "object" && !Array.isArray(cache)) {
    const c = cache as Record<string, unknown>;
    const source = enumValue(c.source, ["disabled", "missing", "valid", "expired", "mismatched", "invalid"]);
    const version = identifier(c.policy_version);
    out.runtime_policy_cache = {
      ...(source ? { source } : {}),
      ...(version ? { policy_version: version } : {}),
      ...(typeof c.usable === "boolean" ? { usable: c.usable } : {}),
    };
  }

  // Hard ceiling: free-text lists are the only unbounded-ish fields, drop them first.
  if (Buffer.byteLength(JSON.stringify(out), "utf8") > MAX_PROJECTED_EVENT_BYTES) {
    delete out.artifacts;
    delete out.reasons;
    delete out.tool_input_summary;
  }
  return out;
}
