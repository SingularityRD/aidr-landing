import { NextResponse } from "next/server";
import { processDueDeliveryFailures } from "@/lib/control-plane/delivery-replay";
import { getRequestIp, getRequestUserAgent, recordControlPlaneAudit } from "@/lib/control-plane/request-guard";
import { adminDb } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function getBearerToken(headers: Headers) {
  const value = headers.get("authorization") ?? "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function getLimit(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

export async function POST(request: Request) {
  const secret = process.env.AIDR_CRON_SECRET?.trim();
  if (!secret) return json(503, { error: "cron_secret_not_configured" });

  const supplied = getBearerToken(request.headers) || request.headers.get("x-aidr-cron-secret")?.trim();
  if (supplied !== secret) return json(401, { error: "unauthorized" });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const uid = getString(body.uid).trim();
  if (!uid) return json(400, { error: "missing_uid" });

  const limit = getLimit(body.limit);
  const ip = getRequestIp({ headers: request.headers });
  const userAgent = getRequestUserAgent(request.headers);

  try {
    const result = await processDueDeliveryFailures({
      uid,
      actorUserId: "system:delivery-retry-scheduler",
      db: adminDb,
      limit,
    });
    await recordControlPlaneAudit({
      action: "delivery-failure-retry-due",
      outcome: result.failed > 0 ? "partial_failure" : "ok",
      uid,
      subject: uid,
      ip,
      user_agent: userAgent,
      metadata: {
        limit,
        scanned: result.scanned,
        replayed: result.replayed,
        delivered: result.delivered,
        skipped: result.skipped,
        failed: result.failed,
      },
    });
    return json(200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    logger.error({ error: message, uid }, "Delivery retry scheduler failed");
    await recordControlPlaneAudit({
      action: "delivery-failure-retry-due",
      outcome: "failed",
      uid,
      subject: uid,
      ip,
      user_agent: userAgent,
      metadata: { limit, error: message },
    }).catch(() => {});
    return json(500, { error: "delivery_retry_failed" });
  }
}
