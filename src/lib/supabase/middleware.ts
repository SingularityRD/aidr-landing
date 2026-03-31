import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export async function updateSession(request: NextRequest) {
	// If env vars are missing, pass through without auth
	if (!url || !anonKey) {
		return NextResponse.next({
			request: {
				headers: request.headers,
			},
		});
	}

	let supabaseResponse = NextResponse.next({
		request: {
			headers: request.headers,
		},
	});

	const supabase = createServerClient(url, anonKey, {
		cookies: {
			getAll() {
				return request.cookies.getAll();
			},
			setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
				for (const { name, value } of cookiesToSet) {
					request.cookies.set(name, value);
				}
				supabaseResponse = NextResponse.next({
					request: {
						headers: request.headers,
					},
				});
				for (const { name, value, options } of cookiesToSet) {
					supabaseResponse.cookies.set(name, value, options);
				}
			},
		},
	});

	// This will refresh session if expired - required for Server Components to work
	await supabase.auth.getSession();

	return supabaseResponse;
}
