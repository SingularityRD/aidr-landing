import { afterEach, describe, expect, it } from "vitest";
import { mintAgentAccessToken } from "../agent-token";
import { getAgentRuntimePolicy, type RuntimePolicyDb } from "../policy";

class FakePolicyDb implements RuntimePolicyDb {
  constructor(private readonly settings: Record<string, unknown> | null) {}

  collection(path: string) {
    if (path !== "users/user_1/settings") throw new Error(`unexpected_path:${path}`);
    return {
      doc: (id: string) => ({
        get: async () => ({
          exists: id === "current" && this.settings !== null,
          data: () => this.settings ?? undefined,
        }),
      }),
    };
  }
}

describe("agent runtime policy endpoint helper", () => {
  const originalSecret = process.env.AIDR_AGENT_TOKEN_SECRET;
  const originalPolicySigningSecret = process.env.AIDR_POLICY_SIGNING_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.AIDR_AGENT_TOKEN_SECRET;
    else process.env.AIDR_AGENT_TOKEN_SECRET = originalSecret;
    if (originalPolicySigningSecret === undefined) delete process.env.AIDR_POLICY_SIGNING_SECRET;
    else process.env.AIDR_POLICY_SIGNING_SECRET = originalPolicySigningSecret;
  });

  it("requires a valid agent token", async () => {
    process.env.AIDR_AGENT_TOKEN_SECRET = "x".repeat(48);

    await expect(
      getAgentRuntimePolicy({
        authorizationHeader: null,
        db: new FakePolicyDb(null),
      }),
    ).rejects.toThrow("missing_agent_token");

    await expect(
      getAgentRuntimePolicy({
        authorizationHeader: "Bearer invalid",
        db: new FakePolicyDb(null),
      }),
    ).rejects.toThrow("invalid_token_format");
  });

  it("returns normalized policy for the token owner only", async () => {
    process.env.AIDR_AGENT_TOKEN_SECRET = "x".repeat(48);
    process.env.AIDR_POLICY_SIGNING_SECRET = "policy-signing-secret";
    const now = new Date("2026-05-06T10:00:00.000Z");
    const { token } = mintAgentAccessToken({
      uid: "user_1",
      agent_id: "agent_1",
      now,
    });

    const result = await getAgentRuntimePolicy({
      authorizationHeader: `Bearer ${token}`,
      now,
      db: new FakePolicyDb({
        updated_at: "2026-05-06T10:10:00.000Z",
        runtime_policy: {
          command_default: "deny",
          mcp_unknown: "allow",
          mcp_risky: "deny",
          mcp_allow_servers: ["GitHub", "github"],
          mcp_require_approval_servers: ["filesystem"],
          mcp_deny_servers: ["shell wrapper", "shell-wrapper"],
        },
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      agent_id: "agent_1",
      policy_version: "2026-05-06T10:10:00.000Z",
      policy_hash: expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
      policy_signature: expect.stringMatching(/^hmac-sha256=[a-f0-9]{64}$/),
      cache_seconds: 60,
      runtime_policy: {
        command_default: "deny",
        mcp_unknown: "allow",
        mcp_allow_servers: ["github"],
        mcp_require_approval_servers: ["filesystem"],
        mcp_deny_servers: ["shell-wrapper"],
      },
      policy_as_code: {
        schema_version: "aidr.policy.v1",
        scopes: {
          shell: { default: "deny" },
          mcp: {
            unknown_server: "allow",
            allow_servers: ["github"],
            ask_servers: ["filesystem"],
            deny_servers: ["shell-wrapper"],
          },
        },
      },
    });
  });
});
