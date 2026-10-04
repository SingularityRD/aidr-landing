import Link from "next/link";
import { Callout, DocHeader, DocSection } from "@/components/site/Doc";
import { EVALUATION, PRICING_STATEMENT } from "@/lib/site/claims";
import { pageMetadata } from "@/lib/site/metadata";

export const metadata = pageMetadata({
  title: "Evaluation and pricing",
  description:
    "A 14-day, 1-agent evaluation by application. Pricing for paid use is set by approved order; there is no public price list.",
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <>
      <DocHeader
        eyebrow="Evaluation and pricing"
        title="Try it for 14 days. Pay by approved order."
        lead={`${EVALUATION.sentence} ${PRICING_STATEMENT}`}
      />

      <DocSection id="options" title="Two ways to start">
        <div className="doc-grid">
          <div className="doc-card">
            <h3>{EVALUATION.label}</h3>
            <ul>
              <li>{EVALUATION.days} days from approval.</li>
              <li>{EVALUATION.agents} protected agent.</li>
              <li>By application. Applying does not grant access.</li>
              <li>For evaluation use: no production data, no service-level agreement.</li>
              <li>Ends after 14 days unless a written order is agreed.</li>
            </ul>
            <div className="btn-row">
              <Link className="btn" href="/pilot">
                Apply for the evaluation
              </Link>
            </div>
          </div>
          <div className="doc-card">
            <h3>Order for production use</h3>
            <ul>
              <li>Sized by the number of protected agents and the deployment option.</li>
              <li>Priced and invoiced under a written order form.</li>
              <li>Support terms, availability target and data terms are agreed in the order.</li>
              <li>Signed connectors for your hosts are intended to be delivered through an authenticated private registry.</li>
            </ul>
            <div className="btn-row">
              <Link className="btn btn-secondary" href="/contact?topic=sales">
                Talk to sales
              </Link>
            </div>
          </div>
        </div>
      </DocSection>

      <DocSection id="faq" title="Common questions">
        <h3>Is there a free plan?</h3>
        <p>No. There is a time-limited evaluation: 14 days and one protected agent.</p>
        <h3>What does it cost after the evaluation?</h3>
        <p>
          That is set by approved order. We do not publish a price list and nothing on this site is a quote. Tell us your
          agent count and deployment needs through the <Link href="/contact?topic=sales">contact form</Link>.
        </p>
        <h3>Do I need a credit card to apply?</h3>
        <p>The evaluation application does not take payment details.</p>
        <h3>What happens to my agent after 14 days?</h3>
        <p>
          Managed enrollment ends unless an order is agreed. Remove the connector at any time to stop all inspection.
        </p>
        <h3>Is there an SLA?</h3>
        <p>
          Not today. A 99.9% monthly availability target is drafted for the managed control plane but it is not approved
          or measured. See <Link href="/support">Support</Link>.
        </p>
        <h3>How is billing handled?</h3>
        <p>
          Enterprise orders are invoiced. Where hosted checkout is used, Polar processes payments; see the{" "}
          <Link href="/security#subprocessors">subprocessor list</Link>. Refund, tax and renewal terms are set in the
          order.
        </p>
      </DocSection>

      <Callout tone="info" title="Terms.">
        The <Link href="/terms">terms</Link> are a draft pending legal review. A signed order and evaluation charter
        control any real use.
      </Callout>
    </>
  );
}
