import Link from "next/link";
import { ContactLink } from "@/components/site/ContactLink";
import { DocHeader, DocSection } from "@/components/site/Doc";
import { LegalDraftBanner, LegalMeta } from "@/components/site/LegalDraft";
import { EVALUATION, PRICING_STATEMENT } from "@/lib/site/claims";
import { pageMetadata } from "@/lib/site/metadata";

export const metadata = pageMetadata({
  title: "Terms (draft)",
  description:
    "Plain-language draft of the terms for the Singularity AIDR website and 14-day evaluation. Pending legal review.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <>
      <DocHeader
        eyebrow="Legal"
        title="Terms of use (draft)"
        lead="The ground rules for using this website and the 14-day evaluation, in plain language."
      >
        <LegalMeta />
      </DocHeader>
      <LegalDraftBanner />

      <DocSection id="status" title="Status of this document">
        <p>
          This is a working draft. Until counsel has approved it and an effective date is set, it is not a binding
          agreement. A signed order and evaluation charter will govern any real use, and where they differ from this page
          they win.
        </p>
      </DocSection>

      <DocSection id="service" title="The service">
        <p>
          Singularity AIDR inspects the tool calls of AI coding agents and blocks or flags ones that look risky. The
          website describes the product; the hosted dashboard lets an enrolled account see agents, events and incidents
          and manage policy.
        </p>
      </DocSection>

      <DocSection id="evaluation" title="Evaluation">
        <ul>
          <li>{EVALUATION.sentence}</li>
          <li>Access is by application and approval. Submitting an application does not grant access.</li>
          <li>
            Do not use real customer data, regulated data or production secrets in an evaluation unless a written
            charter says you may.
          </li>
          <li>
            There is no service-level agreement, uptime commitment or committed support response time during the
            evaluation.
          </li>
          <li>
            We can end an evaluation early if it is being misused or if we cannot support the environment. You can stop
            at any time by removing the connector.
          </li>
        </ul>
        <p>
          See <Link href="/pilot">evaluation application</Link> and <Link href="/pricing">pricing</Link>.
        </p>
      </DocSection>

      <DocSection id="fees" title="Fees">
        <p>{PRICING_STATEMENT}</p>
        <p>
          Any fees, billing terms, invoicing, taxes and renewal terms will be set out in a written order. Nothing on
          this website is an offer to sell at a stated price.
        </p>
      </DocSection>

      <DocSection id="use" title="Acceptable use">
        <ul>
          <li>Use the service lawfully and only on systems and accounts you are authorized to protect.</li>
          <li>Do not attempt to break, probe or overload the service, or to access another customer&apos;s data.</li>
          <li>
            Report vulnerabilities through the <Link href="/security#disclosure">disclosure process</Link> rather than
            testing them against live accounts.
          </li>
          <li>Keep credentials and install codes confidential. You are responsible for activity under your account.</li>
        </ul>
      </DocSection>

      <DocSection id="detection" title="What the product does and does not promise">
        <p>
          AIDR reduces risk; it does not eliminate it. It can only act on tool calls that the host application routes
          through its hook, and a host can fail open if a hook is disabled, crashes or times out. Detection can produce
          false positives and false negatives. Do not treat it as the only control protecting a system. The known limits
          are listed per connector on the <Link href="/install">install page</Link>.
        </p>
      </DocSection>

      <DocSection id="data" title="Your data">
        <p>
          You keep ownership of your data. You give us the permission needed to operate the service for you. How data is
          handled is described in the <Link href="/privacy">privacy draft</Link> and, for organizations, the{" "}
          <Link href="/dpa">DPA summary</Link>.
        </p>
      </DocSection>

      <DocSection id="warranty" title="Warranties, liability and law">
        <p>
          To be completed by counsel. This draft intentionally does not state warranty disclaimers, liability caps,
          indemnities, the governing law or the venue, because those terms need legal drafting and approval.
        </p>
      </DocSection>

      <DocSection id="changes" title="Changes and contact">
        <p>
          We will replace this draft with an approved version and show the effective date at the top. Questions:{" "}
          <ContactLink channel="legal">legal contact</ContactLink>.
        </p>
      </DocSection>
    </>
  );
}
