import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { publicCopyFiles, read, REPO_ROOT } from "./helpers";

/**
 * Blocked-claim guard for everything a buyer can read on the public site.
 *
 * The first block mirrors `claimPatterns` in the product repository's
 * docs/production-readiness/commercial-go-evidence-registry.json (kept inline so CI
 * does not depend on a sibling checkout). When that registry is present locally, its
 * patterns are enforced as well, so the two cannot drift apart silently.
 */
const REGISTRY_MIRROR: Array<{ id: string; pattern: RegExp }> = [
  { id: "CLM-BANNED-LAUNCH", pattern: /\blaunch[- ]ready\b|\bgo live in minutes\b/i },
  { id: "CLM-BANNED-SCOPE", pattern: /\ball (?:agents|platforms|connectors)\b|\bfully supported\b|\bcomprehensive(?: AI)? security platform\b/i },
  { id: "CLM-BANNED-REALTIME", pattern: /\breal[- ]time\b/i },
  {
    id: "CLM-BANNED-AUTOMATIC",
    pattern: /\bautomatic(?:ally)?\s+(?:quarantine|containment|rollback|response|upgrades?)\b|\bauto[- ](?:quarantine|containment|rollback|response|upgrades?)\b/i,
  },
  { id: "CLM-BANNED-COMPLIANCE", pattern: /\b(?:SOC ?2|ISO ?27001|HIPAA|GDPR)\s*(?:Type II|certified|compliant|compliance)\b/i },
  { id: "CLM-BANNED-AIG-DATA", pattern: /\b(?:1,?300\+|1300\+)\s*CVE(?:s)?\b|\bzero[- ]false[- ]positive(?:s)?\b/i },
  { id: "CLM-BANNED-PRIVACY", pattern: /\blocal[- ]only\b|\bdata never leaves (?:the )?(?:premise|device)\b|\bno data leaves\b/i },
  { id: "CLM-BANNED-READINESS", pattern: /\bproduction[- ]ready\b|\bsale[- ]ready\b|\benterprise[- ]grade\b/i },
];

/** Additional claims found on the previous live site that the evidence does not support. */
const SITE_SPECIFIC: Array<{ id: string; pattern: RegExp }> = [
  { id: "SITE-FREE-FOREVER", pattern: /\bfree forever\b|\balways free\b|\b1 agent (?:is )?free\b|\bno time limit\b/i },
  { id: "SITE-PUBLIC-PRICE", pattern: /\$\s?\d/ },
  { id: "SITE-ONLY-TOOL", pattern: /\bthe only (?:tool|platform|solution)\b|\bwhy aidr wins\b/i },
  { id: "SITE-OPEN-SOURCE", pattern: /\bopen[- ]source core\b|\bMIT[- ]licensed\b/i },
  { id: "SITE-FAIL-OPEN-CLAIM", pattern: /\bnever break(?:s)? (?:your|the) agent\b|\bevery internal error (?:path )?returns an allow\b/i },
  { id: "SITE-NO-DATA-SENT", pattern: /\bno code, file contents, or prompts are sent\b/i },
  { id: "SITE-GUARANTEE", pattern: /\bguarantee[sd]?\b/i },
  { id: "SITE-EVERY-MAJOR", pattern: /\bevery major\b|\bwith zero manual setup\b|\bprotect in minutes\b/i },
  { id: "SITE-SOC2-CLAIM", pattern: /\bSOC ?2\s+(?:Type (?:I|II|1|2)\s+)?(?:report|certified|compliant|attested)\s+(?:is|are)\s+(?:available|complete)/i },
];

function registryPatterns(): Array<{ id: string; pattern: RegExp }> {
  const candidates = [
    process.env.AIDR_CLAIM_REGISTRY,
    `${REPO_ROOT}/../aidr/docs/production-readiness/commercial-go-evidence-registry.json`,
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const registry = JSON.parse(readFileSync(candidate, "utf8")) as { claimPatterns?: Array<{ id: string; pattern: string }> };
    return (registry.claimPatterns ?? []).map((p) => ({ id: `REGISTRY:${p.id}`, pattern: new RegExp(p.pattern, "i") }));
  }
  return [];
}

function visibleText(source: string): string {
  // Drop import lines and comments so the guard reads copy, not code or documentation of the guard.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*import .*$/gm, "");
}

describe("public copy contains no blocked claims", () => {
  const files = publicCopyFiles();

  it("scans a meaningful set of files", () => {
    expect(files.length).toBeGreaterThan(20);
    const names = files.map((f) => relative(REPO_ROOT, f).replace(/\\/g, "/"));
    expect(names).toContain("src/app/page.tsx");
    expect(names).toContain("src/app/(public)/pricing/page.tsx");
    expect(names).toContain("src/app/(public)/trust/page.tsx");
  });

  const patterns = [...REGISTRY_MIRROR, ...SITE_SPECIFIC, ...registryPatterns()];

  for (const { id, pattern } of patterns) {
    it(`${id} does not appear`, () => {
      const hits: string[] = [];
      for (const file of files) {
        const text = visibleText(read(file));
        const match = pattern.exec(text);
        if (match) hits.push(`${relative(REPO_ROOT, file)}: "${match[0]}"`);
      }
      expect(hits).toEqual([]);
    });
  }

  it("keeps the evaluation term consistent: 14 days and 1 agent", () => {
    const joined = files.map((f) => visibleText(read(f))).join("\n");
    expect(joined).toMatch(/14[- ]day/i);
    // No other trial length is quoted.
    expect(joined).not.toMatch(/\b(?:7|10|21|30|60|90)[- ]day (?:free )?(?:trial|pilot|evaluation)\b/i);
  });

  it("never states a certification or attestation as held", () => {
    const joined = files.map((f) => visibleText(read(f))).join("\n");
    expect(joined).not.toMatch(/\b(?:we are|is|are) (?:SOC ?2|ISO ?27001)\b/i);
    expect(joined).not.toMatch(/\b(?:SOC ?2|ISO ?27001)[^.\n]{0,40}\b(?:achieved|obtained|passed)\b/i);
  });
});
