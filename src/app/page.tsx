import Link from "next/link";
import type { Metadata } from "next";
import PageShell from "@/components/site/PageShell";
import HeroCtas from "@/components/site/HeroCtas";
import { CONNECTORS, DETECTION_RULES, EVALUATION, PRICING_STATEMENT } from "@/lib/site/claims";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const pipeline = [
  { id: "tool-received", label: "Tool call received", detail: "Shell, file, web and MCP calls the host routes through its hook", kind: "input" },
  { id: "extract-artifacts", label: "Extract artifacts", detail: "Commands, URLs, file paths, package names, content", kind: "step" },
  { id: "check-allowlist", label: "Allowlist and cache", detail: "Exact-artifact allowlist and recent verdicts", kind: "decision" },
  { id: "run-heuristics", label: "Run rules", detail: `${DETECTION_RULES.count} YAML threat rules in ${DETECTION_RULES.files} files, plus policy`, kind: "step" },
  { id: "query-reputation", label: "Optional reputation checks", detail: "URL, file hash and package checks, only when enabled", kind: "step" },
  { id: "decision-engine", label: "Decision engine", detail: "Merge signals; deny wins over ask, ask wins over allow", kind: "decision" },
  { id: "verdict", label: "Verdict", detail: "Allow, ask (block pending human approval) or deny", kind: "output" },
];

const layers = [
  {
    title: "Local rules",
    desc: `${DETECTION_RULES.count} data-driven YAML rules match dangerous commands, sensitive file paths, credential exposure, obfuscation and prompt-injection patterns. They run on the developer machine.`,
  },
  {
    title: "Policy",
    desc: "Filesystem, network, MCP and tool rules from local configuration or a signed policy published from the dashboard.",
  },
  {
    title: "Package and plugin checks",
    desc: "Package-install commands are checked against registry metadata, age heuristics and offline intel. Installed plugins are scanned at session start.",
  },
  {
    title: "Optional reputation",
    desc: "URL, file-hash and package reputation lookups when enabled. They need a configured first-party endpoint and an unavailable lookup is never reported as clean.",
  },
];

const features = [
  { title: "Tool-call inspection", desc: "Shell commands, file reads and writes, web fetches and MCP calls, for the tools each host routes through its hook." },
  { title: "Block pending approval", desc: "A call that needs a human decision is blocked. No approval tool is exposed to the agent, so an injected prompt cannot approve its own block." },
  { title: "Device authorization", desc: "Enrollment uses short-lived, single-use codes that a signed-in user approves in the browser." },
  { title: "Incident correlation", desc: "Repeated denials and suspicious retries are grouped into cases with owner, status and evidence." },
  { title: "Dashboard and policy rollout", desc: "Registered agents, events, incidents, policy publication with optional two-person approval, and drift tracking." },
  { title: "Signed webhook export", desc: "Send deny and critical events to a webhook you control, with delivery failures tracked and replayable." },
  { title: "Output inspection", desc: "Tool output can be checked for leaked credentials and injection after the tool runs. This is a post-execution step and cannot undo the action." },
  { title: "MCP and plugin inventory", desc: "Local MCP server configurations and installed plugins are discovered and checked at session start." },
  { title: "Credential scrub", desc: "Bearer tokens, API keys and secret URL parameters are removed from events before they leave the machine." },
];

const categories = [
  { name: "Remote code execution", example: "curl piped to a shell, reverse shells" },
  { name: "Credential theft", example: "SSH keys, .env files, cloud credentials" },
  { name: "Supply-chain attacks", example: "Typosquatted packages, dependency confusion" },
  { name: "Prompt injection", example: "Direct and indirect injection, system prompt extraction" },
  { name: "Data exfiltration", example: "Unexpected network calls and uploads" },
  { name: "Destructive operations", example: "Recursive deletes, disk wipes" },
  { name: "Persistence", example: "Cron, systemd, launch agents, shell startup files" },
  { name: "Obfuscation", example: "Encoded payloads and hidden commands" },
  { name: "Plugin tampering", example: "Malicious or modified plugins and extensions" },
  { name: "Privilege escalation", example: "sudo abuse, setuid, token theft" },
];

const faqs = [
  {
    q: "What is AIDR?",
    a: "Singularity AIDR (AI Agent Detection & Response) checks the tool calls AI coding agents make, such as shell commands, file operations and web requests, against rules and policy before they run, and blocks or flags risky ones.",
  },
  {
    q: "Does it need a cloud account?",
    a: "No. Detection and policy run locally and a fresh install enforces without an account. The managed dashboard is an optional layer for fleets. Optional reputation lookups, version checks and managed telemetry are separate outbound paths that can be turned off.",
  },
  {
    q: "Which agents does it support?",
    a: "The intended first-release scope is Claude Code, Cursor, VS Code, OpenClaw and OpenCode. Each connector has documented limits, and real-host acceptance is not yet complete for any of them. See the install page.",
  },
  {
    q: "Can an agent get around it?",
    a: "Yes, in some cases. AIDR only sees actions that pass through the host's hook. A disabled hook, a separate terminal, or direct network access that never becomes a tool call is not seen. The install page lists the known limits for each connector.",
  },
  {
    q: "Can it break my agent?",
    a: "A failing detection signal is skipped and logged. Connector entry points return a block on an internal error rather than silently allowing the call, so a fault can stop an agent action. Blocks pending approval stay blocked until an operator approves them.",
  },
  {
    q: "How is data handled?",
    a: "Detection runs on the device and does not upload source files or full prompts. Optional features send specific data, such as URLs, package names or file hashes, and managed telemetry defaults to hashes. The privacy page is a draft pending legal review and lists each path.",
  },
  {
    q: "What does it cost?",
    a: `${EVALUATION.sentence} ${PRICING_STATEMENT}`,
  },
  {
    q: "Is it certified?",
    a: "No. There is no SOC 2 report, ISO 27001 certificate or independent penetration test yet. The trust center lists what is open.",
  },
];

const kindColor: Record<string, string> = {
  input: "#1d4ed8",
  step: "#6d28d9",
  decision: "#b45309",
  output: "#15803d",
};

export default function Home() {
  return (
    <PageShell className="home-main page-main">
      <section className="hero-row" aria-labelledby="hero-heading" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "center" }}>
        <div className="doc-section" style={{ marginTop: 0, padding: "36px 32px" }}>
          <p className="doc-eyebrow">AI Agent Detection &amp; Response</p>
          <h1 id="hero-heading" className="doc-title">
            A detection layer for the tool calls your AI coding agents make.
          </h1>
          <p className="doc-lead">
            Singularity AIDR checks shell commands, file operations, web requests and MCP calls against {DETECTION_RULES.count}{" "}
            rules and your policy, and blocks or flags risky ones. Detection runs on the developer machine. It is offered
            today as a {EVALUATION.label}.
          </p>
          <HeroCtas secondaryHref="/install" secondaryLabel="See coverage and limits" />
        </div>

        <div
          className="doc-card"
          style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 12, lineHeight: "20px" }}
          role="group"
          aria-label="Detection pipeline"
        >
          <p className="doc-eyebrow">Detection pipeline</p>
          <ol style={{ listStyle: "none" }}>
            {pipeline.map((step) => (
              <li key={step.id} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span
                    aria-hidden="true"
                    style={{ width: 8, height: 8, borderRadius: "50%", background: kindColor[step.kind], flexShrink: 0 }}
                  />
                  <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{step.label}</span>
                </div>
                <div style={{ color: "var(--text-secondary)", marginLeft: 16, fontSize: 12 }}>{step.detail}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="callout callout-info" role="note" style={{ marginTop: 24 }}>
        <strong>Where this stands.</strong> AIDR is in controlled evaluation. Real-host acceptance is not complete for any
        connector, there is no independent security assessment or certification yet, and there is no SLA. The{" "}
        <Link href="/trust">trust center</Link> lists what is verified and what is open.
      </div>

      <section id="how-it-works" className="doc-section" aria-labelledby="how-heading">
        <p className="doc-eyebrow">How it works</p>
        <h2 id="how-heading">Four signals, one verdict</h2>
        <p>
          Each tool call passes through independent checks. They return allow, ask or deny, and the decision engine merges
          them with deny over ask over allow.
        </p>
        <div className="doc-grid">
          {layers.map((layer) => (
            <article key={layer.title} className="doc-card">
              <h3>{layer.title}</h3>
              <p>{layer.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className="doc-section" aria-labelledby="features-heading">
        <p className="doc-eyebrow">Capabilities</p>
        <h2 id="features-heading">What the product does</h2>
        <div className="doc-grid">
          {features.map((feature) => (
            <article key={feature.title} className="doc-card">
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
            </article>
          ))}
        </div>
        <p style={{ marginTop: 14 }}>
          Enterprise options such as SSO, SCIM, SIEM export, audit export and self-hosting are labelled as implemented,
          partial or roadmap on the <Link href="/enterprise">enterprise page</Link>.
        </p>
      </section>

      <section id="threats" className="doc-section" aria-labelledby="threats-heading">
        <p className="doc-eyebrow">Rule coverage</p>
        <h2 id="threats-heading">
          {DETECTION_RULES.count} rules in {DETECTION_RULES.files} YAML files
        </h2>
        <p>
          All detection logic is data: rules are YAML files that can be reviewed and updated independently of the code.
          A rule count is not an effectiveness measure; independent false-positive and evasion measurements are still
          open.
        </p>
        <ul className="doc-grid" style={{ listStyle: "none", marginLeft: 0 }}>
          {categories.map((category) => (
            <li key={category.name} className="doc-card" style={{ padding: "12px 16px" }}>
              <strong style={{ color: "var(--text-primary)" }}>{category.name}</strong>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{category.example}</div>
            </li>
          ))}
        </ul>
      </section>

      <section id="platforms" className="doc-section" aria-labelledby="platforms-heading">
        <p className="doc-eyebrow">Connectors</p>
        <h2 id="platforms-heading">Five connectors in the intended scope</h2>
        <p>
          Each connector uses the integration point its host offers. Targets are Windows, Linux and macOS, but none is yet
          accepted on real hosts, so none is listed as a supported configuration.
        </p>
        <div className="doc-grid">
          {CONNECTORS.map((connector) => (
            <article key={connector.id} className="doc-card">
              <h3>{connector.name}</h3>
              <p style={{ fontSize: 13 }}>{connector.interception}.</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>
                <Link href={`/install#${connector.id}`}>Install steps and limits</Link>
              </p>
            </article>
          ))}
        </div>
      </section>

      <section id="security" className="doc-section" aria-labelledby="security-heading">
        <p className="doc-eyebrow">Security and privacy</p>
        <h2 id="security-heading">What stays local and what does not</h2>
        <div className="doc-grid">
          <article className="doc-card">
            <h3>Local by default</h3>
            <p>Rule and policy evaluation run on the device. Local detection does not upload source files or full prompts.</p>
          </article>
          <article className="doc-card">
            <h3>Optional outbound paths</h3>
            <p>
              Reputation lookups, version checks, deep scans, alert webhooks and managed telemetry each send specific data
              and can be disabled. They are listed in the privacy draft.
            </p>
          </article>
          <article className="doc-card">
            <h3>Failure handling</h3>
            <p>Failure policy differs by layer: detection signals are skipped on error, connector entry points block, security controls fail closed.</p>
          </article>
          <article className="doc-card">
            <h3>Honest assurance status</h3>
            <p>
              No certification is claimed. Read the <Link href="/security">security overview</Link> and the{" "}
              <Link href="/trust">trust center</Link>.
            </p>
          </article>
        </div>
      </section>

      <section id="pricing" className="doc-section" aria-labelledby="pricing-heading">
        <p className="doc-eyebrow">Evaluation and pricing</p>
        <h2 id="pricing-heading">Start with a 14-day evaluation</h2>
        <p>
          {EVALUATION.sentence} {PRICING_STATEMENT}
        </p>
        <div className="btn-row">
          <Link href="/pilot" className="btn">
            Apply for the evaluation
          </Link>
          <Link href="/pricing" className="btn btn-secondary">
            Evaluation and pricing
          </Link>
          <Link href="/contact?topic=sales" className="btn btn-secondary">
            Contact sales
          </Link>
        </div>
      </section>

      <section id="faq" className="doc-section" aria-labelledby="faq-heading">
        <p className="doc-eyebrow">FAQ</p>
        <h2 id="faq-heading">Frequently asked questions</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {faqs.map((faq) => (
            <details key={faq.q} className="doc-card" style={{ padding: "14px 18px" }}>
              <summary style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", cursor: "pointer" }}>{faq.q}</summary>
              <p style={{ marginTop: 10 }}>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
