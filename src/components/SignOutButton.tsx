"use client";

import { signOut } from "@/lib/auth/session";

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        await signOut();
        window.location.href = "/login";
      }}
      style={{
        padding: "8px 16px",
        borderRadius: 6,
        border: "1px solid var(--panel-border)",
        background: "transparent",
        color: "var(--text-secondary)",
        fontSize: 14,
        cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      Sign out
    </button>
  );
}
