export type RuntimePolicyMode = "allow" | "ask" | "deny";

export type RuntimePolicySettings = {
  command_default: RuntimePolicyMode;
  file_default: RuntimePolicyMode;
  url_default: RuntimePolicyMode;
  package_default: RuntimePolicyMode;
  output_default: RuntimePolicyMode;
  mcp_unknown: RuntimePolicyMode;
  mcp_risky: RuntimePolicyMode;
  mcp_allow_servers: string[];
  mcp_require_approval_servers: string[];
  mcp_deny_servers: string[];
};

export type RuntimePolicyScopeName = "shell" | "filesystem" | "network" | "packages" | "outputs" | "mcp";

export type RuntimePolicyAsCode = {
  schema_version: "aidr.policy.v1";
  decision_order: ["deny", "ask", "allow"];
  scopes: {
    shell: {
      default: RuntimePolicyMode;
      covers: string[];
    };
    filesystem: {
      default: RuntimePolicyMode;
      covers: string[];
    };
    network: {
      default: RuntimePolicyMode;
      covers: string[];
    };
    packages: {
      default: RuntimePolicyMode;
      covers: string[];
    };
    outputs: {
      default: RuntimePolicyMode;
      covers: string[];
    };
    mcp: {
      unknown_server: RuntimePolicyMode;
      risky_tool_call: RuntimePolicyMode;
      allow_servers: string[];
      ask_servers: string[];
      deny_servers: string[];
      risk_hints: string[];
    };
  };
};

export type RuntimePolicyImportResult =
  | { ok: true; settings: RuntimePolicySettings }
  | { ok: false; errors: string[] };

export type RuntimePolicyDiff = {
  field: string;
  before: unknown;
  after: unknown;
};

export const defaultRuntimePolicySettings: RuntimePolicySettings = {
  command_default: "ask",
  file_default: "ask",
  url_default: "ask",
  package_default: "ask",
  output_default: "allow",
  mcp_unknown: "ask",
  mcp_risky: "deny",
  mcp_allow_servers: [],
  mcp_require_approval_servers: [],
  mcp_deny_servers: [],
};

const policyModes = new Set<RuntimePolicyMode>(["allow", "ask", "deny"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeMode(value: unknown, fallback: RuntimePolicyMode): RuntimePolicyMode {
  return typeof value === "string" && policyModes.has(value as RuntimePolicyMode)
    ? (value as RuntimePolicyMode)
    : fallback;
}

export function parseServerList(value: unknown): string[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/)
      : [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of rawItems) {
    if (typeof item !== "string") continue;
    const server = item.trim().toLowerCase();
    if (!server || seen.has(server)) continue;
    if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(server)) continue;
    seen.add(server);
    normalized.push(server);
  }
  return normalized;
}

export function normalizeRuntimePolicySettings(value: unknown): RuntimePolicySettings {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const defaults = defaultRuntimePolicySettings;

  return {
    command_default: normalizeMode(input.command_default, defaults.command_default),
    file_default: normalizeMode(input.file_default, defaults.file_default),
    url_default: normalizeMode(input.url_default, defaults.url_default),
    package_default: normalizeMode(input.package_default, defaults.package_default),
    output_default: normalizeMode(input.output_default, defaults.output_default),
    mcp_unknown: normalizeMode(input.mcp_unknown, defaults.mcp_unknown),
    mcp_risky: normalizeMode(input.mcp_risky, defaults.mcp_risky),
    mcp_allow_servers: parseServerList(input.mcp_allow_servers),
    mcp_require_approval_servers: parseServerList(input.mcp_require_approval_servers),
    mcp_deny_servers: parseServerList(input.mcp_deny_servers),
  };
}

export function serializeRuntimePolicySettings(value: RuntimePolicySettings): RuntimePolicySettings {
  return normalizeRuntimePolicySettings(value);
}

export function formatServerList(value: string[]): string {
  return parseServerList(value).join("\n");
}

export function buildRuntimePolicyAsCode(value: unknown): RuntimePolicyAsCode {
  const policy = normalizeRuntimePolicySettings(value);
  return {
    schema_version: "aidr.policy.v1",
    decision_order: ["deny", "ask", "allow"],
    scopes: {
      shell: {
        default: policy.command_default,
        covers: ["shell commands", "scripts", "process starts"],
      },
      filesystem: {
        default: policy.file_default,
        covers: ["file writes", "file deletes", "sensitive file reads"],
      },
      network: {
        default: policy.url_default,
        covers: ["outbound URLs", "downloads", "callback endpoints"],
      },
      packages: {
        default: policy.package_default,
        covers: ["package installs", "lockfile changes", "supply-chain checks"],
      },
      outputs: {
        default: policy.output_default,
        covers: ["secret leakage", "PII redaction", "model output scanning"],
      },
      mcp: {
        unknown_server: policy.mcp_unknown,
        risky_tool_call: policy.mcp_risky,
        allow_servers: policy.mcp_allow_servers,
        ask_servers: policy.mcp_require_approval_servers,
        deny_servers: policy.mcp_deny_servers,
        risk_hints: ["shell wrapper", "broad filesystem access", "network egress", "credential access"],
      },
    },
  };
}

export function renderRuntimePolicyAsCode(value: unknown): string {
  return JSON.stringify(buildRuntimePolicyAsCode(value), null, 2);
}

function readMode(input: Record<string, unknown>, key: string, path: string, errors: string[]): RuntimePolicyMode {
  const value = input[key];
  if (typeof value === "string" && policyModes.has(value as RuntimePolicyMode)) return value as RuntimePolicyMode;
  errors.push(`${path}.${key} must be allow, ask, or deny.`);
  return "ask";
}

function readServerArray(input: Record<string, unknown>, key: string, path: string, errors: string[]) {
  const value = input[key];
  if (!Array.isArray(value)) {
    errors.push(`${path}.${key} must be an array of server ids.`);
    return [];
  }
  const parsed = parseServerList(value);
  if (parsed.length !== value.filter((item) => typeof item === "string").length) {
    errors.push(`${path}.${key} contains invalid server ids.`);
  }
  return parsed;
}

function readScope(scopes: Record<string, unknown>, key: RuntimePolicyScopeName, errors: string[]) {
  const scope = scopes[key];
  if (!isRecord(scope)) {
    errors.push(`scopes.${key} is required.`);
    return {};
  }
  return scope;
}

export function importRuntimePolicyAsCode(value: unknown): RuntimePolicyImportResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["Policy must be a JSON object."] };
  if (value.schema_version !== "aidr.policy.v1") {
    errors.push("schema_version must be aidr.policy.v1.");
  }
  const scopes = isRecord(value.scopes) ? value.scopes : null;
  if (!scopes) errors.push("scopes is required.");
  const sourceScopes = scopes ?? {};
  const shell = readScope(sourceScopes, "shell", errors);
  const filesystem = readScope(sourceScopes, "filesystem", errors);
  const network = readScope(sourceScopes, "network", errors);
  const packages = readScope(sourceScopes, "packages", errors);
  const outputs = readScope(sourceScopes, "outputs", errors);
  const mcp = readScope(sourceScopes, "mcp", errors);

  const settings: RuntimePolicySettings = {
    command_default: readMode(shell, "default", "scopes.shell", errors),
    file_default: readMode(filesystem, "default", "scopes.filesystem", errors),
    url_default: readMode(network, "default", "scopes.network", errors),
    package_default: readMode(packages, "default", "scopes.packages", errors),
    output_default: readMode(outputs, "default", "scopes.outputs", errors),
    mcp_unknown: readMode(mcp, "unknown_server", "scopes.mcp", errors),
    mcp_risky: readMode(mcp, "risky_tool_call", "scopes.mcp", errors),
    mcp_allow_servers: readServerArray(mcp, "allow_servers", "scopes.mcp", errors),
    mcp_require_approval_servers: readServerArray(mcp, "ask_servers", "scopes.mcp", errors),
    mcp_deny_servers: readServerArray(mcp, "deny_servers", "scopes.mcp", errors),
  };

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, settings };
}

export function parseRuntimePolicyAsCodeJson(value: string): RuntimePolicyImportResult {
  try {
    return importRuntimePolicyAsCode(JSON.parse(value));
  } catch {
    return { ok: false, errors: ["Policy JSON is invalid."] };
  }
}

export function diffRuntimePolicySettings(before: unknown, after: unknown): RuntimePolicyDiff[] {
  const left = normalizeRuntimePolicySettings(before);
  const right = normalizeRuntimePolicySettings(after);
  const diffs: RuntimePolicyDiff[] = [];
  for (const key of Object.keys(defaultRuntimePolicySettings) as Array<keyof RuntimePolicySettings>) {
    const beforeValue = left[key];
    const afterValue = right[key];
    const same = Array.isArray(beforeValue) || Array.isArray(afterValue)
      ? JSON.stringify(beforeValue) === JSON.stringify(afterValue)
      : beforeValue === afterValue;
    if (!same) {
      diffs.push({ field: key, before: beforeValue, after: afterValue });
    }
  }
  return diffs;
}
