"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getFirebaseBrowserClient } from "@/lib/firebase/database-client";

export const dynamic = "force-dynamic";

function panelStyle(): React.CSSProperties {
  return {
    border: "1px solid var(--panel-border)",
    borderRadius: 18,
    background: "var(--panel-bg)",
    boxShadow: "0 12px 36px var(--shadow-color)",
  };
}

function VerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCode = (searchParams.get("code") ?? "").trim().toUpperCase();

  const [sessionReady, setSessionReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const returnTo = useMemo(() => {
    return code ? `/verify?code=${encodeURIComponent(code)}` : "/verify";
  }, [code]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const session = await getSession();
      if (cancelled) return;
      setIsAuthed(Boolean(session?.user));
      setSessionReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function approve() {
    setBusy(true);
    setStatus(null);
    try {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed) {
        setStatus("Enter your code first.");
        return;
      }

      const firebase = getFirebaseBrowserClient();
      const res = await firebase.functions.invoke("device-verify", {
        method: "POST",
        body: { user_code: trimmed },
      });
      if (res.error) {
        setStatus(res.error.message);
        return;
      }

      setStatus("Approved. Redirecting to the dashboard…");
      window.setTimeout(() => router.push("/dashboard"), 450);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 20px" }}>
      <section style={{ ...panelStyle(), padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 700 }}>
            <div style={{ color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em" }}>DEVICE VERIFICATION</div>
            <h1 style={{ margin: "10px 0 10px", fontSize: 36, lineHeight: "42px", color: "var(--text-primary)" }}>
              Approve one short code, then let the agent enroll itself.
            </h1>
            <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: "26px" }}>
              This screen links the runtime installation to your Firebase account. Once approved, AIDR
              will mint an enrollment token and the dashboard will show the agent as pending.
            </p>
          </div>
          <div
            style={{
              minWidth: 240,
              padding: 16,
              borderRadius: 16,
              border: "1px solid var(--panel-border)",
              background: "linear-gradient(180deg, rgba(56,98,232,0.10), rgba(56,98,232,0.03))",
            }}
          >
            <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Step</div>
            <div style={{ marginTop: 6, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
              Sign in, approve, and return to the dashboard
            </div>
            <div style={{ marginTop: 10, color: "var(--text-faint)", fontSize: 12, lineHeight: "20px" }}>
              The approval code is single-use and short-lived for safer device binding.
            </div>
          </div>
        </div>

        {!sessionReady ? (
          <div style={{ marginTop: 18, color: "var(--text-secondary)" }}>Checking sign-in status…</div>
        ) : isAuthed ? (
          <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
            <div>
              <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Code</div>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD-EFGH"
                className="mono"
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--panel-border)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  fontSize: 16,
                  letterSpacing: "0.04em",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={busy}
                onClick={approve}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--text-primary)",
                  background: "var(--text-primary)",
                  color: "var(--bg-primary)",
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                Approve code
              </button>
              <Link
                href="/agents"
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--panel-border)",
                  color: "var(--text-primary)",
                  textDecoration: "none",
                }}
              >
                Go to agents
              </Link>
            </div>

            {status ? (
              <div
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid var(--panel-border)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                }}
              >
                <div className="mono">{status}</div>
              </div>
            ) : null}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              {[
                "The code is printed by the agent runtime.",
                "Approval creates the enrollment artifact.",
                "Dashboard updates to pending, then connected.",
              ].map((item, index) => (
                <div
                  key={item}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid var(--panel-border)",
                    background: "var(--bg-secondary)",
                  }}
                >
                  <div style={{ color: "var(--text-faint)", fontSize: 12 }}>0{index + 1}</div>
                  <div style={{ marginTop: 6, color: "var(--text-primary)", lineHeight: "22px" }}>{item}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 18, ...panelStyle(), padding: 18 }}>
            <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Status</div>
            <div style={{ marginTop: 6, color: "var(--text-primary)", fontWeight: 600 }}>Not signed in</div>
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link
                href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--text-primary)",
                  background: "var(--text-primary)",
                  color: "var(--bg-primary)",
                  textDecoration: "none",
                }}
              >
                Sign in to approve
              </Link>
              <Link
                href="/"
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--panel-border)",
                  color: "var(--text-secondary)",
                  textDecoration: "none",
                }}
              >
                Back to home
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
          <div style={panelStyle()}>
            <div style={{ padding: 28, color: "var(--text-secondary)" }}>Loading verify screen…</div>
          </div>
        </div>
      }
    >
      <VerifyInner />
    </Suspense>
  );
}
