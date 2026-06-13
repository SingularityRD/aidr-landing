import { NextRequest, NextResponse } from "next/server";
import { firebaseAdminEnvError } from "@/lib/firebase/admin";
import { devicePollByDeviceCode } from "@/lib/control-plane/device-auth";
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

  const deviceCode =
    getBearer(request.headers.get("authorization") || request.headers.get("Authorization")) ?? "";
  if (!deviceCode) return json(400, { error: "missing_device_code" });

  try {
    const data = await devicePollByDeviceCode(deviceCode, {
      ip: getRequestIp(request),
      user_agent: getRequestUserAgent(request.headers),
    });
    return json(200, data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return json(message.startsWith("rate_limited:") ? 429 : 400, { error: message });
  }
}
