#!/usr/bin/env node
/**
 * Post-build check: every server function must still load its external packages when it is deployed
 * on its own, the way Vercel (or any serverless packager) ships it.
 *
 * Why this exists (SR-01 in docs/SALE-READINESS-AUDIT-2026-10-15.md): Turbopack loads server external
 * packages (firebase-admin, pino, ...) through `.next/node_modules/<pkg>-<hash>` links. With pnpm's
 * isolated node_modules layout a package's own dependencies are only siblings inside node_modules/.pnpm,
 * so as soon as such a link is materialised as a directory copy instead of a symlink, `import()` of the
 * package fails ("Failed to load external module firebase-admin-<hash>/app: Cannot find module
 * 'google-auth-library'") and the route answers an empty 500. That is exactly what production showed for
 * every route handler that touches Firebase or the logger, while pages kept working.
 *
 * For each traced server entry (app/**\/route.js and page.js) that uses such a link, this script:
 *   1. copies only the files listed in the entry's .nft.json trace into an empty sandbox,
 *   2. materialises every `.next/node_modules/<pkg>-<hash>` link as a real directory copy (worst case),
 *   3. imports/requires each external specifier the entry's chunks use, from inside the sandbox.
 * Any failure exits non-zero so the build (and therefore the deployment) fails instead of shipping 500s.
 *
 * Usage: node scripts/verify-server-bundle.mjs  (reads NEXT_DIST_DIR, default .next)
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const distDir = process.env.NEXT_DIST_DIR || ".next";
const distAbs = path.resolve(root, distDir);
const appDir = path.join(distAbs, "server", "app");
const externalsDir = path.join(distAbs, "node_modules");
const toPosix = (p) => p.split(path.sep).join("/");

if (!fs.existsSync(appDir)) {
  console.error(`[verify-server-bundle] ${toPosix(path.relative(root, appDir))} not found; run next build first.`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/(^|[\\/])(route|page)\.js\.nft\.json$/.test(full)) out.push(full);
  }
  return out;
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** External link names (`<pkg>-<16 hex>`) in .next/node_modules referenced by a trace. */
function externalLinks(files) {
  return files.filter((abs) => path.dirname(abs) === externalsDir).map((abs) => path.basename(abs));
}

/** Specifiers like "firebase-admin-0826426b5d9dbc85/app" used by the traced chunks, with how they load. */
function externalSpecifiers(files, links) {
  const specs = new Map();
  for (const abs of files) {
    if (!abs.endsWith(".js") || !isInside(abs, path.join(distAbs, "server"))) continue;
    const source = fs.readFileSync(abs, "utf8");
    for (const link of links) {
      const escaped = link.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(\\.y\\()?"(${escaped}(?:/[^"]*)?)"`, "g");
      for (const match of source.matchAll(pattern)) {
        const spec = match[2];
        const mode = match[1] ? "import" : "require";
        if (specs.get(spec) !== "import") specs.set(spec, mode);
      }
    }
  }
  return specs;
}

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function buildSandbox(files, links) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "aidr-bundle-"));
  const linkReal = new Map(links.map((name) => [name, fs.realpathSync(path.join(externalsDir, name))]));
  const symlinkDirs = [];

  for (const abs of files) {
    const rel = path.relative(root, abs);
    if (rel.startsWith("..")) continue; // outside the project: not part of a deployment
    let lst;
    try {
      lst = fs.lstatSync(abs);
    } catch {
      continue; // traced but absent locally (optional dependency); the runtime import decides
    }
    if (path.dirname(abs) === externalsDir) continue; // materialised below
    if (lst.isSymbolicLink()) {
      const real = fs.realpathSync(abs);
      if (fs.statSync(real).isDirectory()) symlinkDirs.push({ rel, realRel: path.relative(root, real) });
      else copyFile(real, path.join(sandbox, rel));
    } else if (lst.isFile()) {
      copyFile(abs, path.join(sandbox, rel));
    }
  }

  // Package-manager symlinks elsewhere in node_modules are preserved (as directory links/junctions).
  for (const { rel, realRel } of symlinkDirs) {
    const at = path.join(sandbox, rel);
    const target = path.join(sandbox, realRel);
    if (fs.existsSync(at)) continue;
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    fs.symlinkSync(target, at, "junction");
  }

  // Worst case for the Turbopack links: a real directory holding only the package's own traced files.
  for (const [name, real] of linkReal) {
    const into = path.join(sandbox, distDir, "node_modules", name);
    fs.mkdirSync(into, { recursive: true });
    for (const abs of files) {
      let candidate = abs;
      try {
        candidate = fs.realpathSync(abs);
      } catch {
        continue;
      }
      if (!isInside(candidate, real) || !fs.statSync(candidate).isFile()) continue;
      copyFile(candidate, path.join(into, path.relative(real, candidate)));
    }
  }
  return sandbox;
}

function probe(sandbox, specs) {
  const probeFile = path.join(sandbox, distDir, "server", "__verify_bundle_probe.mjs");
  fs.mkdirSync(path.dirname(probeFile), { recursive: true });
  const list = JSON.stringify([...specs.entries()]);
  fs.writeFileSync(
    probeFile,
    `import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const failures = [];
for (const [spec, mode] of ${list}) {
  try {
    if (mode === "import") await import(spec); else require(spec);
  } catch (error) {
    failures.push(spec + " (" + mode + "): " + String(error && error.message || error).split("\\n")[0]);
  }
}
if (failures.length) { console.log(failures.join("\\n")); process.exit(1); }
`,
  );
  return spawnSync(process.execPath, [probeFile], {
    cwd: sandbox,
    encoding: "utf8",
    env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, NODE_ENV: "production" },
    timeout: 120_000,
  });
}

const traces = walk(appDir);
const groups = new Map();
for (const tracePath of traces) {
  const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
  const base = path.dirname(tracePath);
  const entry = tracePath.replace(/\.nft\.json$/, "");
  const files = [entry, ...trace.files.map((f) => path.resolve(base, f))];
  const links = externalLinks(files);
  if (links.length === 0) continue;
  const specs = externalSpecifiers(files, links);
  if (specs.size === 0) continue;
  // Resolution only depends on the traced dependency files (not on the entry's own chunks), so entries
  // with the same specifiers and the same dependency files share one sandbox.
  const dependencyFiles = files.filter((f) => !isInside(f, distAbs) || path.dirname(f) === externalsDir).sort();
  const key = createHash("sha256")
    .update(JSON.stringify([[...specs.entries()].sort(), dependencyFiles]))
    .digest("hex");
  const group = groups.get(key) ?? { files: dependencyFiles, links, specs, entries: [] };
  group.entries.push(toPosix(path.relative(appDir, entry)));
  groups.set(key, group);
}

let failed = 0;
for (const group of groups.values()) {
  const sandbox = buildSandbox(group.files, group.links);
  try {
    const result = probe(sandbox, group.specs);
    if (result.status !== 0) {
      failed += 1;
      console.error(`[verify-server-bundle] FAIL ${group.entries.join(", ")}`);
      console.error(`  ${(result.stdout || result.stderr || result.error?.message || "unknown error").trim().replace(/\n/g, "\n  ")}`);
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

const checked = [...groups.values()].reduce((n, g) => n + g.entries.length, 0);
if (failed > 0) {
  console.error(
    `[verify-server-bundle] ${failed} bundle group(s) cannot load their external packages when deployed in isolation.\n` +
      "  Keep `nodeLinker: hoisted` in pnpm-workspace.yaml (see SR-01 in docs/SALE-READINESS-AUDIT-2026-10-15.md).",
  );
  process.exit(1);
}
console.log(`[verify-server-bundle] ok: ${checked} server entries in ${groups.size} bundle group(s) load their external packages in isolation.`);
