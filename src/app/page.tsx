import Link from "next/link";
import type { Metadata } from "next";
import PageShell from "@/components/site/PageShell";
import HeroCtas from "@/components/site/HeroCtas";
import {
  CONNECTORS,
  CONNECTOR_SCOPE_STATEMENT,
  DETECTION_RULES,
  EVALUATION,
  HOST_ACCEPTANCE_STATEMENT,
  PRICING_STATEMENT,
} from "@/lib/site/claims";
import "./home.css";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** Illustrative verdict stream for the hero. Benign examples only; not live data. */
const stream = [
  { agent: "Claude Code", action: "Bash", target: "pnpm test", verdict: "allow" },
  { agent: "Cursor", action: "Write", target: "src/billing/invoice.ts", verdict: "allow" },
  { agent: "Codex", action: "Bash", target: "curl … | sh", verdict: "deny", why: "Remote script piped to a shell" },
  { agent: "OpenCode", action: "Read", target: "~/.aws/credentials", verdict: "deny", why: "Cloud credential read" },
  { agent: "Claude Code", action: "mcp__github__merge", target: "release/1.4", verdict: "ask", why: "Held for an operator" },
  { agent: "Browser", action: "Prompt", target: "chatgpt.com", verdict: "masked", why: "IBAN and T.C. kimlik replaced" },
] as const;

const surfaces = [
  "Claude Code",
  "Cursor",
  "VS Code",
  "Codex CLI",
  "OpenCode",
  "OpenClaw",
  "MCP servers",
  "ChatGPT",
  "Gemini",
  "Claude",
  "Copilot",
  "Perplexity",
];

const pillars = [
  {
    id: "agents",
    eyebrow: "Agent Guard",
    title: "Every tool call, judged before it runs.",
    body: `Connectors sit inside the agent host and check shell commands, file reads and writes, web fetches and MCP calls against ${DETECTION_RULES.count} readable rules and your policy. Risky calls are blocked or held for a person.`,
    points: ["Pre-execution decisions: allow, ask, deny", "Session containment after a critical block", "Tool-output inspection before the model reads it"],
  },
  {
    id: "mcp",
    eyebrow: "MCP Gateway",
    title: "Trust the tools, not just the model.",
    body: "A loopback gateway between agents and MCP servers. Tool definitions are signed and pinned, drift is caught, and results are inspected before they reach the model.",
    points: ["Signed tool manifests and drift detection", "Operator-only approval, never an agent tool", "Response blocking for secrets and injection"],
  },
  {
    id: "people",
    eyebrow: "Browser Guard + Privacy",
    title: "People use AI too. Their data stays theirs.",
    body: "A Chrome, Edge and Firefox extension masks personal data and secrets before prompts, pastes and files reach AI chat products, and restores the originals only on the user's screen.",
    points: ["Turkish and English personal data with checksum validation", "Exact-data match for your own records", "Shadow-AI discovery and acceptable-use notices"],
  },
  {
    id: "command",
    eyebrow: "Command Center",
    title: "One policy. Every agent. Full evidence.",
    body: "Publish policy to the fleet, review incidents, approve held actions out of band and export a tamper-evident audit trail to your SIEM.",
    points: ["Signed policy rollout with two-person approval", "SSO, SCIM, roles and IP allowlists", "Hash-chained admin audit and signed response chain"],
  },
];

const loop = [
  { step: "01", title: "Observe", desc: "The connector receives the call the agent is about to make: the command, the path, the URL, the MCP tool and its arguments." },
  { step: "02", title: "Decide", desc: "Rules, policy, package and supply-chain checks and session context are merged into one verdict. Deny wins over ask, ask over allow." },
  { step: "03", title: "Enforce", desc: "The host is told to run, block or wait. A held call needs a person; the agent never receives a tool that could approve itself." },
  { step: "04", title: "Prove", desc: "Every verdict is written to a local audit log and, when managed, to a signed chain your auditors can verify byte for byte." },
];

const principles = [
  {
    title: "An approval the agent cannot forge",
    desc: "Held actions are released by an operator, out of band. No connector exposes an approval tool, so a prompt-injected agent cannot unblock itself.",
  },
  {
    title: "Rules you can read",
    desc: `Detection is data: ${DETECTION_RULES.count} YAML rules in ${DETECTION_RULES.files} files, each mapped to OWASP LLM and MITRE ATLAS. Review them, extend them, ship your own.`,
  },
  {
    title: "Runs where your data must stay",
    desc: "Local mode needs no account. Managed mode runs in our cloud, in your Kubernetes cluster with Helm, or fully air-gapped with a signed offline license.",
  },
  {
    title: "Blocks on failure",
    desc: "Connector entry points return a block on an internal error instead of letting the call through. A skipped signal is logged and never reported as clean.",
  },
];

const faqs = [
  {
    q: "What is AIDR?",
    a: "Singularity AIDR (AI Agent Detection & Response) is a control layer between AI agents and what they touch. It checks the tool calls coding agents make, inspects MCP traffic, and masks sensitive data people send to AI chat, before anything runs or leaves.",
  },
  {
    q: "Does it need a cloud account?",
    a: "No. Detection and policy run on the device and a fresh install enforces without an account. The managed Command Center is an optional layer for fleets.",
  },
  {
    q: "Which agents does it support?",
    a: `${CONNECTOR_SCOPE_STATEMENT} Each connector has documented limits. ${HOST_ACCEPTANCE_STATEMENT} See the install page.`,
  },
  {
    q: "Can an agent get around it?",
    a: "In some cases, yes. AIDR sees the actions that pass through the host's hook. A disabled hook, a separate terminal, or network access that never becomes a tool call is not seen. The install page lists the known limits for each connector.",
  },
  {
    q: "How is data handled?",
    a: "Detection runs on the device and does not upload source files or full prompts. Optional features send specific data, such as URLs, package names or file hashes, and managed telemetry defaults to hashes. The privacy page lists each path.",
  },
  {
    q: "What does it cost?",
    a: `${EVALUATION.sentence} ${PRICING_STATEMENT}`,
  },
  {
    q: "Is it certified?",
    a: "Not yet. There is no SOC 2 report, ISO 27001 certificate or independent penetration test. The trust center lists what is verified and what is open.",
  },
];

const verdictLabel: Record<string, string> = { allow: "Allowed", deny: "Blocked", ask: "Held", masked: "Masked" };

export default function Home() {
  return (
    <PageShell className="lp page-main">
      <section className="lp-hero" aria-labelledby="hero-heading">
        <div className="lp-hero-copy">
          <p className="lp-eyebrow">
            <span className="lp-dot" aria-hidden="true" /> AI Agent Detection &amp; Response
          </p>
          <h1 id="hero-heading" className="lp-display">
            Prevention for the <em>agentic</em> workforce.
          </h1>
          <p className="lp-lead">
            Your engineers now work alongside AI agents that run commands, edit code, call tools and browse on their
            behalf. Singularity AIDR is the detection layer between those agents and everything they touch, and it
            stops risky actions before they happen.
          </p>
          <HeroCtas secondaryHref="#features" secondaryLabel="Explore the platform" />
          <p className="lp-fineprint">
            In controlled evaluation. <Link href="/trust">See what is verified and what is open.</Link>
          </p>
        </div>

        <div className="lp-console" role="group" aria-label="Illustrative verdict stream">
          <div className="lp-console-bar">
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <p>aidr · verdicts</p>
          </div>
          <ol className="lp-stream">
            {stream.map((row, i) => (
              <li key={`${row.agent}-${row.target}`} className={`lp-row lp-row-${row.verdict}`} style={{ animationDelay: `${i * 0.35}s` }}>
                <div className="lp-row-main">
                  <span className="lp-agent">{row.agent}</span>
                  <span className="lp-action">{row.action}</span>
                  <code className="lp-target">{row.target}</code>
                </div>
                <div className="lp-row-side">
                  <span className={`lp-badge lp-badge-${row.verdict}`}>{verdictLabel[row.verdict]}</span>
                  {"why" in row ? <span className="lp-why">{row.why}</span> : null}
                </div>
              </li>
            ))}
          </ol>
          <p className="lp-console-note">Illustrative example, not live data.</p>
        </div>
      </section>

      <section className="lp-surfaces" aria-label="Where AIDR works">
        <p>Works where your teams already build</p>
        <ul>
          {surfaces.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <section className="lp-thesis" aria-labelledby="thesis-heading">
        <p className="lp-eyebrow">Why now</p>
        <h2 id="thesis-heading" className="lp-h2">
          Agents act with your people&apos;s privileges. Security still watches only the people.
        </h2>
        <div className="lp-thesis-grid">
          <article>
            <h3>Actions, not alerts</h3>
            <p>
              Endpoint and network tools report what already happened. An agent can read a credential, push a branch
              and call an API in seconds. The decision has to be made before the action, at the tool call.
            </p>
          </article>
          <article>
            <h3>Intent hides in context</h3>
            <p>
              The same command is routine in one session and an exfiltration step in another. AIDR follows the session:
              what was read, what was fetched, what is about to leave.
            </p>
          </article>
          <article>
            <h3>The prompt is an attack surface</h3>
            <p>
              Repositories, web pages and MCP results can carry instructions. AIDR inspects what agents read as well as
              what they do, and never lets an agent approve its own block.
            </p>
          </article>
        </div>
      </section>

      <section id="features" className="lp-platform" aria-labelledby="platform-heading">
        <p className="lp-eyebrow">The platform</p>
        <h2 id="platform-heading" className="lp-h2">
          One control layer for agents, tools and the people who use them.
        </h2>
        <div className="lp-pillars">
          {pillars.map((p) => (
            <article key={p.id} id={p.id} className="lp-pillar">
              <p className="lp-pillar-eyebrow">{p.eyebrow}</p>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
              <ul>
                {p.points.map((pt) => (
                  <li key={pt}>{pt}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="lp-loop" aria-labelledby="loop-heading">
        <p className="lp-eyebrow">How it works</p>
        <h2 id="loop-heading" className="lp-h2">
          Observe. Decide. Enforce. Prove.
        </h2>
        <ol className="lp-loop-grid">
          {loop.map((s) => (
            <li key={s.step}>
              <span className="lp-step">{s.step}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-principles" aria-labelledby="principles-heading">
        <p className="lp-eyebrow">Built differently</p>
        <h2 id="principles-heading" className="lp-h2">
          Security that holds up when the agent is the one being attacked.
        </h2>
        <div className="lp-principles-grid">
          {principles.map((p) => (
            <article key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="platforms" className="lp-connectors" aria-labelledby="connectors-heading">
        <p className="lp-eyebrow">Connectors</p>
        <h2 id="connectors-heading" className="lp-h2">
          Six agent hosts in scope. Honest about each one.
        </h2>
        <p className="lp-section-lead">Each connector uses the integration point its host offers. {HOST_ACCEPTANCE_STATEMENT}</p>
        <div className="lp-connector-grid">
          {CONNECTORS.map((connector) => (
            <article key={connector.id}>
              <h3>{connector.name}</h3>
              <p>{connector.interception}.</p>
              <p className={connector.acceptance.preview ? "lp-preview" : "lp-muted"}>{connector.acceptance.summary}</p>
              <Link href={`/install#${connector.id}`}>Install steps and limits →</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-deploy" aria-labelledby="deploy-heading">
        <div>
          <p className="lp-eyebrow">Deployment</p>
          <h2 id="deploy-heading" className="lp-h2">
            Your cloud, our cloud, or no cloud at all.
          </h2>
        </div>
        <div className="lp-deploy-grid">
          <article>
            <h3>Local</h3>
            <p>Connectors and Browser Guard decide on the device. No account is needed for detection.</p>
          </article>
          <article>
            <h3>Managed cloud</h3>
            <p>Command Center, device enrollment, central policy, audit export, SSO and SCIM.</p>
          </article>
          <article>
            <h3>Self-hosted and air-gapped</h3>
            <p>Docker Compose or Kubernetes with Helm, with signed offline licenses and intel packs.</p>
          </article>
        </div>
      </section>

      <section id="faq" className="lp-faq" aria-labelledby="faq-heading">
        <p className="lp-eyebrow">FAQ</p>
        <h2 id="faq-heading" className="lp-h2">
          Questions buyers ask first
        </h2>
        <div className="lp-faq-list">
          {faqs.map((faq) => (
            <details key={faq.q}>
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-cta" aria-labelledby="cta-heading">
        <h2 id="cta-heading" className="lp-display lp-display-sm">
          Put a control layer between your agents and your company.
        </h2>
        <p>
          {EVALUATION.sentence} {PRICING_STATEMENT}
        </p>
        <div className="btn-row lp-cta-row">
          <Link href="/pilot" className="btn">
            Apply for the evaluation
          </Link>
          <Link href="/contact?topic=sales" className="btn btn-secondary">
            Talk to the team
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
