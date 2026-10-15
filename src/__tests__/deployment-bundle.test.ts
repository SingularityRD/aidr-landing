/**
 * Regression tests for SR-01 (docs/SALE-READINESS-AUDIT-2026-10-15.md): on Vercel every route handler that
 * loads firebase-admin or pino answered an empty 500 (including the dependency-free /api/health) because the
 * Turbopack external-package links could not resolve those packages' dependencies under pnpm's isolated layout.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const src = resolve(root, "src");

function resolveImport(fromFile: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? resolve(src, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(fromFile), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) {
    if (existsSync(candidate) && candidate.match(/\.tsx?$/)) return candidate;
  }
  return null;
}

/** Every module specifier reachable through static imports/re-exports from `entry` (type-only imports excluded). */
function staticImportGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const specs = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    const pattern = /^\s*(?:import|export)\s+(?!type\s)(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/gm;
    for (const match of source.matchAll(pattern)) {
      specs.add(match[1]);
      const next = resolveImport(file, match[1]);
      if (next) queue.push(next);
    }
  }
  return specs;
}

describe("deployment bundle safety", () => {
  it("keeps /api/health free of Firebase, the logger and any SDK", () => {
    const specs = [...staticImportGraph(resolve(src, "app/api/health/route.ts"))];
    expect(specs).toContain("@/lib/site/liveness");
    const forbidden = specs.filter((s) => /firebase|pino|logger|@sentry|@clerk|@polar-sh|@google-cloud/.test(s));
    expect(forbidden).toEqual([]);
  });

  it("does not load the Firebase Admin SDK statically from readiness or the status page", () => {
    for (const entry of ["app/api/ready/route.ts", "app/(public)/status/page.tsx"]) {
      const specs = [...staticImportGraph(resolve(src, entry))];
      expect(specs.filter((s) => /firebase/.test(s)), entry).toEqual([]);
    }
  });

  it("installs a flat node_modules so Turbopack external links resolve their dependencies", () => {
    const workspace = readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8");
    expect(workspace).toMatch(/^nodeLinker:\s*hoisted\s*$/m);
  });

  it("fails the build when a server entry cannot load its external packages in isolation", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.build).toMatch(/next build && node scripts\/verify-server-bundle\.mjs/);
    expect(existsSync(resolve(root, "scripts/verify-server-bundle.mjs"))).toBe(true);
  });
});

describe("readiness when the Firebase Admin SDK cannot be loaded", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/firebase/admin");
    vi.resetModules();
  });

  it("reports a failed database check (503 JSON) instead of failing the endpoint", async () => {
    vi.resetModules();
    vi.doMock("@/lib/firebase/admin", () => {
      throw new Error("Failed to load external module firebase-admin-0826426b5d9dbc85/app");
    });
    const { GET } = await import("@/app/api/ready/route");
    const response = await GET();
    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.checks.database).toMatchObject({ status: "fail", required: true, reason: "sdk_load_failed" });
    expect(JSON.stringify(json)).not.toContain("firebase-admin-0826426b5d9dbc85");
  });

  it("keeps liveness at 200 regardless", async () => {
    const { GET } = await import("@/app/api/health/route");
    expect(GET().status).toBe(200);
  });
});
