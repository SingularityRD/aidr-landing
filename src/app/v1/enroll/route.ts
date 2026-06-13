import { NextRequest, NextResponse } from "next/server";
import { firebaseAdminEnvError } from "@/lib/firebase/admin";
import { enrollWithEnrollmentToken } from "@/lib/control-plane/device-auth";
import { getRequestIp, getRequestUserAgent } from "@/lib/control-plane/request-guard";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function getBearer(headerValue: string | null) {
  if (!headerValue) return null;
  const v = headerValue.trim();
  if (!v.toLowerCase().startsWith("bearer ")) return null;
  return v.slice("bearer ".length).trim() || null;
}

export async function POST(request: NextRequest) {
  if (firebaseAdminEnvError) return json(500, { error: firebaseAdminEnvError });

  const enrollmentToken =
    getBearer(request.headers.get("authorization") || request.headers.get("Authorization")) ?? "";
  if (!enrollmentToken) return json(400, { error: "missing_enrollment_token" });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const origin = new URL(request.url).origin;

  try {
    const data = await enrollWithEnrollmentToken({
      enrollment_token: enrollmentToken,
      origin,
      iid: typeof body.iid === "string" ? body.iid : undefined,
      agent_runtime: typeof body.agent_runtime === "string" ? body.agent_runtime : undefined,
      agent_runtime_version: typeof body.agent_runtime_version === "string" ? body.agent_runtime_version : undefined,
      request_id: typeof body.request_id === "string" ? body.request_id : undefined,
      ip: getRequestIp(request),
      user_agent: getRequestUserAgent(request.headers),
    });

    // Keep legacy field naming for AIDR core: api_key == agent access token.
    return json(200, {
      ok: true,
      api_key: data.access_token,
      ingest_url: data.ingest_url,
      agent_id: data.agent_id,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return json(message.startsWith("rate_limited:") ? 429 : 400, { error: message });
  }
}
