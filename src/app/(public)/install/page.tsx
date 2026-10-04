import Link from "next/link";
import { ContactLink } from "@/components/site/ContactLink";
import { Callout, DocHeader, DocSection } from "@/components/site/Doc";
import { CONNECTORS, CONNECTOR_SCOPE_STATEMENT, HOST_ACCEPTANCE_STATEMENT } from "@/lib/site/claims";
import { pageMetadata } from "@/lib/site/metadata";

export const metadata = pageMetadata({
  title: "Install",
  description:
    "Install steps, interception points and known limits for each Singularity AIDR connector: Claude Code, Cursor, VS Code, OpenClaw and OpenCode.",
  path: "/install",
});

const OFFLINE_CONFIG = `{
  "url_check": { "enabled": false },
  "file_check": { "enabled": false },
  "package_check": { "enabled": false },
  "version_check": { "enabled": false },
  "control_plane": {
    "enabled": false,
    "send_audit_logs": false
  }
}`;

export default function InstallPage() {
  return (
    <>
      <DocHeader
        eyebrow="Install"
        title="Install a connector"
        lead="Each connector hooks into one agent host. Release artifacts are signed and distributed to approved evaluation and customer accounts; they are not public downloads."
      />

      <Callout tone="warn" title="Real-host acceptance is not complete.">
        {CONNECTOR_SCOPE_STATEMENT} {HOST_ACCEPTANCE_STATEMENT}
      </Callout>

      <DocSection id="before" title="Before you start">
        <ul>
          <li>
            You need an approved evaluation or an order, which gives access to the signed release artifacts. Start with{" "}
            <Link href="/pilot">the evaluation application</Link> or <Link href="/contact?topic=sales">contact us</Link>.
          </li>
          <li>Node.js 22.12.0 or newer on the machine, because the hooks run as Node.js scripts (Claude Code).</li>
          <li>
            Install only artifacts you received through the approved channel. Local source builds are for development
            and are not a customer installation.
          </li>
        </ul>
      </DocSection>

      {CONNECTORS.map((connector) => (
        <DocSection key={connector.id} id={connector.id} title={connector.name}>
          <p>
            <strong>Interception:</strong> {connector.interception}.
          </p>
          <p>
            <strong>Sees:</strong> {connector.coverage}
          </p>
          <h3>Install</h3>
          <p>{connector.install}</p>
          {connector.id === "claude-code" ? (
            <pre aria-label="Claude Code install commands">{`/plugin marketplace add /absolute/path/to/extracted/aidr-claude-plugin
/plugin install aidr@aidr`}</pre>
          ) : null}
          {connector.id === "opencode" ? (
            <pre aria-label="OpenCode configuration">{`// ~/.config/opencode/package.json
{ "dependencies": { "@singularityrd/aidr-opencode": "VERSION" } }

// ~/.config/opencode/opencode.json
{ "plugin": ["@singularityrd/aidr-opencode"] }`}</pre>
          ) : null}
          {connector.id === "vscode" ? (
            <p>
              Then enable <code>chat.useClaudeHooks</code> in VS Code user settings and run{" "}
              <code>Singularity AIDR: Enable protection</code> from the command palette. The extension does not change
              that setting for you.
            </p>
          ) : null}
          {connector.id === "cursor" ? (
            <p>
              Then run <code>Singularity AIDR: Enable protection</code> from the command palette to install the managed
              hooks.
            </p>
          ) : null}
          <h3>Known limits</h3>
          <ul>
            {connector.limits.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </DocSection>
      ))}

      <DocSection id="verify" title="Verify the install">
        <p>
          Use the safe deny canary from the first-customer acceptance procedure that comes with the evaluation. It checks
          that a block is applied by the host without running a live payload. Please do not run a real payload as an
          install test. Also test what happens when the hook is disabled, crashes or times out, because those cases
          differ by host and version.
        </p>
        <p>
          Registration of a hook is not proof that the host runs it. Setup output that says protection is &quot;not yet
          active&quot; should be taken at face value.
        </p>
      </DocSection>

      <DocSection id="offline" title="Reduce outbound traffic">
        <p>
          For a fully local evaluation, turn the optional outbound legs off in <code>~/.singularity-aidr/config.json</code>:
        </p>
        <pre aria-label="Configuration that disables optional outbound features">{OFFLINE_CONFIG}</pre>
        <p>
          Leave browser and runtime diagnostics unset as well. Confirm the effective configuration and your network policy
          in your own environment.
        </p>
      </DocSection>

      <DocSection id="uninstall" title="Uninstall">
        <p>
          Use the extension uninstall for Cursor and VS Code, remove the plugin for Claude Code, OpenClaw and OpenCode,
          or run the CLI uninstall command where the CLI was used. Questions:{" "}
          <ContactLink channel="support">support</ContactLink>.
        </p>
      </DocSection>
    </>
  );
}
