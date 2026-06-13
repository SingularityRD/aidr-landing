"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { isDemoMode } from "@/lib/demo";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (isDemoMode()) {
      router.replace("/onboarding");
    }
  }, [router]);

  if (isDemoMode()) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <div style={{ color: "var(--text-faint)", marginBottom: 12 }}>Demo Mode</div>
        <div style={{ color: "var(--text-secondary)" }}>Redirecting to onboarding…</div>
      </div>
    );
  }

  return (
    <SignIn
      routing="path"
      path="/login"
      signUpUrl="/signup"
      fallbackRedirectUrl="/onboarding"
      appearance={{
        elements: {
          card: {
            border: "1px solid var(--panel-border)",
            background: "var(--panel-bg)",
            borderRadius: "18px",
            boxShadow: "0 12px 40px var(--shadow-color)",
          },
          headerTitle: {
            color: "var(--text-primary)",
          },
          headerSubtitle: {
            color: "var(--text-secondary)",
          },
          socialButtonsBlockButton: {
            border: "1px solid var(--panel-border)",
            background: "var(--surface-soft)",
            color: "var(--text-primary)",
          },
          formFieldLabel: {
            color: "var(--text-faint)",
          },
          formFieldInput: {
            border: "1px solid var(--panel-border)",
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
          },
          footerActionLink: {
            color: "var(--text-primary)",
          },
          dividerLine: {
            background: "var(--panel-border)",
          },
          dividerText: {
            color: "var(--text-faint)",
          },
        },
      }}
    />
  );
}
