"use client";

import Link from "next/link";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { useSmartUser } from "../hooks/useSmartUser";
import { isDemoMode } from "../lib/demo";
import { useAuthAvailable } from "./DemoAuthProvider";

const navLinks = [
  { href: "/#features", label: "Product" },
  { href: "/enterprise", label: "Enterprise" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
  { href: "/trust", label: "Trust" },
  { href: "/install", label: "Install" },
  { href: "/support", label: "Support" },
  { href: "/contact", label: "Contact" },
];

const signInStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 12,
  border: "1px solid var(--text-primary)",
  background: "var(--text-primary)",
  color: "var(--bg-primary)",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  textDecoration: "none",
  textShadow: "none",
};

export default function Header() {
  const { isSignedIn, isLoaded } = useSmartUser();
  const demo = isDemoMode();
  const authAvailable = useAuthAvailable();

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-brand" aria-label="Singularity AIDR home">
          AIDR
        </Link>
        <nav className="site-nav" aria-label="Primary">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="nav-link">
              {link.label}
            </Link>
          ))}

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
                  role="img"
                  aria-label="Demo user"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "#3047b0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
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
          ) : demo || !authAvailable ? (
            <Link href="/login" style={signInStyle}>
              Sign in
            </Link>
          ) : (
            <SignInButton mode="modal">
              <button type="button" style={signInStyle}>
                Sign in
              </button>
            </SignInButton>
          )}
        </nav>
      </div>
    </header>
  );
}
