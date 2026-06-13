const DEFAULT_LOCAL_DASHBOARD_URL = "http://127.0.0.1:5173";

export interface DashboardSessionLike {
	access_token: string;
	refresh_token: string;
}

export function getDashboardBaseUrl(): string | null {
	if (process.env.NEXT_PUBLIC_AIDR_E2E_NO_DASHBOARD === "1") {
		return null;
	}

	const configured = process.env.NEXT_PUBLIC_DASHBOARD_URL?.trim();
	if (configured) {
		return configured.replace(/\/+$/, "");
	}

	if (process.env.NODE_ENV === "production") return null;

	// Only assume a default dashboard dev server for localhost-style runs.
	if (typeof window === "undefined") return DEFAULT_LOCAL_DASHBOARD_URL;

	const host = window.location.hostname;
	if (host === "localhost" || host === "127.0.0.1") return DEFAULT_LOCAL_DASHBOARD_URL;

	return null;
}

export function buildDashboardUrl(path: string): string | null {
	const baseUrl = getDashboardBaseUrl();
	if (!baseUrl) return null;
	const cleanPath = path.startsWith("/") ? path : `/${path}`;
	return `${baseUrl}${cleanPath}`;
}

export function buildDashboardLoginUrl(): string | null {
	return buildDashboardUrl("/login");
}

export function buildDashboardAuthCallbackUrl(
	session: DashboardSessionLike | null | undefined,
	returnTo = "/onboarding",
): string | null {
	const baseUrl = getDashboardBaseUrl();
	if (!baseUrl || !session?.access_token || !session?.refresh_token) {
		return null;
	}

	const params = new URLSearchParams({
		access_token: session.access_token,
		refresh_token: session.refresh_token,
		returnTo,
	});

	return `${baseUrl}/auth/callback#${params.toString()}`;
}
