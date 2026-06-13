import { describe, expect, it } from "vitest";
import {
  defaultRuntimePolicySettings,
  buildRuntimePolicyAsCode,
  diffRuntimePolicySettings,
  formatServerList,
  normalizeRuntimePolicySettings,
  parseRuntimePolicyAsCodeJson,
  parseServerList,
  renderRuntimePolicyAsCode,
  serializeRuntimePolicySettings,
} from "../policy-settings";

describe("runtime policy settings", () => {
  it("normalizes invalid or missing modes to secure defaults", () => {
    expect(normalizeRuntimePolicySettings(null)).toEqual(defaultRuntimePolicySettings);
    expect(
      normalizeRuntimePolicySettings({
        command_default: "allow",
        mcp_unknown: "ignore",
        mcp_risky: "deny",
      }),
    ).toMatchObject({
      command_default: "allow",
      mcp_unknown: "ask",
      mcp_risky: "deny",
    });
  });

  it("deduplicates and filters MCP server lists", () => {
    expect(parseServerList("filesystem\nGitHub, filesystem\nbad server\n_ok")).toEqual([
      "filesystem",
      "github",
    ]);
  });

  it("serializes policy payloads into dashboard-safe primitives", () => {
    const policy = serializeRuntimePolicySettings({
      ...defaultRuntimePolicySettings,
      mcp_allow_servers: ["GitHub", "github"],
      mcp_require_approval_servers: ["filesystem", "bad server"],
      mcp_deny_servers: ["shell-wrapper"],
    });

    expect(policy).toMatchObject({
      mcp_allow_servers: ["github"],
      mcp_require_approval_servers: ["filesystem"],
      mcp_deny_servers: ["shell-wrapper"],
    });
    expect(formatServerList(policy.mcp_deny_servers)).toBe("shell-wrapper");
  });

  it("builds a deterministic policy-as-code contract across runtime scopes", () => {
    const contract = buildRuntimePolicyAsCode({
      command_default: "deny",
      file_default: "ask",
      url_default: "ask",
      package_default: "deny",
      output_default: "allow",
      mcp_unknown: "ask",
      mcp_risky: "deny",
      mcp_allow_servers: ["github"],
      mcp_require_approval_servers: ["filesystem"],
      mcp_deny_servers: ["shell-wrapper"],
    });

    expect(contract).toMatchObject({
      schema_version: "aidr.policy.v1",
      decision_order: ["deny", "ask", "allow"],
      scopes: {
        shell: { default: "deny" },
        filesystem: { default: "ask" },
        network: { default: "ask" },
        packages: { default: "deny" },
        outputs: { default: "allow" },
        mcp: {
          unknown_server: "ask",
          risky_tool_call: "deny",
          allow_servers: ["github"],
          ask_servers: ["filesystem"],
          deny_servers: ["shell-wrapper"],
        },
      },
    });
    expect(renderRuntimePolicyAsCode(contract)).toContain('"schema_version": "aidr.policy.v1"');
  });

  it("imports validated policy-as-code JSON into runtime settings", () => {
    const json = JSON.stringify(
      buildRuntimePolicyAsCode({
        command_default: "deny",
        file_default: "ask",
        url_default: "allow",
        package_default: "deny",
        output_default: "ask",
        mcp_unknown: "ask",
        mcp_risky: "deny",
        mcp_allow_servers: ["github"],
        mcp_require_approval_servers: ["filesystem"],
        mcp_deny_servers: ["shell-wrapper"],
      }),
    );

    const result = parseRuntimePolicyAsCodeJson(json);
    expect(result).toEqual({
      ok: true,
      settings: {
        command_default: "deny",
        file_default: "ask",
        url_default: "allow",
        package_default: "deny",
        output_default: "ask",
        mcp_unknown: "ask",
        mcp_risky: "deny",
        mcp_allow_servers: ["github"],
        mcp_require_approval_servers: ["filesystem"],
        mcp_deny_servers: ["shell-wrapper"],
      },
    });
  });

  it("returns actionable schema validation errors for invalid policy-as-code", () => {
    const result = parseRuntimePolicyAsCodeJson(
      JSON.stringify({
        schema_version: "aidr.policy.v0",
        scopes: {
          shell: { default: "block" },
          filesystem: { default: "ask" },
          network: { default: "ask" },
          packages: { default: "ask" },
          outputs: { default: "allow" },
          mcp: {
            unknown_server: "ask",
            risky_tool_call: "deny",
            allow_servers: ["bad server"],
            ask_servers: [],
            deny_servers: [],
          },
        },
      }),
    );

    expect(result).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        "schema_version must be aidr.policy.v1.",
        "scopes.shell.default must be allow, ask, or deny.",
        "scopes.mcp.allow_servers contains invalid server ids.",
      ]),
    });
  });

  it("diffs normalized runtime policy settings for approval review", () => {
    expect(
      diffRuntimePolicySettings(
        { command_default: "ask", mcp_allow_servers: ["github"] },
        { command_default: "deny", mcp_allow_servers: ["github", "filesystem"] },
      ),
    ).toEqual([
      { field: "command_default", before: "ask", after: "deny" },
      { field: "mcp_allow_servers", before: ["github"], after: ["github", "filesystem"] },
    ]);
  });
});
