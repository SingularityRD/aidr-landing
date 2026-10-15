/**
 * Single source of truth for product facts quoted on the public site.
 *
 * Every value here is traceable to the product repository (SingularityRD/aidr).
 * Keep wording conservative: describe what exists and what is intended, never
 * what has not been accepted on a real host or by an independent assessor.
 */

/**
 * Source: threats/*.yaml in the product repository, counted with
 * `grep -h '^- id:' threats/*.yaml | wc -l` and `ls threats/*.yaml | wc -l` on 2026-10-15
 * (519 rules across 31 files, matching its CLAUDE.md; the product CI recomputes the figure in
 * scripts/check-doc-claims.mjs). Pinned in src/lib/site/__tests__/product-facts.test.ts.
 */
export const DETECTION_RULES = { count: 519, files: 31 } as const;

/**
 * Evaluation offer.
 * Source: commercial-go-evidence-registry.json commercialDecision.cloudTrial
 * (durationDays 14, agentLimit 1, paidCloudTrialCap false).
 */
export const EVALUATION = {
  days: 14,
  agents: 1,
  label: "14-day, 1-agent evaluation",
  sentence:
    "The evaluation offer is 14 days and 1 protected agent, by application and subject to approval. It ends after the 14 days unless an order is agreed in writing.",
} as const;

export const PRICING_STATEMENT =
  "Pricing is set by approved order. There is no public price list, and nothing on this site is a quote.";

export type ConnectorFacts = {
  id: string;
  name: string;
  /** Interception point from deploy/native/support-matrix.json. */
  interception: string;
  /** What the connector sees, from docs/platform-guides. */
  coverage: string;
  /** Install path as documented; none are public downloads. */
  install: string;
  /** Known limits from the support matrix. */
  limits: string[];
  /**
   * Real-host acceptance, from docs/compatibility-matrix.md (generated from docs/evidence/real-host/*.json).
   * `preview` connectors have no real-host record and must say so wherever they are sold.
   */
  acceptance: { preview: boolean; summary: string };
};

const TESTED_ONE_HOST = (version: string) =>
  `Tested on one host version: ${version}, linux/x64, development build, 2026-10-11. Other versions and platforms are unverified.`;
const PREVIEW = "Preview: no real-host acceptance evidence yet.";

/**
 * The six connectors in the sold scope (deploy/native/support-matrix.json#soldConnectorScope, COM-010).
 * Four have one real-host acceptance record each (linux/x64 only); Cursor and VS Code are preview.
 */
export const CONNECTORS: ConnectorFacts[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    interception: "Pre-tool-call hook (PreToolUse), post-tool-output inspection (PostToolUse) and a session-start plugin scan",
    coverage: "Tool calls that Claude Code routes through its hook system, such as shell commands, file writes and web fetches.",
    install: "Signed plugin archive from an approved release, added with /plugin marketplace add and /plugin install.",
    limits: [
      "A disabled hook fails open on the host side.",
      "Actions that never pass through the host hook (a separate shell, direct network access) are not seen.",
      "Hook timeouts can let the host continue; behaviour must be verified per host version.",
    ],
    acceptance: { preview: false, summary: TESTED_ONE_HOST("Claude Code 2.1.296") },
  },
  {
    id: "cursor",
    name: "Cursor",
    interception: "Managed pre-tool-use hook installed by the extension",
    coverage: "Agent tool calls that Cursor routes through its hook system.",
    install: "Signed .vsix from an approved release, installed with Extensions > Install from VSIX.",
    limits: [
      "The extension can be disabled by the operator.",
      "Commands run outside the extension host (an external terminal) are not seen.",
      "Cursor cannot enforce an approval prompt on preToolUse, so AIDR maps an approval-needed verdict to a block.",
    ],
    acceptance: { preview: true, summary: PREVIEW },
  },
  {
    id: "vscode",
    name: "VS Code",
    interception: "Managed agent hook installed by the extension",
    coverage: "Agent tool calls for VS Code Local agent hooks (requires the chat.useClaudeHooks setting).",
    install: "Signed .vsix from an approved release, installed with Extensions > Install from VSIX.",
    limits: [
      "The extension can be disabled by the operator.",
      "Commands run outside the extension host are not seen.",
      "Enforcement across current VS Code minor versions is not yet verified on real hosts.",
    ],
    acceptance: { preview: true, summary: PREVIEW },
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    interception: "In-process plugin: before_tool_call, with post-execution output and reply inspection",
    coverage: "exec, web_fetch, write, edit, read and apply_patch tool calls.",
    install: "Approved signed version from the private registry, per the package installation guide.",
    limits: [
      "If the plugin is removed, nothing is intercepted.",
      "Output inspection happens after execution and cannot undo a tool action.",
      "There is no in-session approval prompt; a blocked action stays blocked until an operator approves it out of band.",
    ],
    acceptance: { preview: false, summary: TESTED_ONE_HOST("OpenClaw 2026.9.6") },
  },
  {
    id: "opencode",
    name: "OpenCode",
    interception: "Plugin hooks: tool.execute.before and tool.execute.after",
    coverage: "bash, webfetch, read, write, edit, apply_patch, ls, glob and grep. Unmapped tools pass through unchanged.",
    install: "Approved signed version from the private GitHub Packages registry, enabled in the OpenCode config.",
    limits: [
      "Provider streams and non-tool content are not inspected.",
      "There is no in-session approval prompt; a blocked action stays blocked until an operator approves it out of band.",
    ],
    acceptance: { preview: false, summary: TESTED_ONE_HOST("OpenCode 1.18.32") },
  },
  {
    id: "codex",
    name: "Codex CLI",
    interception: "Native PreToolUse command hook, with an optional UserPromptSubmit prompt check",
    coverage: "Bash, apply_patch and MCP (mcp__*) tool calls matched by the packaged hook matcher. Other local function tools do not invoke the hook.",
    install: "Approved signed version of the Codex package from the private registry, with the hooks registered in the Codex configuration and trusted in Codex /hooks.",
    limits: [
      "If the hook is disabled, untrusted, crashes or times out, Codex runs the call (the host fails open).",
      "No tool-output inspection before the model is claimed for this host.",
      "Hosted and specialised tool paths may bypass the host hook path.",
    ],
    acceptance: { preview: false, summary: TESTED_ONE_HOST("codex-cli 0.141.0") },
  },
];

export const HOST_ACCEPTANCE_STATEMENT =
  "Claude Code, Codex CLI, OpenClaw and OpenCode each have a real-host acceptance record for one host version on Linux x64 (development build). Cursor and VS Code are preview, with no real-host acceptance evidence yet. Windows, macOS and arm64 are target platforms without real-host acceptance, and no macOS installer is offered. No release has been cut, so no connector is yet described as a supported configuration.";

export const CONNECTOR_SCOPE_STATEMENT =
  "Six connectors are in the intended first-release scope: Claude Code, Codex CLI, Cursor, VS Code, OpenClaw and OpenCode.";

export const FAILURE_POLICY_STATEMENT =
  "Failure handling differs by layer. A single detection signal that errors is skipped and logged, and the call is still evaluated on the remaining signals. The connector entry points return a block on an internal error instead of silently allowing the call. Host-side behaviour when a hook is disabled, crashes or times out can still let a call through, which is why each connector lists it as a limit.";
