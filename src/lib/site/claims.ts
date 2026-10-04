/**
 * Single source of truth for product facts quoted on the public site.
 *
 * Every value here is traceable to the product repository (SingularityRD/aidr).
 * Keep wording conservative: describe what exists and what is intended, never
 * what has not been accepted on a real host or by an independent assessor.
 */

/** Source: PRODUCT_SCOPE_AND_FEATURES.md and CLAUDE.md (351 rules across 23 files in threats/). */
export const DETECTION_RULES = { count: 351, files: 23 } as const;

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
};

/**
 * The five connectors in the intended first-release scope (COM-010). Codex exists in
 * the repository but is outside that scope. None has real-host acceptance evidence yet.
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
  },
];

export const HOST_ACCEPTANCE_STATEMENT =
  "Windows, Linux and macOS on x64 and arm64 are the intended target platforms. Real-host acceptance is not complete for any connector, so none of them is yet described as a supported configuration.";

export const CONNECTOR_SCOPE_STATEMENT =
  "Five connectors are in the intended first-release scope: Claude Code, Cursor, VS Code, OpenClaw and OpenCode. A Codex connector exists in the repository but is outside that scope.";

export const FAILURE_POLICY_STATEMENT =
  "Failure handling differs by layer. A single detection signal that errors is skipped and logged, and the call is still evaluated on the remaining signals. The connector entry points return a block on an internal error instead of silently allowing the call. Host-side behaviour when a hook is disabled, crashes or times out can still let a call through, which is why each connector lists it as a limit.";
