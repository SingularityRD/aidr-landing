import { readCookieValue } from "./auth/return-to-utils";

export const SMOKE_SESSION_COOKIE = "aidr.e2e.session.v1";
export const SMOKE_MODE = process.env.NEXT_PUBLIC_AIDR_E2E_MODE === "1";
const SMOKE_SESSION_WINDOW_NAME_PREFIX = `${SMOKE_SESSION_COOKIE}=`;

export type SmokeSession = {
	access_token: string;
	refresh_token: string;
	expires_at: string;
	user: {
		id: string;
		email: string;
	};
};

export function createSmokeSession(source: string): SmokeSession {
	const normalized = source.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "aidr";
	const suffix = `${normalized}-${Date.now().toString(36)}`;
	return {
		access_token: `aidr-${suffix}-access`,
		refresh_token: `aidr-${suffix}-refresh`,
		expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
		user: {
			id: `aidr-${suffix}-user`,
			email: `${normalized}@example.com`,
		},
	};
}

export function encodeSmokeSession(session: SmokeSession): string {
	return encodeURIComponent(JSON.stringify(session));
}

export function decodeSmokeSession(value: string | null | undefined): SmokeSession | null {
	if (!value) return null;
	try {
		return JSON.parse(value) as SmokeSession;
	} catch {
		return null;
	}
}

function readSmokeSessionStorage(): SmokeSession | null {
	if (typeof window === "undefined") return null;
	try {
		return decodeSmokeSession(window.sessionStorage.getItem(SMOKE_SESSION_COOKIE));
	} catch {
		return null;
	}
}

function readSmokeSessionWindowName(): SmokeSession | null {
	if (typeof window === "undefined") return null;
	try {
		if (!window.name.startsWith(SMOKE_SESSION_WINDOW_NAME_PREFIX)) return null;
		const encoded = window.name.slice(SMOKE_SESSION_WINDOW_NAME_PREFIX.length);
		return decodeSmokeSession(encoded ? decodeURIComponent(encoded) : null);
	} catch {
		return null;
	}
}

export function readSmokeSessionCookie(cookieHeader: string | null | undefined): SmokeSession | null {
	const encoded = readCookieValue(cookieHeader ?? "", SMOKE_SESSION_COOKIE);
	return decodeSmokeSession(encoded) ?? readSmokeSessionStorage() ?? readSmokeSessionWindowName();
}

export function writeSmokeSessionWindowName(session: SmokeSession) {
	if (typeof window === "undefined") return;
	try {
		window.name = `${SMOKE_SESSION_WINDOW_NAME_PREFIX}${encodeURIComponent(JSON.stringify(session))}`;
	} catch {
		// ignore
	}
}

export function clearSmokeSessionWindowName() {
	if (typeof window === "undefined") return;
	try {
		window.name = "";
	} catch {
		// ignore
	}
}
