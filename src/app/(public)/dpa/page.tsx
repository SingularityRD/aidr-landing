import Link from "next/link";
import { ContactLink } from "@/components/site/ContactLink";
import { Callout, DocHeader, DocSection } from "@/components/site/Doc";
import { LegalDraftBanner, LegalMeta } from "@/components/site/LegalDraft";
import { pageMetadata } from "@/lib/site/metadata";

export const metadata = pageMetadata({
  title: "Data Processing Addendum summary (draft)",
  description:
    "Summary of what the Singularity AIDR Data Processing Addendum template will cover. No executed DPA is available yet.",
  path: "/dpa",
});

export default function DpaPage() {
  return (
    <>
      <DocHeader
        eyebrow="Legal"
        title="Data Processing Addendum: summary (draft)"
        lead="What a data processing addendum between your organization and Singularity AIDR is expected to cover. This is a summary of intent, not the contract."
      >
        <LegalMeta />
      </DocHeader>
      <LegalDraftBanner />

      <Callout tone="warn" title="No executable DPA exists yet.">
        The full template is being prepared for counsel. We cannot sign a DPA today, and this page does not create any
        obligation.
      </Callout>

      <DocSection id="roles" title="Roles">
        <p>
          For dashboard records about your agents, users and security events, your organization is the controller and
          Singularity Research &amp; Development acts as processor. For website enquiries and our own account
          administration we act as controller.
        </p>
      </DocSection>

      <DocSection id="processing" title="Subject matter and data">
        <ul>
          <li>
            <strong>Purpose:</strong> operate the hosted control plane and dashboard for the agents you enroll.
          </li>
          <li>
            <strong>Data subjects:</strong> your developers and administrators, and people named in event data.
          </li>
          <li>
            <strong>Categories:</strong> account identifiers, agent and installation identifiers, security events
            (verdicts, rule identifiers and, depending on the redaction mode, hashes or text of commands, URLs and
            paths), audit entries and billing contacts.
          </li>
          <li>
            <strong>Duration:</strong> the term of the order plus a deletion or return period to be agreed.
          </li>
        </ul>
      </DocSection>

      <DocSection id="commitments" title="What the template is expected to commit us to">
        <ul>
          <li>Process personal data only on your documented instructions.</li>
          <li>Keep personnel with access bound to confidentiality.</li>
          <li>
            Apply the technical and organizational measures summarised on the <Link href="/security">security page</Link>,
            and no more than is true today.
          </li>
          <li>
            Use only the providers on the <Link href="/security#subprocessors">subprocessor list</Link>, and give notice
            of changes. The notice period and objection process are to be agreed.
          </li>
          <li>Help with data-subject requests and with your assessments, within reasonable limits.</li>
          <li>Notify you of a personal-data breach without undue delay. The target time is to be agreed.</li>
          <li>Return or delete your data at the end of the service, subject to backup expiry.</li>
          <li>Allow reasonable audits or provide equivalent information.</li>
        </ul>
      </DocSection>

      <DocSection id="transfers" title="International transfers and residency">
        <p>
          Provider regions are not yet confirmed and regional placement (EU, US, APAC) is not available. Transfer
          mechanisms such as standard contractual clauses will be attached once the regions and providers are final.
        </p>
      </DocSection>

      <DocSection id="request" title="Requesting the template">
        <p>
          If your procurement process needs the DPA template, or a security and privacy questionnaire answered, ask via{" "}
          <ContactLink channel="legal">the legal contact</ContactLink>. We will say plainly which answers are not yet
          available.
        </p>
      </DocSection>
    </>
  );
}
