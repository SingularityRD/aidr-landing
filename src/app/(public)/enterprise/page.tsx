import Link from "next/link";
import { Callout, DataTable, DocHeader, DocSection, Pill } from "@/components/site/Doc";
import { ENTERPRISE_CAPABILITIES, ENTERPRISE_STATEMENT, type Availability } from "@/lib/site/enterprise";
import { EVALUATION, PRICING_STATEMENT } from "@/lib/site/claims";
import { pageMetadata } from "@/lib/site/metadata";

export const metadata = pageMetadata({
  title: "Enterprise",
  description:
    "Enterprise deployment options for Singularity AIDR, with each capability labelled as implemented, partial or roadmap.",
  path: "/enterprise",
});

const TONE: Record<Availability, "ok" | "warn" | "bad"> = {
  Implemented: "ok",
  Partial: "warn",
  Roadmap: "bad",
};

export default function EnterprisePage() {
  return (
    <>
      <DocHeader
        eyebrow="Enterprise"
        title="Enterprise deployment options"
        lead="What exists today for organizations, what is partial, and what is still on the roadmap. Capabilities are labelled by how they are actually delivered."
      />

      <Callout tone="warn" title="Read the labels.">
        {ENTERPRISE_STATEMENT}
      </Callout>

      <DocSection id="deployments" title="Deployment options">
        <div className="doc-grid">
          <div className="doc-card">
            <h3>Local enforcement</h3>
            <p>
              The connector evaluates tool calls on the developer machine with the bundled rules, with no account and no
              network connection required. Optional outbound features can be turned off.
            </p>
          </div>
          <div className="doc-card">
            <h3>Managed cloud</h3>
            <p>
              A hosted dashboard for enrolled agents: device authorization, policy rollout, events, incidents and signed
              webhook export. Regions and residency are not yet confirmed.
            </p>
          </div>
          <div className="doc-card">
            <h3>Self-hosted control plane</h3>
            <p>
              A single-host Docker baseline with migration, bootstrap and smoke tooling. It needs production TLS, mail,
              backup, sizing and high-availability work before it is offered for production use.
            </p>
          </div>
        </div>
      </DocSection>

      <DocSection id="capabilities" title="Capability matrix">
        <DataTable
          caption="Enterprise capabilities by deployment option"
          rows={ENTERPRISE_CAPABILITIES}
          rowKey={(row) => row.name}
          columns={[
            { header: "Capability", render: (row) => row.name, rowHeader: true },
            { header: "Managed cloud", render: (row) => <Pill tone={TONE[row.managed]}>{row.managed}</Pill> },
            { header: "Self-hosted", render: (row) => <Pill tone={TONE[row.selfHosted]}>{row.selfHosted}</Pill> },
            { header: "Notes", render: (row) => row.note },
          ]}
        />
        <p style={{ marginTop: 12 }}>
          Implemented: present and reachable, not accepted in a customer environment. Partial: some of it exists and the
          note lists what remains. Roadmap: not implemented for that option.
        </p>
      </DocSection>

      <DocSection id="commercial" title="Orders and evaluation">
        <p>{PRICING_STATEMENT} Enterprise orders are placed by invoice against a written order form.</p>
        <p>
          Before an order, you can run a {EVALUATION.label} to look at the product in your own environment. See{" "}
          <Link href="/pilot">the evaluation application</Link>.
        </p>
        <p>
          Procurement material available now is listed in the <Link href="/trust">trust center</Link>. A signed DPA, an
          SLA and a penetration-test report are not available yet.
        </p>
        <div className="btn-row">
          <Link className="btn" href="/contact?topic=sales">
            Contact sales
          </Link>
          <Link className="btn btn-secondary" href="/security">
            Security overview
          </Link>
        </div>
      </DocSection>
    </>
  );
}
