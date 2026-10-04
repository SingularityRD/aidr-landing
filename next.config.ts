import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/** Clerk's frontend API host is encoded in the publishable key (base64 of "<host>$"). */
function clerkFrontendOrigin(): string | null {
	const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
	const match = /^pk_(?:test|live)_(.+)$/.exec(key);
	if (!match) return null;
	try {
		const host = Buffer.from(match[1], "base64").toString("utf8").replace(/\$+$/, "");
		return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? `https://${host}` : null;
	} catch {
		return null;
	}
}

/** Origin of the configured Sentry DSN, so a custom ingest host is allowed without opening up wildcards. */
function sentryIngestOrigin(): string | null {
	const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
	if (!dsn) return null;
	try {
		return new URL(dsn).origin;
	} catch {
		return null;
	}
}

function buildContentSecurityPolicy(): string {
	const clerk = clerkFrontendOrigin();
	const sentry = sentryIngestOrigin();
	const unique = (values: Array<string | null | false>) => Array.from(new Set(values.filter(Boolean) as string[]));

	// 'unsafe-inline' for scripts is still required by the framework's inline bootstrap and Clerk;
	// a nonce-based policy is a planned hardening step. 'unsafe-eval' is development-only (React refresh).
	const scriptSrc = unique([
		`'self'`,
		`'unsafe-inline'`,
		!isProduction && `'unsafe-eval'`,
		"https://challenges.cloudflare.com",
		"https://*.clerk.accounts.dev",
		clerk,
	]);
	const connectSrc = unique([
		`'self'`,
		"https://*.clerk.accounts.dev",
		"https://clerk-telemetry.com",
		clerk,
		"https://*.ingest.sentry.io",
		"https://*.ingest.us.sentry.io",
		"https://*.ingest.de.sentry.io",
		sentry,
		"https://firestore.googleapis.com",
		"https://identitytoolkit.googleapis.com",
		"https://securetoken.googleapis.com",
		!isProduction && "ws://localhost:*",
		!isProduction && "ws://127.0.0.1:*",
	]);
	const frameSrc = unique([`'self'`, "https://challenges.cloudflare.com", "https://*.clerk.accounts.dev", clerk]);

	const directives = [
		`default-src 'self'`,
		`script-src ${scriptSrc.join(" ")}`,
		`style-src 'self' 'unsafe-inline'`,
		`frame-src ${frameSrc.join(" ")}`,
		`connect-src ${connectSrc.join(" ")}`,
		`img-src 'self' data: blob: https://img.clerk.com https://*.clerk.com`,
		`font-src 'self' data:`,
		`worker-src 'self' blob:`,
		`manifest-src 'self'`,
		`base-uri 'self'`,
		`form-action 'self'`,
		`frame-ancestors 'none'`,
		`object-src 'none'`,
	];
	if (isProduction) directives.push("upgrade-insecure-requests");
	return directives.join("; ");
}

const nextConfig: NextConfig = {
	allowedDevOrigins: ["127.0.0.1", "localhost"],
	// The onboarding smoke test builds a demo-flavoured bundle into its own directory so it can
	// never overwrite (or be mistaken for) the real production build in .next.
	distDir: process.env.NEXT_DIST_DIR || ".next",
	poweredByHeader: false,
	async headers() {
		const headers = [
			{ key: "Content-Security-Policy", value: buildContentSecurityPolicy() },
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
