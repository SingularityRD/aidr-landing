import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { isDemoMode } from "@/lib/demo";
import { isPublicApiV1Action } from "@/lib/control-plane/api-v1-access";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/csp";
import { clerkServerConfigured } from "@/lib/clerk-config";

const isAppRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/agents(.*)",
  "/events(.*)",
  "/incidents(.*)",
  "/policy-rollout(.*)",
  "/delivery-failures(.*)",
  "/billing(.*)",
  "/api-keys(.*)",
  "/settings(.*)",
  "/onboarding(.*)",
]);

const isApiRoute = createRouteMatcher(["/api/v1/(.*)"]);

/**
 * Next.js reads the nonce from the *request's* CSP header to stamp its inline scripts, so the policy goes on
 * the forwarded request as well as on the response.
 */
function nextWithCsp(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy({ nonce });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

const demoMiddleware = (request: NextRequest) => nextWithCsp(request);

/**
 * Used when Clerk is not configured (missing or placeholder keys). The public site keeps serving; anything that
 * needs an identity fails closed with 503 rather than being let through or taking the whole site down.
 */
const unconfiguredMiddleware = (request: NextRequest) => {
  const path = request.nextUrl.pathname;
  const needsIdentity =
    isAppRoute(request) ||
    (isApiRoute(request) && !isPublicApiV1Action(path.split("/")[3] || ""));
  if (needsIdentity) {
    return NextResponse.json(
      { error: "authentication_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } },
    );
  }
  return nextWithCsp(request);
};

const protectedMiddleware = clerkMiddleware(async (auth, request) => {
  if (isAppRoute(request)) {
    await auth.protect();
  }

  if (isApiRoute(request)) {
    const segments = request.nextUrl.pathname.split("/");
    const action = segments[3] || "";
    if (!isPublicApiV1Action(action)) {
      await auth.protect();
    }
  }

  return nextWithCsp(request);
});

export default isDemoMode()
  ? demoMiddleware
  : clerkServerConfigured()
    ? protectedMiddleware
    : unconfiguredMiddleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
