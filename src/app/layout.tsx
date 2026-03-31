import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare, GeistPixelLine } from "geist/font/pixel";
import Script from "next/script";
import { ThemeProvider } from "../components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Singularity AIDR // AI Agent Detection & Response",
  description:
    "Managed-first, edge-first AI Agent Detection & Response with prompt-install onboarding, auth-first protection, and launch-ready waitlist/demo/pilot flows.",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          src="/unregister-sw.js"
          strategy="beforeInteractive"
        />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable} ${GeistPixelLine.variable} ${GeistPixelSquare.className}`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
