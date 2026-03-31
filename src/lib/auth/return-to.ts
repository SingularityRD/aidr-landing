"use server";

import { cookies } from "next/headers";

const KEY = "aidr.postAuthReturnTo.v1";

export async function setPostAuthReturnTo(path: string) {
  try {
    const cookieStore = await cookies();
    cookieStore.set(KEY, path, {
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
    const v = cookieStore.get(KEY)?.value;
    if (!v) return null;
    cookieStore.delete(KEY);
    return v;
  } catch {
    return null;
  }
}

export async function buildReturnToFromRequest(request: Request): Promise<string> {
  try {
    const url = new URL(request.url);
    const path = `${url.pathname}${url.search}`;
    return path || "/";
  } catch {
    return "/";
  }
}
