import { adminDb } from "@/lib/firebase/admin";
import { verifyAgentAccessToken, type AgentTokenClaims } from "./agent-token";

/**
 * Error with a stable, public wire code and HTTP status.
 *
 * The AIDR connector reads `error` from the JSON body (see
 * `PUBLIC_INGEST_ERRORS` in aidr `packages/core/src/clients/control-plane.ts`)
 * and decides from the HTTP status whether a failed telemetry batch is retried.
 * Authentication and tenant-isolation failures are therefore 401/403 (never
 * retried), transient failures are 5xx/429 (retried).
 */
export class ControlPlaneError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "ControlPlaneError";
  }
}

export function getBearerToken(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;
  const value = headerValue.trim();
  if (!value.toLowerCase().startsWith("bearer ")) return null;
  return value.slice("bearer ".length).trim() || null;
}

/** Agent states that must never be served policy or accepted as telemetry sources. */
const BLOCKED_AGENT_STATUSES = new Set(["deleted", "paused", "revoked", "suspended", "blocked"]);

type AgentDb = {
  collection(path: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
    };
  };
};

export type AuthenticatedAgent = {
  uid: string;
  agentId: string;
  claims: AgentTokenClaims;
  agent: Record<string, unknown>;
};

/**
 * Verify an agent bearer token AND that the agent it names is still enrolled.
 *
 * The signed token is self-contained and valid for up to 7 days, so signature
 * verification alone cannot honour a dashboard "revoke/delete agent" action.
 * Every agent-facing endpoint therefore re-reads
 * `users/{uid}/agents/{agentId}` (tenant = token claim, never request input) and
 * fails closed when the agent is missing, deleted or paused.
 */
export async function authenticateAgent(input: {
  authorizationHeader: string | null;
  db?: AgentDb;
  now?: Date;
}): Promise<AuthenticatedAgent> {
  const token = getBearerToken(input.authorizationHeader);
  if (!token) throw new ControlPlaneError("missing_api_key", 401);

  let claims: AgentTokenClaims;
  try {
    claims = verifyAgentAccessToken(token, input.now);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // A missing server secret is an operator problem, not a client credential problem.
    if (message.startsWith("Missing/weak AIDR_AGENT_TOKEN_SECRET")) {
      throw new ControlPlaneError("control_plane_misconfigured", 503);
    }
    throw new ControlPlaneError("invalid_api_key", 401);
  }

  const db = input.db ?? (adminDb as unknown as AgentDb);
  let snap: Awaited<ReturnType<ReturnType<ReturnType<AgentDb["collection"]>["doc"]>["get"]>>;
  try {
    snap = await db.collection(`users/${claims.uid}/agents`).doc(claims.agent_id).get();
  } catch {
    throw new ControlPlaneError("authorization_unavailable", 503);
  }
  const agent = snap.exists ? (snap.data() ?? {}) : null;
  if (!agent) throw new ControlPlaneError("agent_not_authorized", 403);
  const status = typeof agent.status === "string" ? agent.status : "";
  if (BLOCKED_AGENT_STATUSES.has(status) || agent.deleted_at) {
    throw new ControlPlaneError("agent_not_authorized", 403);
  }
  return { uid: claims.uid, agentId: claims.agent_id, claims, agent };
}
