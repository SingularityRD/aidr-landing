"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  disableClientDiagnostics,
  initClientDiagnosticsIfConsented,
  readConsent,
  writeConsent,
  type DiagnosticsConsent,
} from "@/lib/diagnostics";

export const OPEN_PRIVACY_SETTINGS_EVENT = "aidr:open-privacy-settings";

/**
 * Privacy notice with equal-weight choices. Defaults to NO optional tracking:
 * until a visitor clicks "Allow diagnostics", no diagnostics leave the browser.
 * Only essential storage is used otherwise (sign-in session, theme preference).
 */
export default function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<DiagnosticsConsent | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    // Reading localStorage is only possible after mount.
    const stored = readConsent();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrent(stored);
    if (stored === null) setOpen(true);
    else void initClientDiagnosticsIfConsented();

    const reopen = () => {
      setCurrent(readConsent());
      setOpen(true);
    };
    window.addEventListener(OPEN_PRIVACY_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_PRIVACY_SETTINGS_EVENT, reopen);
  }, []);

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  function choose(value: DiagnosticsConsent) {
    writeConsent(value);
    setCurrent(value);
    setOpen(false);
    if (value === "granted") void initClientDiagnosticsIfConsented();
    else void disableClientDiagnostics();
  }

  if (!open) return null;

  return (
    <section className="consent-banner" role="region" aria-labelledby="consent-heading">
      <h2 id="consent-heading" ref={headingRef} tabIndex={-1} style={{ fontSize: 16, marginBottom: 6, color: "var(--text-primary)" }}>
        Privacy choices
      </h2>
      <p>
        This site uses only essential storage: your sign-in session and your light or dark theme. There is no advertising or
        analytics tracking. Optional error diagnostics (Sentry) stay <strong>off</strong> unless you allow them.
        {current === "granted" ? " Diagnostics are currently allowed." : null}{" "}
        <Link href="/privacy" className="text-link" style={{ textDecoration: "underline" }}>
          Read the privacy draft
        </Link>
        .
      </p>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={() => choose("denied")}>
          Keep diagnostics off
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => choose("granted")}>
          Allow diagnostics
        </button>
      </div>
    </section>
  );
}
