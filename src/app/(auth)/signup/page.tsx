"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { isDemoMode } from "@/lib/demo";
import { useAuthAvailable } from "@/components/DemoAuthProvider";

export default function SignUpPage() {
  const authAvailable = useAuthAvailable();
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

  if (!authAvailable) {
    return (
      <div role="alert" style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>
        <h1 style={{ color: "var(--text-primary)", marginBottom: 12 }}>Sign-in is temporarily unavailable</h1>
        <p>Authentication is not configured for this deployment. Please try again later or contact support.</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="sr-only">Create a Singularity AIDR account</h1>
      <SignUp
      routing="path"
      path="/signup"
      signInUrl="/login"
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
    </>
  );
}
