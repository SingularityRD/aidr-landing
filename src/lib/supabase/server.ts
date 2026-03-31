import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

// Build-time diagnostic logging
if (process.env.DEBUG_SUPABASE) {
	console.log('[Supabase Server] URL exists:', !!url);
	console.log('[Supabase Server] Anon Key exists:', !!anonKey);
	console.log('[Supabase Server] NODE_ENV:', process.env.NODE_ENV);
}

export const supabaseEnvError =
	!url || !anonKey
		? "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Create a .env.local file for the landing app."
		: null;

type SupabaseLike = ReturnType<typeof createServerClient>;

function buildMissingEnvClient(message: string): SupabaseLike {
	const error = { message };

	return {
		from() {
			return {
				select() {
					return Promise.resolve({ data: null, error, count: 0 });
				},
				insert() {
					return Promise.resolve({ data: null, error });
				},
				update() {
					return this;
				},
				delete() {
					return this;
				},
				upsert() {
					return Promise.resolve({ data: null, error });
				},
				eq() {
					return this;
				},
				order() {
					return this;
				},
				limit() {
					return this;
				},
				maybeSingle() {
					return Promise.resolve({ data: null, error });
				},
				single() {
					return Promise.resolve({ data: null, error });
				},
			};
		},
		auth: {
			async getSession() {
				return { data: { session: null }, error: null };
			},
			async getUser() {
				return { data: { user: null }, error: null };
			},
			async signOut() {
				return { error: null };
			},
			async signInWithOAuth() {
				return { data: { provider: "", url: null }, error };
			},
			async signInWithOtp() {
				return { data: { session: null, user: null }, error };
			},
			async exchangeCodeForSession() {
				return { data: { session: null, user: null }, error };
			},
			onAuthStateChange(cb: (event: string, session: unknown | null) => void) {
				void cb;
				return { data: { subscription: { unsubscribe() {} } } };
			},
		},
		functions: {
			async invoke() {
				return { data: null, error };
			},
		},
	} as unknown as SupabaseLike;
}

export async function createServerSupabaseClient(): Promise<SupabaseLike> {
	if (supabaseEnvError) {
		return buildMissingEnvClient(supabaseEnvError);
	}

	const cookieStore = await cookies();

	return createServerClient(url!, anonKey!, {
		cookies: {
			getAll() {
				return cookieStore.getAll();
			},
			setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
				try {
					for (const { name, value, options } of cookiesToSet) {
						cookieStore.set(name, value, options);
					}
				} catch {
					// The `setAll` method was called from a Server Component.
					// This can be ignored if you have middleware refreshing sessions.
				}
			},
		},
	});
}
