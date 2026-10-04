import { NextRequest } from "next/server";
import { ingestHandler } from "@/lib/control-plane/agent-api";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return ingestHandler(request);
}
