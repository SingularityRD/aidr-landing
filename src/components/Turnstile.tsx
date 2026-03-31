"use client";

import { useEffect, useRef, useState } from "react";

interface TurnstileProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  siteKey?: string;
}

// Extend Window interface for Turnstile
declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: unknown) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export function Turnstile({ onVerify, onError, onExpire, siteKey }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const actualSiteKey = siteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!actualSiteKey) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    // Load Turnstile script
    const scriptId = "turnstile-script";
    if (document.getElementById(scriptId)) {
      renderTurnstile();
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => renderTurnstile();
    script.onerror = () => {
      setIsLoading(false);
      setHasError(true);
      onError?.();
    };
    document.head.appendChild(script);

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };

    function renderTurnstile() {
      if (!containerRef.current || !window.turnstile) return;

      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: actualSiteKey,
          callback: (token: string) => {
            setIsLoading(false);
            onVerify(token);
          },
          "error-callback": () => {
            setIsLoading(false);
            setHasError(true);
            onError?.();
          },
          "expired-callback": () => {
            onExpire?.();
          },
        });
      } catch {
        setIsLoading(false);
        setHasError(true);
        onError?.();
      }
    }
  }, [actualSiteKey, onVerify, onError, onExpire]);

  if (!actualSiteKey) {
    return (
      <div style={{ padding: 12, background: "#fef3c7", borderRadius: 8, fontSize: 12 }}>
        CAPTCHA not configured. Add NEXT_PUBLIC_TURNSTILE_SITE_KEY to enable bot protection.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16, marginBottom: 16 }}>
      {isLoading && (
        <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
          Loading CAPTCHA...
        </div>
      )}
      {hasError && (
        <div style={{ padding: 12, background: "#fee2e2", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>
          CAPTCHA failed to load. Please refresh the page.
        </div>
      )}
      <div ref={containerRef} style={{ display: isLoading || hasError ? "none" : "block" }} />
    </div>
  );
}

// Hook for managing Turnstile
export function useTurnstile() {
  const [token, setToken] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  const handleVerify = (newToken: string) => {
    setToken(newToken);
    setIsVerified(true);
  };

  const handleError = () => {
    setToken(null);
    setIsVerified(false);
  };

  const handleExpire = () => {
    setToken(null);
    setIsVerified(false);
  };

  const reset = () => {
    setToken(null);
    setIsVerified(false);
    // Turnstile widget will auto-reset on expire
  };

  return {
    token,
    isVerified,
    handleVerify,
    handleError,
    handleExpire,
    reset,
  };
}
