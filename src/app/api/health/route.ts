import { NextResponse } from "next/server";
// Only the dependency-free liveness module: see src/lib/site/liveness.ts.
import { getLiveness } from "@/lib/site/liveness";

export const dynamic = "force-dynamic";

/** Liveness: the process is up and able to serve a request. Performs no dependency calls. */
export function GET() {
  return NextResponse.json(getLiveness(), {
    status: 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
