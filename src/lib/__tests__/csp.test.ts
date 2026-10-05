import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, clerkFrontendOrigin, generateNonce } from "../csp";

const clerkKey = `pk_test_${Buffer.from("clerk.example.accounts.dev$").toString("base64")}`;
const env = { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: clerkKey } as unknown as NodeJS.ProcessEnv;

function directive(csp: string, name: string) {
  return csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
}

describe("nonce CSP", () => {
  it("generates a fresh, HTML-safe nonce per call", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("script-src is nonce + strict-dynamic with no unsafe-inline (production)", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc123", isProduction: true, env });
    const script = directive(csp, "script-src");
    expect(script).toContain("'nonce-abc123'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(script).toContain("https://clerk.example.accounts.dev");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("allows unsafe-eval only outside production", () => {
    expect(directive(buildContentSecurityPolicy({ nonce: "n", isProduction: false, env }), "script-src")).toContain("'unsafe-eval'");
    expect(directive(buildContentSecurityPolicy({ nonce: "n", isProduction: true, env }), "script-src")).not.toContain("'unsafe-eval'");
  });

  it("derives the Clerk origin only from a well-formed publishable key", () => {
    expect(clerkFrontendOrigin(env)).toBe("https://clerk.example.accounts.dev");
    expect(clerkFrontendOrigin({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_!!!" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(clerkFrontendOrigin({} as NodeJS.ProcessEnv)).toBeNull();
  });
});
