import * as Sentry from "@sentry/nextjs";

Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

	// Server diagnostics are only active when a DSN is configured.
	sendDefaultPii: false,

	// Keep trace volume low; raise deliberately if performance monitoring is needed.
	tracesSampleRate: 0.1,
});
