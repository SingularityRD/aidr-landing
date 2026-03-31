"use client";

const KEY = "aidr.postAuthReturnTo.v1";

export function setClientPostAuthReturnTo(path: string) {
  try {
    localStorage.setItem(KEY, path);
  } catch {
    // ignore
  }
}

export function takeClientPostAuthReturnTo(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    if (!v) return null;
    localStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}
