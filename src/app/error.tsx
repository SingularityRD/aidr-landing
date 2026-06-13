"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div style={{ padding: 40, maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
      <div
        style={{
          border: "1px solid var(--panel-border)",
          borderRadius: 18,
          background: "var(--panel-bg)",
          padding: 32,
          boxShadow: "0 12px 36px var(--shadow-color)",
        }}
      >
        <h2 style={{ color: "var(--text-primary)", fontSize: 24, marginBottom: 12 }}>
          Something went wrong
        </h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>{error.message}</p>
        <button
          onClick={reset}
          style={{
            padding: "10px 18px",
            borderRadius: 12,
            border: "1px solid var(--text-primary)",
            background: "var(--text-primary)",
            color: "var(--bg-primary)",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
