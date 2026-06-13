import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	allowedDevOrigins: ["127.0.0.1", "localhost"],
	async headers() {
		const csp = [
			`default-src 'self'`,
			`script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://*.clerk.accounts.dev https://*.ingest.sentry.io`,
			`style-src 'self' 'unsafe-inline'`,
			`frame-src 'self' https://challenges.cloudflare.com https://*.clerk.accounts.dev`,
			`connect-src 'self' https://*.clerk.accounts.dev https://*.ingest.sentry.io https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com`,
			`img-src 'self' data: blob: https://*.clerk.com`,
			`font-src 'self'`,
			`base-uri 'self'`,
			`form-action 'self'`,
			`object-src 'none'`,
		].join("; ");
		return [
			{
				source: "/(.*)",
				headers: [
					{ key: "Content-Security-Policy", value: csp },
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{ key: "X-Frame-Options", value: "DENY" },
					{ key: "X-XSS-Protection", value: "1; mode=block" },
					{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
					{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
				],
			},
		];
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
