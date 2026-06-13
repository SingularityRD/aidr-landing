import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isDemoMode } from "./src/lib/demo";
import { isPublicApiV1Action } from "./src/lib/control-plane/api-v1-access";

const isAppRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/agents(.*)",
  "/events(.*)",
  "/incidents(.*)",
  "/billing(.*)",
  "/api-keys(.*)",
  "/settings(.*)",
  "/onboarding(.*)",
]);

const isApiRoute = createRouteMatcher(["/api/v1/(.*)"]);

const demoMiddleware = () => {
	// Production guard: demo mode in production is a critical security risk
	if (process.env.NODE_ENV === "production") {
		console.error("[AIDR] CRITICAL: Demo mode would bypass all auth in production. Refusing.");
		return new NextResponse("Service configuration error", { status: 503 });
	}
	return NextResponse.next();
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

  return NextResponse.next();
});

export default isDemoMode() ? demoMiddleware : protectedMiddleware;

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
