import { readCookieValue } from "./return-to-utils";
import type { DashboardSessionLike } from "../dashboard-url";

export const POST_AUTH_RETURN_TO_LOCAL_KEY = "aidr.postAuthReturnToLocal.v1";
export const POST_AUTH_RETURN_TO_LOCAL_PATH_KEY = "aidr.postAuthReturnToLocalPath.v1";
export const POST_AUTH_RETURN_TO_LOCAL_MAX_AGE_SECONDS = 60 * 60 * 24;

function isAllowedLocalHostname(hostname: string): boolean {
	return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function normalizeReturnToLocalOrigin(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;

	try {
		const url = new URL(trimmed);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		if (!isAllowedLocalHostname(url.hostname)) return null;
		// Only allow an origin (no extra path) for the local dashboard target.
		return url.origin;
	} catch {
		return null;
	}
}

export function normalizeReturnToLocalPath(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	if (!trimmed.startsWith("/")) return null;
	if (trimmed.startsWith("//")) return null;
	// Avoid scheme-like injections inside the path.
	if (trimmed.includes("://")) return null;
	return trimmed;
}

export function buildReturnToLocalCookie(path: string): string {
	const normalized = normalizeReturnToLocalOrigin(path);
	if (!normalized) {
		return `${POST_AUTH_RETURN_TO_LOCAL_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
	}

	return `${POST_AUTH_RETURN_TO_LOCAL_KEY}=${encodeURIComponent(normalized)}; Path=/; Max-Age=${POST_AUTH_RETURN_TO_LOCAL_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function buildReturnToLocalPathCookie(path: string): string {
	const normalized = normalizeReturnToLocalPath(path);
	if (!normalized) {
		return `${POST_AUTH_RETURN_TO_LOCAL_PATH_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
	}

	return `${POST_AUTH_RETURN_TO_LOCAL_PATH_KEY}=${encodeURIComponent(normalized)}; Path=/; Max-Age=${POST_AUTH_RETURN_TO_LOCAL_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function clearReturnToLocalCookie(): string {
	return `${POST_AUTH_RETURN_TO_LOCAL_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function clearReturnToLocalPathCookie(): string {
	return `${POST_AUTH_RETURN_TO_LOCAL_PATH_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function readReturnToLocalCookie(cookieHeader: string): string | null {
	const raw = readCookieValue(cookieHeader, POST_AUTH_RETURN_TO_LOCAL_KEY);
	return normalizeReturnToLocalOrigin(raw);
}

export function readReturnToLocalPathCookie(cookieHeader: string): string | null {
	const raw = readCookieValue(cookieHeader, POST_AUTH_RETURN_TO_LOCAL_PATH_KEY);
	return normalizeReturnToLocalPath(raw);
}

export function setClientPostAuthReturnToLocal(path: string) {
	try {
		document.cookie = buildReturnToLocalCookie(path);
	} catch {
		// ignore
	}
}

export function setClientPostAuthReturnToLocalPath(path: string) {
	try {
		document.cookie = buildReturnToLocalPathCookie(path);
	} catch {
		// ignore
	}
}

export function clearClientPostAuthReturnToLocal() {
	try {
		document.cookie = clearReturnToLocalCookie();
	} catch {
		// ignore
	}
}

export function clearClientPostAuthReturnToLocalPath() {
	try {
		document.cookie = clearReturnToLocalPathCookie();
	} catch {
		// ignore
	}
}

export function readClientPostAuthReturnToLocal(): string | null {
	try {
		return normalizeReturnToLocalOrigin(readCookieValue(document.cookie, POST_AUTH_RETURN_TO_LOCAL_KEY));
	} catch {
		return null;
	}
}

export function readClientPostAuthReturnToLocalPath(): string | null {
	try {
		return normalizeReturnToLocalPath(
			readCookieValue(document.cookie, POST_AUTH_RETURN_TO_LOCAL_PATH_KEY),
		);
	} catch {
		return null;
	}
}

export function buildLocalDashboardAuthCallbackUrl(
	returnToLocal: string | null | undefined,
	session: DashboardSessionLike | null | undefined,
	returnTo = "/onboarding",
): string | null {
	const baseUrl = normalizeReturnToLocalOrigin(returnToLocal);
	if (!baseUrl || !session?.access_token || !session?.refresh_token) {
		return null;
	}

	const normalizedReturnTo = normalizeReturnToLocalPath(returnTo) ?? "/onboarding";
	const params = new URLSearchParams({
		access_token: session.access_token,
		refresh_token: session.refresh_token,
		returnTo: normalizedReturnTo,
	});

	return `${baseUrl}/auth/callback#${params.toString()}`;
}
