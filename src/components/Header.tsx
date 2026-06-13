"use client";

import Link from "next/link";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { useSmartUser } from "../hooks/useSmartUser";
import { isDemoMode } from "../lib/demo";

export default function Header() {
  const { isSignedIn, isLoaded } = useSmartUser();
  const demo = isDemoMode();

  return (
    <nav
      className="nav-bar flex justify-between items-center"
      style={{
        padding: "18px 24px",
        zIndex: 10,
        position: "sticky",
        top: 0,
        background: "var(--nav-bg)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--footer-border)",
      }}
    >
      <Link
        href="/"
        style={{
          fontSize: 22,
          fontWeight: 600,
          lineHeight: "28px",
          color: "var(--text-primary)",
          textDecoration: "none",
          letterSpacing: "-0.02em",
        }}
      >
        AIDR
      </Link>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
        <Link href="/#pricing" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: 14 }}>
          Pricing
        </Link>
        <Link href="/#features" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: 14 }}>
          Features
        </Link>
        <Link href="/compare" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: 14 }}>
          Compare
        </Link>

        {isLoaded && isSignedIn ? (
          <>
            <Link
              href="/dashboard"
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid var(--panel-border)",
                color: "var(--text-primary)",
                textDecoration: "none",
                background: "var(--toggle-bg)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Dashboard
            </Link>
            {demo ? (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #3862e8, #764ba2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: 12,
                  fontWeight: 600,
                }}
                title="Demo User"
              >
                D
              </div>
            ) : (
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: { width: 32, height: 32 },
                  },
                }}
              />
            )}
          </>
        ) : (
          demo ? (
            <Link
              href="/login"
              style={{
                padding: "8px 14px",
                borderRadius: 12,
                border: "1px solid var(--text-primary)",
                background: "var(--text-primary)",
                color: "var(--bg-primary)",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Sign in
            </Link>
          ) : (
            <SignInButton mode="modal">
              <button
                style={{
                  padding: "8px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--text-primary)",
                  background: "var(--text-primary)",
                  color: "var(--bg-primary)",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Sign in
              </button>
            </SignInButton>
          )
        )}
      </div>
    </nav>
  );
}
