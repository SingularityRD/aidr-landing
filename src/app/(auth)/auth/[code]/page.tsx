"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSmartUser } from "@/hooks/useSmartUser";

export default function AuthCodePage() {
  const { user, isLoaded } = useSmartUser();
  const router = useRouter();
  const params = useParams();
  const code = (params.code as string)?.toUpperCase();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!isLoaded || !code) return;
    if (!user) {
      // Redirect to login with returnTo
      router.push(`/login?returnTo=${encodeURIComponent(`/auth/${code}`)}`);
    }
  }, [isLoaded, user, code, router]);

  async function authorize() {
    if (!code) return;
    setStatus("loading");
    try {
      // Validate install code first (prevents replay / expired codes)
      const validateRes = await fetch("/api/v1/install-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, action: "validate" }),
      });
      const validateData = await validateRes.json();
      if (!validateRes.ok || !validateData.valid) {
        throw new Error(validateData.error || "Invalid, expired, or already used code.");
      }

      const res = await fetch("/api/v1/device-verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_code: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authorization failed");
      }

      // Mark install code as consumed so it cannot be reused
      await fetch("/api/v1/install-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, action: "consume" }),
      });

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
    }
  }

  if (status === "loading" || !isLoaded) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--text-faint)", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (!code) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h1 style={{ color: "var(--text-primary)", fontSize: 24, marginBottom: 8 }}>Authorization Error</h1>
          <p style={{ color: "var(--text-secondary)", lineHeight: "24px" }}>Invalid authorization code.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--text-faint)", fontSize: 14 }}>Redirecting to sign in…</div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <h1 style={{ color: "var(--text-primary)", fontSize: 24, marginBottom: 8 }}>Agent Authorized</h1>
          <p style={{ color: "var(--text-secondary)", lineHeight: "24px" }}>
            Your AI agent is now protected by AIDR. Return to your agent — it should be connected.
          </p>
          <a
            href="/onboarding"
            style={{
              display: "inline-block",
              marginTop: 20,
              padding: "10px 20px",
              borderRadius: 10,
              background: "#3862e8",
              color: "white",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Go to Dashboard →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div
        style={{
          border: "1px solid var(--panel-border)",
          borderRadius: 18,
          background: "var(--panel-bg)",
          boxShadow: "0 12px 36px var(--shadow-color)",
          padding: 32,
          maxWidth: 420,
          width: "100%",
        }}
      >
        <div style={{ color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em", marginBottom: 8 }}>
          AUTHORIZE AGENT
        </div>
        <h1 style={{ fontSize: 22, color: "var(--text-primary)", marginBottom: 12 }}>
          Secure a New Agent
        </h1>

        {errorMsg && (
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#ef4444",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}

        <div style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: "24px", marginBottom: 20 }}>
          Authorize agent installation with code: <b className="mono">{code}</b>
          <br />
          <br />
          This links the agent to your account ({user?.email}).
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={authorize}
            style={{
              flex: 1,
              padding: "12px 20px",
              borderRadius: 10,
              border: "none",
              background: "#3862e8",
              color: "white",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            ✅ Authorize Agent
          </button>
          <a
            href="/onboarding"
            style={{
              padding: "12px 20px",
              borderRadius: 10,
              border: "1px solid var(--panel-border)",
              background: "transparent",
              color: "var(--text-secondary)",
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Cancel
          </a>
        </div>
      </div>
    </div>
  );
}
