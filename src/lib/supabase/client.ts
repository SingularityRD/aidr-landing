import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const supabaseEnvError =
	!url || !anonKey
		? "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Create a .env.local file for the landing app."
		: null;

type SupabaseLike = ReturnType<typeof createBrowserClient>;

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

export function createBrowserSupabaseClient(): SupabaseLike {
	if (supabaseEnvError) {
		return buildMissingEnvClient(supabaseEnvError);
	}
	return createBrowserClient(url!, anonKey!);
}

// Singleton for React components
let browserClient: SupabaseLike | null = null;

export function getSupabaseBrowserClient(): SupabaseLike {
	if (!browserClient) {
		browserClient = createBrowserSupabaseClient();
	}
	return browserClient;
}
