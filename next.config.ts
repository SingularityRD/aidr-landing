import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

// Content-Security-Policy is set per request (with a script nonce) in src/proxy.ts; see src/lib/csp.ts.

const nextConfig: NextConfig = {
	allowedDevOrigins: ["127.0.0.1", "localhost"],
	// The onboarding smoke test builds a demo-flavoured bundle into its own directory so it can
	// never overwrite (or be mistaken for) the real production build in .next.
	distDir: process.env.NEXT_DIST_DIR || ".next",
	poweredByHeader: false,
	async headers() {
		const headers = [
			{ key: "X-Content-Type-Options", value: "nosniff" },
			{ key: "X-Frame-Options", value: "DENY" },
			// The legacy XSS auditor is removed from browsers and can itself introduce issues; CSP is the control.
			{ key: "X-XSS-Protection", value: "0" },
			{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
			{
				key: "Permissions-Policy",
				value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
			},
			// Allow the sign-in popups used by Clerk's social providers while isolating the page otherwise.
			{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
			{ key: "X-Permitted-Cross-Domain-Policies", value: "none" },
			...(isProduction
				? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
				: []),
		];
		return [{ source: "/:path*", headers }];
	},
	async redirects() {
		return [{ source: "/security.txt", destination: "/.well-known/security.txt", permanent: true }];
	},
	turbopack: {
		root: __dirname,
	},
	experimental: {
		optimizePackageImports: ["@mui/material", "@mui/icons-material"],
	},
};

export default withSentryConfig(nextConfig, {
	// For all available options, see:
	// https://www.npmjs.com/package/@sentry/webpack-plugin#options

	org: process.env.SENTRY_ORG,
	project: process.env.SENTRY_PROJECT,

	// Only print logs for uploading source maps in CI
	silent: !process.env.CI,

	// Upload a larger set of source maps for prettier stack traces (increases build time)
	widenClientFileUpload: true,

	webpack: {
		treeshake: {
			// Automatically tree-shake Sentry logger statements to reduce bundle size.
			removeDebugLogging: true,
		},
		// Enables automatic instrumentation of Vercel Cron Monitors.
		automaticVercelMonitors: true,
	},
});
