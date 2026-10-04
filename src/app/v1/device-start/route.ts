import { NextRequest } from "next/server";
import { deviceStartHandler } from "@/lib/control-plane/agent-api";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return deviceStartHandler(request);
}
