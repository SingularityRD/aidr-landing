import Link from "next/link";
import { ContactLink } from "@/components/site/ContactLink";
import { Callout, DataTable, DocHeader, DocSection, Pill } from "@/components/site/Doc";
import { FAILURE_POLICY_STATEMENT } from "@/lib/site/claims";
import { SECURITY_TXT_EXPIRES, getSiteUrl } from "@/lib/site/config";
import { pageMetadata } from "@/lib/site/metadata";
import { SUBPROCESSORS } from "@/lib/site/subprocessors";

export const metadata = pageMetadata({
  title: "Security",
  description:
    "Security overview for Singularity AIDR: vulnerability disclosure, data flow, product design, known limits and subprocessors.",
  path: "/security",
});

const FLOW = [
  {
    step: "1. Agent host",
    where: "Developer machine",
    what: "An AI coding agent proposes a tool call: a shell command, file write, web fetch or MCP action.",
  },
  {
    step: "2. Local detection",
    where: "Developer machine",
    what: "The AIDR connector extracts commands, URLs and paths and evaluates them against the rule set and policy. This runs locally and does not need a network connection.",
  },
  {
    step: "3. Verdict",
    where: "Developer machine",
    what: "The decision is allow, ask or deny. An ask is a block pending a human decision outside the agent session.",
  },
  {
    step: "4. Optional outbound legs",
    where: "Configured services",
    what: "URL, file and package reputation, version checks, deep scans and alert webhooks. Each one is controlled by configuration and is described in the privacy draft.",
  },
  {
    step: "5. Managed control plane",
    where: "Hosted dashboard",
    what: "Only for enrolled installations with sync turned on. Events pass a credential scrub and by default carry hashes instead of command text.",
  },
];

export default function SecurityPage() {
  const site = getSiteUrl();
  return (
    <>
      <DocHeader
        eyebrow="Security"
        title="Security overview"
        lead="How the product and this website are designed to be safe, how to report a problem, and what has not been independently verified."
      />

      <Callout tone="info" title="Read with the trust center.">
        This page describes design and controls. It is not an audit result. See the <Link href="/trust">trust center</Link>{" "}
        for what is certified (nothing yet) and what is still open.
      </Callout>

      <DocSection id="disclosure" title="Report a vulnerability">
        <p>
          If you find a security problem in the AIDR software, this website or the hosted dashboard, please tell us
          privately and give us a chance to fix it before you share it more widely.
        </p>
        <ul>
          <li>
            <strong>Where:</strong> <ContactLink channel="security">the security contact</ContactLink>. Machine-readable
            details are in <Link href="/.well-known/security.txt">security.txt</Link>.
          </li>
          <li>
            <strong>Include:</strong> what you found, steps to reproduce, affected versions, and the impact you expect.
          </li>
          <li>
            <strong>Please do not:</strong> access other people&apos;s data, degrade the service, or publish details before
            we have responded.
          </li>
          <li>
            <strong>Scope:</strong> the AIDR source and connectors, threat rules, distributed artifacts, this website and
            the hosted dashboard.
          </li>
        </ul>
        <Callout tone="warn" title="Response targets are not yet approved.">
          Acknowledgement, update and fix targets have not been approved or staffed, so none is promised here. Legal
          safe-harbor wording for good-faith research is also pending legal review. The security.txt file expires on{" "}
          {SECURITY_TXT_EXPIRES.slice(0, 10)} and must be reissued before then. Canonical copy:{" "}
          <code>{`${site}/.well-known/security.txt`}</code>.
        </Callout>
      </DocSection>

      <DocSection id="data-flow" title="Data flow">
        <p>
          Detection runs where the agent runs. Data leaves the machine only through the optional legs below, each of which
          is off or limited by default.
        </p>
        <DataTable
          caption="Data flow from an agent tool call to the control plane"
          rows={FLOW}
          rowKey={(row) => row.step}
          columns={[
            { header: "Step", render: (row) => row.step, rowHeader: true },
            { header: "Where", render: (row) => row.where },
            { header: "What happens", render: (row) => row.what },
          ]}
        />
        <p style={{ marginTop: 12 }}>
          Full detail, including retention and redaction modes, is in the <Link href="/privacy">privacy draft</Link>.
        </p>
      </DocSection>

      <DocSection id="design" title="How the product is designed">
        <ul>
          <li>
            <strong>Detection rules are data.</strong> Rules are YAML files, not hard-coded patterns, so they can be
            reviewed, updated or revoked without a code change.
          </li>
          <li>
            <strong>Approvals are not agent-callable.</strong> When a call is blocked pending approval, no tool is exposed
            to the agent to approve it. Approval is a human action outside the session, so a prompt-injected agent cannot
            approve its own block.
          </li>
          <li>
            <strong>Credential scrub at the boundary.</strong> Bearer credentials, API keys, tokens and secret URL
            parameters are removed before events leave the machine.
          </li>
          <li>
            <strong>Device authorization.</strong> Enrollment uses short-lived, single-use codes approved in the browser by
            a signed-in user.
          </li>
          <li>
            <strong>Signed policy and intel.</strong> Policy versions and offline intel packs can be signed. When a
            required managed policy is invalid or unavailable beyond a fixed grace period, the connector blocks
            instead of dropping to weaker local rules.
          </li>
        </ul>
        <h3>Failure behaviour</h3>
        <p>{FAILURE_POLICY_STATEMENT}</p>
      </DocSection>

      <DocSection id="web" title="How this website and dashboard are protected">
        <ul>
          <li>Sign-in and sessions are handled by Clerk; dashboard and control-plane routes require an authenticated session.</li>
          <li>
            Security headers are set on every response: a content security policy that blocks framing and plugins,
            HTTP Strict Transport Security in production, no MIME sniffing, a strict referrer policy and a restrictive
            permissions policy.
          </li>
          <li>Billing webhooks are verified by signature; internal scheduled jobs require a bearer secret.</li>
          <li>The contact form validates input, uses a honeypot and rate limits, and does not log submitted details.</li>
          <li>
            Optional browser diagnostics are off unless a visitor allows them, and session replay is not used.
          </li>
        </ul>
        <p>
          Known gap: the content security policy still permits inline scripts that the framework and Clerk require. A
          nonce-based policy is planned, not done.
        </p>
      </DocSection>

      <DocSection id="limits" title="Known limits of the product">
        <p>
          AIDR cannot see an action that never passes through the host&apos;s hook. A host that has its hook disabled,
          or that continues after a hook times out, can let a call through. Output inspection runs after a tool has
          run and cannot undo it. Per-connector limits are listed on the <Link href="/install">install page</Link>, and
          real-host acceptance is not complete.
        </p>
      </DocSection>

      <DocSection id="subprocessors" title="Subprocessors">
        <p>
          Third parties that can process data for the hosted application. Regions are not yet confirmed. We will give
          customers notice of changes once a notice process is agreed.
        </p>
        <DataTable
          caption="Subprocessors for the hosted web application"
          rows={SUBPROCESSORS}
          rowKey={(row) => row.name}
          columns={[
            { header: "Provider", render: (row) => row.name, rowHeader: true },
            { header: "Entity", render: (row) => row.entity },
            { header: "Purpose", render: (row) => row.purpose },
            { header: "Data", render: (row) => row.data },
            { header: "Location", render: (row) => row.location },
            {
              header: "Status",
              render: (row) => <Pill tone={row.status === "In use" ? "ok" : "warn"}>{row.status}</Pill>,
            },
          ]}
        />
      </DocSection>
    </>
  );
}
