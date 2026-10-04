import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { PUBLIC_ROUTES } from "@/lib/site/config";
import { publicCopyFiles, read, REPO_ROOT, routeExists, routeTable, walk, SRC } from "./helpers";

type Link = { file: string; target: string };

/** Literal internal links in JSX (`href="/x"`, `href: "/x"`, `redirect("/x")`). Template links with `${}` are checked by prefix. */
function extractInternalLinks(): Link[] {
  const links: Link[] = [];
  const patterns = [/href=(?:"|\{")(\/[^"]*)"/g, /href:\s*"(\/[^"]*)"/g, /redirect\("(\/[^"]*)"\)/g, /href=\{`(\/[^`]*)`\}/g];
  for (const file of publicCopyFiles()) {
    const source = read(file);
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        links.push({ file: relative(REPO_ROOT, file), target: match[1] });
      }
    }
  }
  return links;
}

function splitTarget(target: string) {
  const [beforeHash, hash = ""] = target.split("#");
  const [path, query = ""] = beforeHash.split("?");
  // Template links such as /install#${connector.id} are validated up to the template.
  const cleanPath = path.split("${")[0] || "/";
  return { path: cleanPath.length > 1 ? cleanPath.replace(/\/$/, "") : cleanPath, query, hash: hash.includes("${") ? "" : hash };
}

describe("internal links", () => {
  const table = routeTable();
  const links = extractInternalLinks();

  it("finds a meaningful number of links", () => {
    expect(links.length).toBeGreaterThan(40);
  });

  it("every internal link resolves to a page or route handler", () => {
    const broken = links
      .map((link) => ({ ...link, ...splitTarget(link.target) }))
      .filter((link) => !routeExists(link.path, table))
      .map((link) => `${link.file}: ${link.target}`);
    expect(broken).toEqual([]);
  });

  it("every in-page fragment exists as an id on the target page", () => {
    const allSource = walk(SRC).filter((f) => /\.(tsx|ts)$/.test(f)).map((f) => read(f));
    const missing: string[] = [];
    for (const link of links) {
      const { path, hash } = splitTarget(link.target);
      if (!hash) continue;
      const route = table.find((r) => r.pattern.test(path));
      if (!route) continue;
      const needle = new RegExp(`id=["']${hash}["']|id:\\s*["']${hash}["']`);
      const pageSource = read(route.source);
      // Route-level ids may be generated from data (for example connector ids), so also look in lib/site data.
      const dataSource = allSource.filter((s) => s.includes("export const CONNECTORS")).join("\n");
      if (!needle.test(pageSource) && !needle.test(dataSource)) missing.push(`${link.file}: ${link.target}`);
    }
    expect(missing).toEqual([]);
  });
});

describe("route inventory", () => {
  const table = routeTable();

  it("has a page for every public route", () => {
    for (const route of PUBLIC_ROUTES) {
      expect(routeExists(route, table), `missing page for ${route}`).toBe(true);
    }
  });

  it("serves the required procurement routes", () => {
    for (const route of [
      "/privacy",
      "/terms",
      "/security",
      "/dpa",
      "/trust",
      "/support",
      "/status",
      "/install",
      "/enterprise",
      "/contact",
      "/.well-known/security.txt",
      "/api/health",
      "/api/ready",
      "/api/contact",
      "/sitemap.xml",
      "/robots.txt",
    ]) {
      expect(routeExists(route, table), `missing route ${route}`).toBe(true);
    }
  });

  it("lists every public route in the sitemap with an absolute canonical origin", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.length).toBe(PUBLIC_ROUTES.length);
    for (const url of urls) expect(url).toMatch(/^https?:\/\//);
    for (const route of ["/privacy", "/terms", "/security", "/trust", "/support", "/status"]) {
      expect(urls.some((u) => u.endsWith(route)), `sitemap missing ${route}`).toBe(true);
    }
  });

  it("robots allows public pages, blocks product surfaces and points at the sitemap", () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule.disallow).toEqual(expect.arrayContaining(["/api/", "/dashboard", "/settings", "/onboarding", "/verify"]));
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("gives every public page a canonical URL via pageMetadata", () => {
    const pages = walk(SRC)
      .filter((f) => /[\\/]\(public\)[\\/][^\\/]+[\\/](page|layout)\.tsx$/.test(f))
      .map((f) => ({ file: relative(REPO_ROOT, f), source: read(f) }));
    const withoutMetadata = pages.filter(
      (p) => /page\.tsx$/.test(p.file) && !/pageMetadata\(|export const metadata/.test(p.source),
    );
    // Client pages get their metadata from a sibling layout.tsx.
    const needsLayout = withoutMetadata.filter((p) => {
      const layout = p.file.replace(/page\.tsx$/, "layout.tsx");
      return !pages.some((q) => q.file === layout && /pageMetadata\(/.test(q.source));
    });
    // /demo only redirects; it is not an indexable page.
    expect(needsLayout.map((p) => p.file).filter((f) => !f.includes("demo"))).toEqual([]);
  });
});
