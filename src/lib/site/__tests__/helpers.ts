import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
export const SRC = join(REPO_ROOT, "src");
export const APP_DIR = join(SRC, "app");

export function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function read(file: string): string {
  return readFileSync(file, "utf8");
}

/**
 * Files whose text is visible to buyers or search engines: the public pages, the
 * navigation chrome, shared site components, and the content/data modules.
 */
export function publicCopyFiles(): string[] {
  const files: string[] = [];
  const add = (path: string) => {
    if (existsSync(path)) files.push(path);
  };
  add(join(APP_DIR, "page.tsx"));
  add(join(APP_DIR, "layout.tsx"));
  walk(join(APP_DIR, "(public)")).forEach((f) => /\.(tsx|ts)$/.test(f) && files.push(f));
  add(join(SRC, "components", "Header.tsx"));
  add(join(SRC, "components", "Footer.tsx"));
  walk(join(SRC, "components", "site")).forEach((f) => /\.(tsx|ts)$/.test(f) && files.push(f));
  walk(join(SRC, "lib", "site")).forEach((f) => /\.(tsx|ts)$/.test(f) && files.push(f));
  // Signed-in surfaces that quote the offer or prices.
  add(join(APP_DIR, "(auth)", "onboarding", "page.tsx"));
  add(join(APP_DIR, "(app)", "billing", "page.tsx"));
  return files.filter((f) => !f.includes(`${sep}__tests__${sep}`));
}

export type RouteEntry = { pattern: RegExp; source: string };

/** Map filesystem route files to URL patterns. */
export function routeTable(): RouteEntry[] {
  const routes: RouteEntry[] = [];
  for (const file of walk(APP_DIR)) {
    const rel = relative(APP_DIR, file).split(sep);
    const name = rel[rel.length - 1];
    const isPage = /^page\.(tsx|ts|jsx|js)$/.test(name);
    const isRoute = /^route\.(tsx|ts|jsx|js)$/.test(name);
    const isMeta = /^(sitemap|robots)\.(ts|js)$/.test(name);
    if (!isPage && !isRoute && !isMeta) continue;

    let segments = rel.slice(0, -1).filter((s) => !(s.startsWith("(") && s.endsWith(")")));
    if (isMeta) segments = [...segments, name.startsWith("sitemap") ? "sitemap.xml" : "robots.txt"];

    const pattern = segments
      .map((segment) => {
        if (/^\[\[\.\.\..+\]\]$/.test(segment)) return "(?:/.*)?";
        if (/^\[\.\.\..+\]$/.test(segment)) return "/.+";
        if (/^\[.+\]$/.test(segment)) return "/[^/]+";
        return `/${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
      })
      .join("");
    routes.push({ pattern: new RegExp(`^${pattern === "" ? "/" : pattern}$`), source: file });
  }
  return routes;
}

export function routeExists(path: string, table = routeTable()): boolean {
  return table.some((route) => route.pattern.test(path));
}
