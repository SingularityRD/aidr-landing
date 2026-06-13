import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/demo";
import { isPublicApiV1Action } from "@/lib/control-plane/api-v1-access";

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

const demoMiddleware = () => NextResponse.next();

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

  return NextResponse.next();
});

export default isDemoMode() ? demoMiddleware : protectedMiddleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
