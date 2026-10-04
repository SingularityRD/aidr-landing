import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Page chrome (header with Clerk widgets, animated background) is tested in the browser smoke run.
vi.mock("@/components/site/PageShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/lib/firebase/admin", () => ({ adminDb: {}, firebaseAdminEnvError: "not configured in tests" }));
vi.mock("@/lib/site/health", async () => ({
  getReadiness: async () => ({
    status: "not_ready",
    service: "aidr-landing",
    release: "unknown",
    time: "2026-10-05T00:00:00.000Z",
    checks: {
      database: { status: "not_configured", required: true, reason: "credentials_missing" },
      billing_config: { status: "not_configured", required: false, reason: "polar_not_configured" },
    },
  }),
}));

type PageModule = { default: (props?: never) => ReactElement | Promise<ReactElement>; metadata?: { alternates?: { canonical?: string }; title?: unknown } };

const PAGES: Array<{ path: string; load: () => Promise<PageModule>; h1: RegExp }> = [
  { path: "/", load: () => import("@/app/page") as Promise<PageModule>, h1: /detection layer/i },
  { path: "/pricing", load: () => import("@/app/(public)/pricing/page") as Promise<PageModule>, h1: /14 days/i },
  { path: "/enterprise", load: () => import("@/app/(public)/enterprise/page") as Promise<PageModule>, h1: /Enterprise/i },
  { path: "/install", load: () => import("@/app/(public)/install/page") as Promise<PageModule>, h1: /Install/i },
  { path: "/security", load: () => import("@/app/(public)/security/page") as Promise<PageModule>, h1: /Security overview/i },
  { path: "/trust", load: () => import("@/app/(public)/trust/page") as Promise<PageModule>, h1: /Trust center/i },
  { path: "/privacy", load: () => import("@/app/(public)/privacy/page") as Promise<PageModule>, h1: /Privacy/i },
  { path: "/terms", load: () => import("@/app/(public)/terms/page") as Promise<PageModule>, h1: /Terms/i },
  { path: "/dpa", load: () => import("@/app/(public)/dpa/page") as Promise<PageModule>, h1: /Data Processing Addendum/i },
  { path: "/support", load: () => import("@/app/(public)/support/page") as Promise<PageModule>, h1: /Support/i },
  { path: "/status", load: () => import("@/app/(public)/status/page") as Promise<PageModule>, h1: /Service status/i },
  { path: "/compare", load: () => import("@/app/(public)/compare/page") as Promise<PageModule>, h1: /Where AIDR fits/i },
];

const PLACEHOLDER = /lorem ipsum|coming soon|placeholder|example\.com|hello@|sales@|@singularityrd\.com|not configured\. add|\bundefined\b|\[object Object\]/i;
const LEFTOVER_MARKERS = /\bTODO\b|\bTBA\b|\bFIXME\b|\bNaN\b/;

async function render(entry: (typeof PAGES)[number]): Promise<string> {
  const mod = await entry.load();
  const element = await mod.default();
  return renderToStaticMarkup(element);
}

describe("public pages render real content", () => {
  for (const entry of PAGES) {
    it(`${entry.path} renders a single h1, no placeholder text and a canonical URL`, async () => {
      const html = await render(entry);
      expect(html.match(/<h1[ >]/g)?.length ?? 0, "exactly one h1").toBe(1);
      expect(html).toMatch(entry.h1);
      // Compare against visible text only, so identifiers inside attributes do not trip the check.
      const text = html.replace(/<[^>]+>/g, " ");
      expect(text).not.toMatch(PLACEHOLDER);
      expect(text).not.toMatch(LEFTOVER_MARKERS);
      expect(text.length).toBeGreaterThan(600);
      if (entry.path !== "/") {
        const mod = await entry.load();
        expect(mod.metadata?.alternates?.canonical).toBe(entry.path);
      }
    });
  }

  it("/contact renders the form with labelled fields, a honeypot and a consent checkbox", async () => {
    const { default: ContactPage } = await import("@/app/(public)/contact/page");
    const element = await ContactPage({ searchParams: Promise.resolve({ topic: "pilot" }) });
    const html = renderToStaticMarkup(element);
    expect(html).toMatch(/<h1[^>]*>Talk to us/);
    expect(html).toContain('name="website"');
    expect(html).toMatch(/<label[^>]*>Work email<\/label>/);
    expect(html).toContain('type="checkbox"');
    expect(html).toMatch(/<option value="pilot" selected/);
    // No mailbox is shown unless the owner configures one.
    expect(html).not.toMatch(/mailto:/);
  });
});

describe("legal pages carry the draft marker", () => {
  for (const path of ["/privacy", "/terms", "/dpa"]) {
    it(`${path} shows 'Draft pending legal review' and a TBD effective date`, async () => {
      const entry = PAGES.find((p) => p.path === path)!;
      const html = await render(entry);
      expect(html).toContain("Draft pending legal review");
      expect(html).toContain("effective date TBD");
      expect(html).toMatch(/Effective date: TBD/);
      expect(html).toContain('data-legal-draft="true"');
    });
  }

  it("the banner and TBD label disappear when the single constant is flipped", async () => {
    vi.resetModules();
    vi.doMock("@/lib/site/config", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/lib/site/config")>();
      return { ...original, LEGAL_DRAFT_PENDING_REVIEW: false, LEGAL_EFFECTIVE_DATE: "2026-11-01" };
    });
    const { LegalDraftBanner, LegalMeta } = await import("@/components/site/LegalDraft");
    expect(renderToStaticMarkup(createElement(LegalDraftBanner))).toBe("");
    expect(renderToStaticMarkup(createElement(LegalMeta))).toContain("2026-11-01");
    vi.doUnmock("@/lib/site/config");
    vi.resetModules();
  });
});

describe("honest assurance and offer statements", () => {
  it("/trust says SOC 2, ISO 27001 and penetration testing are not in place", async () => {
    const html = await render(PAGES.find((p) => p.path === "/trust")!);
    expect(html).toMatch(/SOC 2 attestation report[\s\S]{0,200}Not yet/);
    expect(html).toMatch(/ISO\/IEC 27001 certificate[\s\S]{0,200}Not yet/);
    expect(html).toMatch(/Independent penetration test[\s\S]{0,200}Open/);
  });

  it("/pricing states the 14-day, 1-agent evaluation and approved-order pricing", async () => {
    const html = await render(PAGES.find((p) => p.path === "/pricing")!);
    expect(html).toMatch(/14 days and 1 protected agent/);
    expect(html).toMatch(/set by approved order/);
    expect(html).not.toMatch(/\$\d/);
  });

  it("/support marks every unapproved value as requiring owner approval", async () => {
    const html = await render(PAGES.find((p) => p.path === "/support")!);
    expect((html.match(/Requires owner approval/g) ?? []).length).toBeGreaterThanOrEqual(10);
    expect(html).toMatch(/not an SLA/i);
  });

  it("/enterprise labels each capability as implemented, partial or roadmap", async () => {
    const html = await render(PAGES.find((p) => p.path === "/enterprise")!);
    for (const label of ["Implemented", "Partial", "Roadmap"]) expect(html).toContain(label);
    expect(html).toMatch(/Single sign-on \(SSO\)/);
    expect(html).toMatch(/SCIM/);
    expect(html).toMatch(/Air-gapped operation/);
  });

  it("/install lists known limits for all five connectors and not for Codex", async () => {
    const html = await render(PAGES.find((p) => p.path === "/install")!);
    for (const name of ["Claude Code", "Cursor", "VS Code", "OpenClaw", "OpenCode"]) expect(html).toContain(name);
    expect(html).toContain("Known limits");
    expect(html).toMatch(/Real-host acceptance is not complete/);
  });

  it("/security lists the real subprocessors", async () => {
    const html = await render(PAGES.find((p) => p.path === "/security")!);
    for (const name of ["Clerk", "Firebase / Cloud Firestore", "Polar", "Sentry", "Cloudflare Turnstile"]) {
      expect(html).toContain(name);
    }
    expect(html).toContain("security.txt");
  });

  it("/status renders the readiness checks it was given", async () => {
    const html = await render(PAGES.find((p) => p.path === "/status")!);
    expect(html).toContain("Not configured");
    expect(html).toContain("credentials_missing");
    expect(html).toContain("/api/health");
    expect(html).toContain("/api/ready");
  });
});
