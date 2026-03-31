import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  // Get the returnTo from cookies - cookies() returns a Promise in Next.js 15+
  const cookieStore = await cookies();
  const returnTo = cookieStore.get("aidr.postAuthReturnTo.v1")?.value ?? "/onboarding";

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      // Redirect to login with error
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
      );
    }

    // Clear the returnTo cookie
    cookieStore.delete("aidr.postAuthReturnTo.v1");

    // Redirect to the returnTo path or onboarding
    const redirectTo = returnTo.startsWith("/") ? returnTo : "/onboarding";
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  // No code present, check if we already have a session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
          setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore
          }
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    const redirectTo = returnTo.startsWith("/") ? returnTo : "/onboarding";
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  // No session, redirect to login
  return NextResponse.redirect(new URL("/login", request.url));
}
