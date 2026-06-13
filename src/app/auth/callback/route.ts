import { NextRequest, NextResponse } from "next/server";

/**
 * Validate returnTo to prevent open redirect attacks.
 * Only allows relative paths starting with / and no protocol/host injection.
 */
function isSafeReturnTo(value: string | null): value is string {
  if (!value) return false;
  // Must start with / and be a relative path (no //, no protocol)
  if (!value.startsWith("/")) return false;
  // Reject protocol-relative URLs like //evil.com
  if (value.startsWith("//")) return false;
  // Reject any embedded colon (could be javascript:, http:, etc.)
  if (value.includes(":")) return false;
  // Must be a valid pathname
  try {
    URL.parse(value, "http://localhost");
  } catch {
    return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo");
  const target = isSafeReturnTo(returnTo) ? returnTo : "/login";
  return NextResponse.redirect(new URL(target, request.url));
}
