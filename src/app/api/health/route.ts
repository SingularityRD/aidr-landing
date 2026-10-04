import { NextResponse } from "next/server";
import { getLiveness } from "@/lib/site/health";

export const dynamic = "force-dynamic";

/** Liveness: the process is up and able to serve a request. Performs no dependency calls. */
export function GET() {
  return NextResponse.json(getLiveness(), {
    status: 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
