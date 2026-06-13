import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare, GeistPixelLine } from "geist/font/pixel";
import { ClerkProvider } from "@clerk/nextjs";
import { DemoAuthProvider } from "../components/DemoAuthProvider";
import { ClerkToAuthBridge } from "../components/ClerkToAuthBridge";
import { isDemoMode } from "../lib/demo";
import { ThemeProvider } from "../components/ThemeProvider";
import Footer from "../components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Singularity AIDR // AI Agent Detection & Response",
    template: "%s // AIDR",
  },
  description:
    "AI Agent Detection & Response (AIDR). Protect your AI coding agents from prompt injection, malicious commands, and supply chain attacks. 1 agent free forever. Supports Claude Code, Cursor, VS Code, OpenClaw, and OpenCode.",
  keywords: [
    "AI security", "agent detection", "AI agent protection", "prompt injection prevention",
    "supply chain security", "Claude Code security", "AI guardrails", "MLsec",
    "Singularity AIDR", "AI Agent Detection Response",
  ],
  authors: [{ name: "Singularity Research & Development" }],
  icons: {
    icon: "/icon.png",
  },
  openGraph: {
    title: "Singularity AIDR — AI Agent Detection & Response",
    description: "Edge-first security layer for AI coding agents. Install by prompt, protect in minutes. 1 agent free.",
    type: "website",
    siteName: "Singularity AIDR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Singularity AIDR — AI Agent Detection & Response",
    description: "Edge-first security layer for AI coding agents. Install by prompt, protect in minutes. 1 agent free.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const enforceProductionKeys =
    process.env.NODE_ENV === "production" &&
    (process.env.AIDR_ENFORCE_PROD_KEYS === "1" || process.env.VERCEL_ENV === "production");

  if (enforceProductionKeys) {
    const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
    const secretKey = process.env.CLERK_SECRET_KEY?.trim() ?? "";
    if (!publishableKey) {
      throw new Error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in production.");
    }
    if (!secretKey) {
      throw new Error("Missing CLERK_SECRET_KEY in production.");
    }
    if (publishableKey.startsWith("pk_test_")) {
      throw new Error("Production cannot run with a Clerk test publishable key.");
    }
    if (secretKey.startsWith("sk_test_")) {
      throw new Error("Production cannot run with a Clerk test secret key.");
    }
  }

  const demo = isDemoMode();

  const body = (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable} ${GeistPixelLine.variable} ${GeistPixelSquare.className}`}
      >
        <ThemeProvider>
          {children}
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );

  if (demo) {
    return <DemoAuthProvider>{body}</DemoAuthProvider>;
  }

  return (
    <ClerkProvider>
      <ClerkToAuthBridge>{body}</ClerkToAuthBridge>
    </ClerkProvider>
  );
}
