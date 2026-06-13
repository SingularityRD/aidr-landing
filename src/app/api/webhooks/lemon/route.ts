import { NextRequest, NextResponse } from "next/server";
import { firebaseAdminEnvError } from "@/lib/firebase/admin";
import { applyLemonWebhook, type LemonWebhookPayload } from "@/lib/billing/webhook";
import { getRequestIp, getRequestUserAgent } from "@/lib/control-plane/request-guard";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  if (process.env.AIDR_ENABLE_LEGACY_LEMON_BILLING !== "1") {
    return json(404, { error: "legacy_billing_disabled" });
  }

  if (firebaseAdminEnvError) return json(500, { error: firebaseAdminEnvError });

  const secret =
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET?.trim() ||
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET?.trim() ||
    "";
  if (!secret) return json(500, { error: "Missing Lemon webhook secret" });

  const signature = request.headers.get("x-signature") || request.headers.get("X-Signature") || "";
  const rawBody = await request.text();

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "invalid_json" });
  }

  try {
    const data = await applyLemonWebhook({
      payload: payload as LemonWebhookPayload,
      rawBody,
      signature,
      secret,
      ip: getRequestIp(request),
      userAgent: getRequestUserAgent(request.headers),
    });
    return json(200, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "invalid_signature" ? 401 :
      message === "missing_user_id" || message === "missing_event_id" ? 400 :
      message === "billing_webhook_conflict" ? 409 :
      message === "billing_webhook_duplicate" ? 200 :
      400;
    if (message === "billing_webhook_duplicate") {
      return json(200, { ok: true, duplicate: true });
    }
    return json(status, { error: message });
  }
}
