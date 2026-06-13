import { NextRequest, NextResponse } from "next/server";
import { firebaseAdminEnvError } from "@/lib/firebase/admin";
import { ingestFromRequest } from "@/lib/control-plane/ingest";
import { getRequestIp, getRequestUserAgent } from "@/lib/control-plane/request-guard";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  if (firebaseAdminEnvError) return json(500, { error: firebaseAdminEnvError });

  const authorization = request.headers.get("authorization") || request.headers.get("Authorization");
  const body = await request.json().catch(() => ({}));

  try {
    const data = await ingestFromRequest({
      authorizationHeader: authorization,
      body,
      requestId: request.headers.get("x-request-id") || request.headers.get("idempotency-key"),
      ip: getRequestIp(request),
      userAgent: getRequestUserAgent(request.headers),
    });
    return json(200, data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return json(message.startsWith("rate_limited:") ? 429 : 401, { error: message });
  }
}
