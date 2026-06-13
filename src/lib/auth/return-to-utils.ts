export const POST_AUTH_RETURN_TO_KEY = "aidr.postAuthReturnTo.v1";
export const POST_AUTH_RETURN_TO_MAX_AGE_SECONDS = 60 * 60 * 24;

export function normalizeReturnTo(
	path: string | null | undefined,
	fallback = "/onboarding",
): string {
	const trimmed = path?.trim();
	if (!trimmed) return fallback;
	if (!trimmed.startsWith("/")) return fallback;
	if (trimmed.startsWith("//")) return fallback;
	return trimmed;
}

export function buildReturnToCookie(path: string): string {
	const normalized = normalizeReturnTo(path);
	return `${POST_AUTH_RETURN_TO_KEY}=${encodeURIComponent(normalized)}; Path=/; Max-Age=${POST_AUTH_RETURN_TO_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function clearReturnToCookie(): string {
	return `${POST_AUTH_RETURN_TO_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function readCookieValue(cookieHeader: string, key: string): string | null {
	for (const chunk of cookieHeader.split(";")) {
		const [rawKey, ...rawValue] = chunk.trim().split("=");
		if (rawKey !== key) continue;
		const value = rawValue.join("=");
		if (!value) return null;
		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}
	return null;
}
