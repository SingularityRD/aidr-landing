import { NextRequest, NextResponse } from "next/server";
import { getAgentRuntimePolicy } from "@/lib/control-plane/policy";
import { adminDb, firebaseAdminEnvError } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function GET(request: NextRequest) {
  if (firebaseAdminEnvError) return json(500, { error: firebaseAdminEnvError });

  try {
    const data = await getAgentRuntimePolicy({
      authorizationHeader: request.headers.get("authorization") || request.headers.get("Authorization"),
      db: adminDb,
    });
    return json(200, data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return json(401, { error: message });
  }
}
