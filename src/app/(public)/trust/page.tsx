import Link from "next/link";
import { ContactLink } from "@/components/site/ContactLink";
import { DataTable, DocHeader, DocSection, Pill } from "@/components/site/Doc";
import { CONTENT_REVIEWED_ON } from "@/lib/site/config";
import { pageMetadata } from "@/lib/site/metadata";
import { TRUST_ITEMS, TRUST_STATEMENT, type TrustStatus } from "@/lib/site/trust";

export const metadata = pageMetadata({
  title: "Trust center",
  description:
    "What Singularity AIDR has and has not had independently verified: certifications, penetration testing, residency and availability.",
  path: "/trust",
});

const TONE: Record<TrustStatus, "ok" | "warn" | "bad" | undefined> = {
  "Not yet": "bad",
  Open: "warn",
  Draft: "warn",
  "Self-reported": undefined,
};

export default function TrustPage() {
  return (
    <>
      <DocHeader eyebrow="Trust" title="Trust center" lead={TRUST_STATEMENT}>
        <p className="doc-lead" style={{ marginTop: 12, fontSize: 14 }}>
          Content last reviewed against product evidence on {CONTENT_REVIEWED_ON}.
        </p>
      </DocHeader>

      <DocSection id="status" title="Assurance status">
        <DataTable
          caption="Assurance and compliance status"
          rows={TRUST_ITEMS}
          rowKey={(row) => row.area}
          columns={[
            { header: "Area", render: (row) => row.area, rowHeader: true },
            { header: "Status", render: (row) => <Pill tone={TONE[row.status]}>{row.status}</Pill> },
            { header: "Detail", render: (row) => row.detail },
          ]}
        />
      </DocSection>

      <DocSection id="available" title="What we can share today">
        <ul>
          <li>
            The <Link href="/security">security overview</Link>, data flow and subprocessor list.
          </li>
          <li>
            The <Link href="/install">per-connector limits</Link>, including known ways an action can bypass a hook.
          </li>
          <li>An engineering data-flow inventory and a limitations sheet, on request for an evaluation.</li>
          <li>A synthetic demonstration, clearly labelled as synthetic. It does not show detection effectiveness.</li>
        </ul>
        <p>
          Ask for these through <ContactLink channel="sales">the sales contact</ContactLink>. We would rather say
          &quot;not yet&quot; than stretch a claim.
        </p>
      </DocSection>

      <DocSection id="not-available" title="What we cannot share yet">
        <ul>
          <li>An attestation report, certificate or penetration-test report, because none exists.</li>
          <li>Customer references or case studies. There are none to publish.</li>
          <li>A signed DPA, an SLA, or a regional residency commitment.</li>
          <li>Measured detection-efficacy or latency figures.</li>
        </ul>
      </DocSection>
    </>
  );
}
