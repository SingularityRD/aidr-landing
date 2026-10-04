import Link from "next/link";
import { ContactLink } from "@/components/site/ContactLink";
import { Callout, DataTable, DocHeader, DocSection, Pill } from "@/components/site/Doc";
import { pageMetadata } from "@/lib/site/metadata";

export const metadata = pageMetadata({
  title: "Support",
  description: "How to get help with Singularity AIDR, and the draft support schedule that still needs owner approval.",
  path: "/support",
});

const APPROVAL = "Requires owner approval";

type Row = { item: string; evaluation: string; paid: string };

const SCHEDULE: Row[] = [
  { item: "Support channel and hours", evaluation: APPROVAL, paid: APPROVAL },
  { item: "Security incident channel and encryption", evaluation: APPROVAL, paid: APPROVAL },
  { item: "Holiday and language coverage (EU, US, APAC)", evaluation: APPROVAL, paid: APPROVAL },
  { item: "First-response target by severity", evaluation: APPROVAL, paid: APPROVAL },
  { item: "Update, workaround and resolution targets", evaluation: APPROVAL, paid: APPROVAL },
  { item: "On-call rota and escalation owner", evaluation: APPROVAL, paid: APPROVAL },
  { item: "Maintenance windows and exclusions", evaluation: APPROVAL, paid: APPROVAL },
  { item: "Service credits", evaluation: "None", paid: APPROVAL },
  {
    item: "Availability target (managed control plane and dashboard API)",
    evaluation: "None. Evaluation has no availability commitment.",
    paid: "Planning target 99.9% monthly. Not approved, not measured, not an SLA.",
  },
];

const SEVERITIES = [
  { level: "Severity 1", meaning: "Protection is failing broadly for a customer (for example agents blocked or unprotected at scale) or there is a confirmed security incident." },
  { level: "Severity 2", meaning: "A major function is impaired with no workaround, such as enrollment, policy rollout or event delivery for a group of agents." },
  { level: "Severity 3", meaning: "A function is impaired but a workaround exists, or a single agent is affected." },
  { level: "Severity 4", meaning: "A question, documentation gap or minor defect." },
];

export default function SupportPage() {
  return (
    <>
      <DocHeader
        eyebrow="Support"
        title="Support"
        lead="How to reach us today, and the support schedule we intend to offer once the owner has approved the numbers."
      />

      <Callout tone="warn" title="No response-time or availability commitment is in force.">
        The values in the schedule below are drafts. Cells marked &quot;{APPROVAL}&quot; have not been decided. Nothing on
        this page is an SLA.
      </Callout>

      <DocSection id="channels" title="Get help now">
        <ul>
          <li>
            <strong>Questions and issues:</strong> send them with the <Link href="/contact?topic=support">contact form</Link>
            {" "}or <ContactLink channel="support">the support contact</ContactLink>. A person reads each one; there is no
            24x7 line and no phone support.
          </li>
          <li>
            <strong>Service status:</strong> the <Link href="/status">status page</Link> shows live checks of this web
            application.
          </li>
          <li>
            <strong>Security issues:</strong> use the <Link href="/security#disclosure">disclosure process</Link>, not the
            support form.
          </li>
        </ul>
      </DocSection>

      <DocSection id="diagnostics" title="Sending diagnostics safely">
        <ul>
          <li>Do not send passwords, API keys, tokens, install codes or customer data.</li>
          <li>
            Local audit logs and incident files contain security evidence. Review and redact them before attaching them
            to a ticket.
          </li>
          <li>Support bundles are created only with your consent, and you can inspect one before sending it.</li>
        </ul>
      </DocSection>

      <DocSection id="severity" title="Draft severity definitions">
        <p>These definitions are proposals and map to internal incident levels once approved.</p>
        <DataTable
          caption="Draft customer severity definitions"
          rows={SEVERITIES}
          rowKey={(row) => row.level}
          columns={[
            { header: "Level", render: (row) => row.level, rowHeader: true },
            { header: "Meaning", render: (row) => row.meaning },
          ]}
        />
      </DocSection>

      <DocSection id="schedule" title="Draft support schedule">
        <DataTable
          caption="Draft support schedule: values marked Requires owner approval are not yet set"
          rows={SCHEDULE}
          rowKey={(row) => row.item}
          columns={[
            { header: "Item", render: (row) => row.item, rowHeader: true },
            {
              header: "14-day evaluation",
              render: (row) => (row.evaluation === APPROVAL ? <Pill tone="warn">{row.evaluation}</Pill> : row.evaluation),
            },
            {
              header: "Paid order",
              render: (row) => (row.paid === APPROVAL ? <Pill tone="warn">{row.paid}</Pill> : row.paid),
            },
          ]}
        />
      </DocSection>
    </>
  );
}
