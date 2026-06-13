"use server";

import { cookies } from "next/headers";
import { normalizeReturnTo, POST_AUTH_RETURN_TO_KEY } from "./return-to-utils";

export async function setPostAuthReturnTo(path: string) {
	try {
		const normalized = normalizeReturnTo(path);
		const cookieStore = await cookies();
		cookieStore.set(POST_AUTH_RETURN_TO_KEY, normalized, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });
  } catch {
    // ignore
  }
}

export async function takePostAuthReturnTo(): Promise<string | null> {
	try {
		const cookieStore = await cookies();
		const v = cookieStore.get(POST_AUTH_RETURN_TO_KEY)?.value;
		if (!v) return null;
		cookieStore.delete(POST_AUTH_RETURN_TO_KEY);
		return normalizeReturnTo(v);
	} catch {
		return null;
	}
}

export async function buildReturnToFromRequest(request: Request): Promise<string> {
	try {
		const url = new URL(request.url);
		const path = `${url.pathname}${url.search}`;
		return normalizeReturnTo(path, "/");
	} catch {
		return "/";
	}
}
