"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { setClientPostAuthReturnTo } from "@/lib/auth/return-to-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Turnstile, useTurnstile } from "@/components/Turnstile";

export const dynamic = "force-dynamic";

/* ── shared style tokens ── */
const cardStyle: React.CSSProperties = {
  border: "1px solid var(--panel-border)",
  background: "var(--panel-bg)",
  borderRadius: 18,
  padding: "40px 32px 36px",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 12px 40px var(--shadow-color)",
};

const btnBase: React.CSSProperties = {
  width: "100%",
  padding: "12px 20px",
  borderRadius: 12,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  transition: "background 0.2s, border-color 0.2s, opacity 0.2s",
  border: "1px solid var(--panel-border)",
  textAlign: "center" as const,
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: "var(--text-primary)",
  color: "var(--bg-primary)",
  border: "1px solid var(--text-primary)",
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "var(--surface-soft)",
  color: "var(--text-primary)",
};

const btnGhost: React.CSSProperties = {
  ...btnBase,
  background: "transparent",
  color: "var(--text-secondary)",
  border: "1px solid var(--panel-border)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 10,
  border: "1px solid var(--panel-border)",
  background: "var(--bg-secondary)",
  color: "var(--text-primary)",
  fontSize: 14,
  outline: "none",
  transition: "border-color 0.2s",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-faint)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  marginBottom: 6,
  display: "block",
};

const dividerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  margin: "20px 0",
  color: "var(--text-faint)",
  fontSize: 12,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};

const dividerLineStyle: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: "var(--panel-border)",
};

/* ── Google icon SVG ── */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }} aria-label="Google">
      <title>Google</title>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.5 14.5 0 019.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 000 24c0 3.77.9 7.35 2.56 10.56l7.97-5.97z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 5.97C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/* ── GitHub icon SVG ── */
function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }} aria-label="GitHub">
      <title>GitHub</title>
      <path
        fill="currentColor"
        d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"
      />
    </svg>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  const { token: captchaToken, isVerified: captchaVerified, handleVerify: handleCaptchaVerify, handleError: handleCaptchaError } = useTurnstile();

  const trimmedEmail = useMemo(() => email.trim(), [email]);
  const returnTo = searchParams.get("returnTo")?.trim() ?? "";

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const session = await getSession();
      if (!cancelled && session) {
        setIsLoggedIn(true);
        window.location.href = returnTo || "/onboarding";
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [returnTo]);

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setStatus(null);
    try {
      if (returnTo) setClientPostAuthReturnTo(returnTo);

      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });
      if (error) {
        if (error.message.includes("Unsupported provider")) {
          setStatus(
            "Google OAuth is not enabled in Supabase. Please enable it in Supabase Dashboard → Authentication → Providers → Google."
          );
        } else {
          setStatus(error.message);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGitHubSignIn = async () => {
    setBusy(true);
    setStatus(null);
    try {
      if (returnTo) setClientPostAuthReturnTo(returnTo);

      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo,
        },
      });
      if (error) {
        if (error.message.includes("Unsupported provider")) {
          setStatus(
            "GitHub OAuth is not enabled in Supabase. Please enable it in Supabase Dashboard → Authentication → Providers → GitHub."
          );
        } else {
          setStatus(error.message);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleMagicLink = async () => {
    if (!captchaVerified) {
      setStatus("Please complete the CAPTCHA verification first.");
      return;
    }
    
    setBusy(true);
    setStatus(null);
    try {
      if (returnTo) setClientPostAuthReturnTo(returnTo);

      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: { 
          emailRedirectTo: redirectTo,
          captchaToken: captchaToken || undefined,
        },
      });
      if (error) {
        setStatus(error.message);
      } else {
        setStatus("Magic link sent — check your inbox.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCheckSignedIn = async () => {
    const session = await getSession();
    if (session) {
      window.location.href = returnTo || "/onboarding";
    } else {
      setStatus("Not signed in yet.");
    }
  };

  /* ── Already logged in ── */
  if (isLoggedIn) {
    return (
      <div style={cardStyle}>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "var(--surface-soft)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 22 }}>✓</span>
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 8,
            }}
          >
            Already signed in
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            Redirecting you…
          </p>
        </div>
      </div>
    );
  }

  /* ── Sign-in form ── */
  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--text-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 10,
          }}
        >
          Singularity AIDR
        </div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 600,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: 6,
          }}
        >
          Welcome back
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: "22px" }}>
          Sign in to manage your AI agent protection.
        </p>
      </div>

      {/* Google button */}
      <button
        type="button"
        disabled={busy}
        onClick={handleGoogleSignIn}
        style={{
          ...btnPrimary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          opacity: busy ? 0.6 : 1,
        }}
      >
        <GoogleIcon />
        Continue with Google
      </button>

      {/* GitHub button */}
      <button
        type="button"
        disabled={busy}
        onClick={handleGitHubSignIn}
        style={{
          ...btnSecondary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          marginTop: 10,
          opacity: busy ? 0.6 : 1,
        }}
      >
        <GitHubIcon />
        Continue with GitHub
      </button>

      {/* Divider */}
      <div style={dividerStyle}>
        <div style={dividerLineStyle} />
        <span>or use email</span>
        <div style={dividerLineStyle} />
      </div>

      {/* Email field */}
      <div style={{ marginBottom: 14 }}>
        <label htmlFor="email" style={labelStyle}>Email address</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--text-faint)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--panel-border)";
          }}
        />
      </div>

      {/* CAPTCHA - Bot Protection */}
      <Turnstile 
        onVerify={handleCaptchaVerify} 
        onError={handleCaptchaError}
      />

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
        <button
          type="button"
          disabled={busy || !trimmedEmail || !captchaVerified}
          onClick={handleMagicLink}
          style={{
            ...btnSecondary,
            flex: 1,
            opacity: busy || !trimmedEmail || !captchaVerified ? 0.45 : 1,
          }}
        >
          Send magic link
        </button>
        <button
          type="button"
          onClick={handleCheckSignedIn}
          style={{ ...btnGhost, flex: 1 }}
        >
          I&apos;m signed in
        </button>
      </div>

      {/* Status message */}
      {status && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: 10,
            background: status.includes("sent")
              ? "rgba(34,197,94,0.08)"
              : "rgba(239,68,68,0.08)",
            border: status.includes("sent")
              ? "1px solid rgba(34,197,94,0.2)"
              : "1px solid rgba(239,68,68,0.2)",
            color: status.includes("sent")
              ? "rgb(34,197,94)"
              : "rgb(239,68,68)",
            fontSize: 13,
            lineHeight: "20px",
          }}
        >
          {status}
        </div>
      )}

      {/* Back link */}
      <div style={{ marginTop: 24, textAlign: "center" }}>
        <Link
          href="/"
          style={{
            color: "var(--text-faint)",
            textDecoration: "none",
            fontSize: 13,
            transition: "color 0.2s",
          }}
        >
          ← Back to home
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div style={cardStyle}>
          <div style={{ color: "var(--text-faint)", textAlign: "center", padding: "20px 0" }}>
            Loading…
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
