import { afterEach, describe, expect, it } from "vitest";
import {
	POST_AUTH_RETURN_TO_KEY,
	buildReturnToCookie,
	normalizeReturnTo,
	readCookieValue,
} from "../lib/auth/return-to-utils";
import {
	buildLocalDashboardAuthCallbackUrl,
	buildReturnToLocalCookie,
	POST_AUTH_RETURN_TO_LOCAL_KEY,
	POST_AUTH_RETURN_TO_LOCAL_PATH_KEY,
	buildReturnToLocalPathCookie,
	normalizeReturnToLocalOrigin,
	normalizeReturnToLocalPath,
	readReturnToLocalCookie,
	readReturnToLocalPathCookie,
} from "../lib/auth/return-to-local";
import {
	buildDashboardAuthCallbackUrl,
	buildDashboardLoginUrl,
	buildDashboardUrl,
	getDashboardBaseUrl,
} from "../lib/dashboard-url";

describe("Landing flow helpers", () => {
	const originalNodeEnv = process.env.NODE_ENV;
	const originalDashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL;
	const originalNoDashboard = process.env.NEXT_PUBLIC_AIDR_E2E_NO_DASHBOARD;

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;

		if (originalDashboardUrl === undefined) {
			delete process.env.NEXT_PUBLIC_DASHBOARD_URL;
		} else {
			process.env.NEXT_PUBLIC_DASHBOARD_URL = originalDashboardUrl;
		}

		if (originalNoDashboard === undefined) {
			delete process.env.NEXT_PUBLIC_AIDR_E2E_NO_DASHBOARD;
		} else {
			process.env.NEXT_PUBLIC_AIDR_E2E_NO_DASHBOARD = originalNoDashboard;
		}
	});

	it("normalizes only safe returnTo values", () => {
		expect(normalizeReturnTo("/verify?code=ABCD-EFGH")).toBe("/verify?code=ABCD-EFGH");
		expect(normalizeReturnTo("onboarding")).toBe("/onboarding");
		expect(normalizeReturnTo("//evil.example")).toBe("/onboarding");
		expect(normalizeReturnTo("", "/")).toBe("/");
	});

	it("normalizes only safe returnToLocal values", () => {
		expect(normalizeReturnToLocalOrigin("http://127.0.0.1:4173/")).toBe("http://127.0.0.1:4173");
		expect(normalizeReturnToLocalOrigin("https://localhost:4173/app/")).toBe("https://localhost:4173");
		expect(normalizeReturnToLocalOrigin("https://evil.example:4173/")).toBeNull();
		expect(normalizeReturnToLocalOrigin("http://0.0.0.0:5173/")).toBeNull();
		expect(normalizeReturnToLocalOrigin("/local")).toBeNull();
		expect(normalizeReturnToLocalOrigin("javascript:alert(1)")).toBeNull();
	});

	it("normalizes only safe returnToLocalPath values", () => {
		expect(normalizeReturnToLocalPath("/onboarding")).toBe("/onboarding");
		expect(normalizeReturnToLocalPath("/verify?code=ABCD-EFGH")).toBe("/verify?code=ABCD-EFGH");
		expect(normalizeReturnToLocalPath("onboarding")).toBeNull();
		expect(normalizeReturnToLocalPath("//evil.example")).toBeNull();
		expect(normalizeReturnToLocalPath("javascript:alert(1)")).toBeNull();
	});

	it("serializes and reads the post-auth redirect cookie", () => {
		const cookie = buildReturnToCookie("/verify?code=ABCD-EFGH");
		expect(cookie).toContain(POST_AUTH_RETURN_TO_KEY);
		expect(cookie).toContain("Path=/");
		expect(cookie).toContain("SameSite=Lax");
		expect(readCookieValue(cookie, POST_AUTH_RETURN_TO_KEY)).toBe("/verify?code=ABCD-EFGH");
	});

	it("serializes and reads the local dashboard redirect cookie", () => {
		const cookie = buildReturnToLocalCookie("http://127.0.0.1:4173/");
		expect(cookie).toContain(POST_AUTH_RETURN_TO_LOCAL_KEY);
		expect(cookie).toContain("Path=/");
		expect(cookie).toContain("SameSite=Lax");
		expect(readReturnToLocalCookie(cookie)).toBe("http://127.0.0.1:4173");
	});

	it("serializes and reads the local dashboard returnToLocalPath cookie", () => {
		const cookie = buildReturnToLocalPathCookie("/verify?code=ABCD-EFGH");
		expect(cookie).toContain(POST_AUTH_RETURN_TO_LOCAL_PATH_KEY);
		expect(cookie).toContain("Path=/");
		expect(cookie).toContain("SameSite=Lax");
		expect(readReturnToLocalPathCookie(cookie)).toBe("/verify?code=ABCD-EFGH");
	});

	it("uses the local dashboard URL in development when no env var is set", () => {
		process.env.NODE_ENV = "development";
		delete process.env.NEXT_PUBLIC_DASHBOARD_URL;

		expect(getDashboardBaseUrl()).toBe("http://127.0.0.1:5173");
		expect(buildDashboardUrl("/login")).toBe("http://127.0.0.1:5173/login");
		expect(buildDashboardLoginUrl()).toBe("http://127.0.0.1:5173/login");
	});

	it("disables dashboard handoff when production config is missing", () => {
		process.env.NODE_ENV = "production";
		delete process.env.NEXT_PUBLIC_DASHBOARD_URL;

		expect(getDashboardBaseUrl()).toBeNull();
		expect(buildDashboardUrl("/verify")).toBeNull();
		expect(
			buildDashboardAuthCallbackUrl(
				{ access_token: "access-token", refresh_token: "refresh-token" },
				"/onboarding",
			),
		).toBeNull();
	});

	it("builds the cross-app dashboard handoff URL with session tokens", () => {
		process.env.NODE_ENV = "development";
		process.env.NEXT_PUBLIC_DASHBOARD_URL = "https://dashboard.aidr.singularityrd.com/";

		const href = buildDashboardAuthCallbackUrl(
			{ access_token: "access-token", refresh_token: "refresh-token" },
			"/onboarding",
		);

		expect(href).toBe(
			"https://dashboard.aidr.singularityrd.com/auth/callback#access_token=access-token&refresh_token=refresh-token&returnTo=%2Fonboarding",
		);
	});

	it("builds the local dashboard handoff URL with session tokens", () => {
		const href = buildLocalDashboardAuthCallbackUrl(
			"http://127.0.0.1:4173/",
			{ access_token: "access-token", refresh_token: "refresh-token" },
			"/onboarding",
		);

		expect(href).toBe(
			"http://127.0.0.1:4173/auth/callback#access_token=access-token&refresh_token=refresh-token&returnTo=%2Fonboarding",
		);
	});
});
