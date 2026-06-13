"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSmartUser } from "../hooks/useSmartUser";
import { isDemoMode } from "../lib/demo";

interface AuthGateProps {
  children: ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useSmartUser();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (!isLoaded || hasRedirected.current) return;

    if (!isSignedIn) {
      hasRedirected.current = true;
      const returnTo = pathname?.trim() || "/dashboard";
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [isLoaded, isSignedIn, pathname, router]);

  if (!isLoaded || !isSignedIn) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ color: "var(--text-secondary)" }}>Checking session...</div>
        {isDemoMode() && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-faint)" }}>
            Demo mode: auto-authenticated
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
