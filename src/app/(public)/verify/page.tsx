"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "../../../lib/supabase/client";

export const dynamic = "force-dynamic";

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = (searchParams.get("code") ?? "").trim();

  const [userCode, setUserCode] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = getSupabaseBrowserClient();
      const sessRes = await supabase.auth.getSession();
      if (!cancelled) setHasSession(Boolean(sessRes.data.session));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmed = useMemo(() => userCode.trim().toUpperCase(), [userCode]);

  return (
    <div className="stack">
      <div className="card">
        <h1>Authorize device</h1>
        <p className="muted">
          Enter the short code shown by your agent runtime. This links your local installation to
          your account.
        </p>

        <label className="label">
          Code
          <input
            className="input mono"
            value={userCode}
            onChange={(e) => setUserCode(e.target.value)}
            placeholder="ABCD-EFGH"
            autoCapitalize="characters"
            autoCorrect="off"
          />
        </label>

        <div className="row">
          <button
            className="button"
            type="button"
            disabled={busy || !trimmed}
            onClick={async () => {
              setBusy(true);
              setError(null);
              setOk(false);
              try {
                const supabase = getSupabaseBrowserClient();
                const sessRes = await supabase.auth.getSession();
                const sess = sessRes.data.session;
                if (!sess) {
                  const rt = `/verify?code=${encodeURIComponent(trimmed)}`;
                  router.push(`/login?returnTo=${encodeURIComponent(rt)}`);
                  return;
                }

                const res = await supabase.functions.invoke("device-verify", {
                  method: "POST",
                  body: { user_code: trimmed },
                });
                if (res.error) {
                  setError(res.error.message);
                  return;
                }
                const data = (res.data ?? {}) as Record<string, unknown>;
                if (data.ok === true) setOk(true);
                else setError("Verification failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Authorize
          </button>

          {hasSession ? null : (
            <Link className="button button-secondary" href="/login?returnTo=/verify">
              Sign in
            </Link>
          )}
        </div>

        {ok ? (
          <div className="notice">
            <div>
              <b>Authorized.</b> Return to your agent. It should complete enrollment automatically.
            </div>
            <div className="muted small" style={{ marginTop: 8 }}>
              If you haven&apos;t been approved for the pilot yet, authorization may be blocked.
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <Link className="button button-secondary" href="/pilot">
                View pilot status
              </Link>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="notice notice-danger">
            <div className="mono">{error}</div>
            <div className="muted small" style={{ marginTop: 8 }}>
              Need access? Apply for the pilot.
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <Link className="button button-secondary" href="/pilot">
                Request pilot
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="card"><div className="muted">Loading...</div></div>}>
      <VerifyForm />
    </Suspense>
  );
}
