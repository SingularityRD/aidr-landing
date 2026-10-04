import { NextResponse } from "next/server";
import { getReadiness } from "@/lib/site/health";

export const dynamic = "force-dynamic";

/**
 * Readiness: real checks of the dependencies this application needs. Returns 503 when a
 * required dependency is unavailable or misconfigured. Responses contain check names,
 * statuses and short reason codes only; never secrets, hostnames or raw error text.
 */
export async function GET() {
  const readiness = await getReadiness();
  return NextResponse.json(readiness, {
    status: readiness.status === "ready" ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
