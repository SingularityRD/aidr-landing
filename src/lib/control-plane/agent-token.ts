import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

// Minimal HS256 JWT helper (no external deps).
// Tokens are intended for agent-to-control-plane auth, not user auth.

export type AgentTokenClaims = {
  uid: string;
  agent_id: string;
  jti: string;
  iat: number;
  exp: number;
};

function b64urlEncode(input: Buffer | string) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecodeToBuffer(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64");
}

function signHs256(data: string, secret: string) {
  return b64urlEncode(createHmac("sha256", secret).update(data).digest());
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function getAgentTokenSecret() {
  const secret = process.env.AIDR_AGENT_TOKEN_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

export function mintAgentAccessToken(input: {
  uid: string;
  agent_id: string;
  ttlSeconds?: number;
  now?: Date;
}): { token: string; claims: AgentTokenClaims } {
  const secret = getAgentTokenSecret();
  if (!secret) {
    throw new Error(
      "Missing/weak AIDR_AGENT_TOKEN_SECRET (must be >= 32 chars) for agent token minting."
    );
  }

  const now = input.now ?? new Date();
  const iat = Math.floor(now.getTime() / 1000);
  // SECURITY: cap max token lifetime to 7 days to limit replay window if leaked
  const maxTtl = 60 * 60 * 24 * 7; // 7 days
  const requestedTtl = Math.max(60, Number(input.ttlSeconds ?? 60 * 60 * 24 * 7));
  const exp = iat + Math.min(requestedTtl, maxTtl);
  const claims: AgentTokenClaims = {
    uid: input.uid,
    agent_id: input.agent_id,
    jti: `aidr_jti_${randomBytes(12).toString("hex")}`,
    iat,
    exp,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = b64urlEncode(JSON.stringify(header));
  const encodedPayload = b64urlEncode(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const sig = signHs256(signingInput, secret);

  return { token: `${signingInput}.${sig}`, claims };
}

export function verifyAgentAccessToken(token: string, now: Date = new Date()): AgentTokenClaims {
  const secret = getAgentTokenSecret();
  if (!secret) {
    throw new Error(
      "Missing/weak AIDR_AGENT_TOKEN_SECRET (must be >= 32 chars) for agent token verification."
    );
  }

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_token_format");
  const [h, p, sig] = parts;

  const expected = signHs256(`${h}.${p}`, secret);
  if (!safeEqual(expected, sig)) throw new Error("invalid_token_signature");

  let payload: unknown;
  try {
    payload = JSON.parse(b64urlDecodeToBuffer(p).toString("utf8"));
  } catch {
    throw new Error("invalid_token_payload");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("invalid_token_payload");
  }

  const obj = payload as Record<string, unknown>;
  const uid = typeof obj.uid === "string" ? obj.uid : "";
  const agent_id = typeof obj.agent_id === "string" ? obj.agent_id : "";
  const jti = typeof obj.jti === "string" ? obj.jti : "";
  const iat = typeof obj.iat === "number" ? obj.iat : 0;
  const exp = typeof obj.exp === "number" ? obj.exp : 0;

  if (!uid || !agent_id || !jti || !Number.isFinite(iat) || !Number.isFinite(exp)) {
    throw new Error("invalid_token_claims");
  }

  const nowSec = Math.floor(now.getTime() / 1000);
  if (nowSec >= exp) throw new Error("token_expired");

  return { uid, agent_id, jti, iat, exp };
}

