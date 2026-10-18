/**
 * Product facts quoted on the site. The figures are pinned to what the product repository showed on
 * 2026-10-15 (threats/*.yaml, deploy/native/support-matrix.json#soldConnectorScope and
 * docs/compatibility-matrix.md); update them together with claims.ts.
 */
import { describe, expect, it } from "vitest";
import { CONNECTORS, CONNECTOR_SCOPE_STATEMENT, DETECTION_RULES, HOST_ACCEPTANCE_STATEMENT } from "../claims";

describe("product facts", () => {
  it("quotes the current detection rule figures (threats/*.yaml, 2026-10-15)", () => {
    expect(DETECTION_RULES).toEqual({ count: 521, files: 31 });
  });

  it("lists the six sold connectors, each named in the scope statement", () => {
    expect(CONNECTORS.map((c) => c.id).sort()).toEqual(["claude-code", "codex", "cursor", "openclaw", "opencode", "vscode"]);
    for (const connector of CONNECTORS) {
      expect(CONNECTOR_SCOPE_STATEMENT).toContain(connector.name);
      expect(connector.limits.length).toBeGreaterThan(0);
    }
  });

  it("marks Cursor and VS Code as preview and nothing else", () => {
    const preview = CONNECTORS.filter((c) => c.acceptance.preview).map((c) => c.id).sort();
    expect(preview).toEqual(["cursor", "vscode"]);
    for (const connector of CONNECTORS.filter((c) => !c.acceptance.preview)) {
      expect(connector.acceptance.summary).toMatch(/one host version: .+, linux\/x64, development build/);
    }
  });

  it("does not describe any connector as supported", () => {
    expect(HOST_ACCEPTANCE_STATEMENT).toMatch(/no connector is yet described as a supported configuration/);
  });
});
