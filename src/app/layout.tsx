import type { Metadata } from "next";
import { connection } from "next/server";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare, GeistPixelLine } from "geist/font/pixel";
import { ClerkProvider } from "@clerk/nextjs";
import { AuthAvailableProvider, DemoAuthProvider } from "../components/DemoAuthProvider";
import { ClerkToAuthBridge } from "../components/ClerkToAuthBridge";
import { isDemoMode } from "../lib/demo";
import { clerkServerConfigured } from "../lib/clerk-config";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Every page is rendered per request: the CSP nonce (src/proxy.ts) must be stamped onto each response's
  // inline scripts, which a prerendered page cannot do.
  await connection();

  const demo = isDemoMode();
  const clerkReady = !demo && clerkServerConfigured();
  if (!demo && !clerkReady) {
    // Sign-in and protected routes are disabled (see src/proxy.ts); the public site keeps serving.
    console.error("Clerk is not configured for this deployment: sign-in and app routes are disabled.");
  }

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

  if (!clerkReady) {
    return body;
  }

  return (
    <ClerkProvider dynamic>
      <AuthAvailableProvider>
        <ClerkToAuthBridge>{body}</ClerkToAuthBridge>
      </AuthAvailableProvider>
    </ClerkProvider>
  );
}
