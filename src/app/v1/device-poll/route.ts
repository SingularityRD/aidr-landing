import { NextRequest } from "next/server";
import { devicePollHandler } from "@/lib/control-plane/agent-api";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return devicePollHandler(request);
}
