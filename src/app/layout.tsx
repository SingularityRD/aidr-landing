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
import ConsentBanner from "../components/site/ConsentBanner";
import { COMPANY_NAME, SITE_NAME, getSiteUrl } from "../lib/site/config";
import "./globals.css";
import "./site.css";

const DESCRIPTION =
  "Singularity AIDR checks the tool calls of AI coding agents (shell commands, file operations, web requests, MCP calls) against detection rules and policy. Offered as a 14-day, 1-agent controlled evaluation.";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Singularity AIDR // AI Agent Detection & Response",
    template: "%s // AIDR",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "AI agent security",
    "agent detection and response",
    "AI coding agent",
    "prompt injection",
    "MCP security",
    "Claude Code",
    "Cursor",
    "VS Code",
  ],
  authors: [{ name: COMPANY_NAME }],
  icons: {
    icon: "/icon.png",
  },
  openGraph: {
    title: "Singularity AIDR // AI Agent Detection & Response",
    description: DESCRIPTION,
    type: "website",
    siteName: SITE_NAME,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Singularity AIDR // AI Agent Detection & Response",
    description: DESCRIPTION,
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
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <ThemeProvider>
          {children}
          <Footer />
          <ConsentBanner />
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
