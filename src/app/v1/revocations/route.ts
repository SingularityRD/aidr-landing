import { NextRequest } from "next/server";
import { revocationsHandler } from "@/lib/control-plane/agent-api";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return revocationsHandler(request);
}
