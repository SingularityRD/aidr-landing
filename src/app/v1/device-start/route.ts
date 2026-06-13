import { NextRequest, NextResponse } from "next/server";
import { firebaseAdminEnvError } from "@/lib/firebase/admin";
import { deviceStart } from "@/lib/control-plane/device-auth";
import { getRequestIp, getRequestUserAgent } from "@/lib/control-plane/request-guard";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  if (firebaseAdminEnvError) return json(500, { error: firebaseAdminEnvError });
  const origin = new URL(request.url).origin;
  const meta = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request.headers);
  try {
    const data = await deviceStart({ origin, meta: { ...(meta ?? {}), ip, user_agent: userAgent } });
    return json(200, data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return json(message.startsWith("rate_limited:") ? 429 : 400, { error: message });
  }
}
