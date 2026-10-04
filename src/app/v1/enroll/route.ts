import { NextRequest } from "next/server";
import { enrollHandler } from "@/lib/control-plane/agent-api";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return enrollHandler(request);
}
