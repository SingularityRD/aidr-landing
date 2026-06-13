"use client";

import {
	buildReturnToCookie,
	clearReturnToCookie,
	POST_AUTH_RETURN_TO_KEY,
	readCookieValue,
} from "./return-to-utils";

export function setClientPostAuthReturnTo(path: string) {
	try {
		document.cookie = buildReturnToCookie(path);
	} catch {
		// ignore
	}
}

export function clearClientPostAuthReturnTo() {
	try {
		document.cookie = clearReturnToCookie();
	} catch {
		// ignore
	}
}

export function takeClientPostAuthReturnTo(): string | null {
	try {
		const cookie = readCookieValue(document.cookie, POST_AUTH_RETURN_TO_KEY);
		document.cookie = clearReturnToCookie();
		return cookie;
	} catch {
		return null;
	}
}
