import Link from "next/link";
import ContactForm from "@/components/site/ContactForm";
import { ContactLink } from "@/components/site/ContactLink";
import { Callout, DocHeader, DocSection } from "@/components/site/Doc";
import { getContactEmail, type ContactChannel } from "@/lib/site/config";
import { CONTACT_TOPICS, getContactDestination, type ContactTopic } from "@/lib/site/contact";
import { pageMetadata } from "@/lib/site/metadata";

export const metadata = pageMetadata({
  title: "Contact",
  description: "Contact Singularity AIDR about enterprise orders, the 14-day evaluation, support, privacy or security.",
  path: "/contact",
});

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string | string[] }>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.topic) ? params.topic[0] : params.topic;
  const topic = (CONTACT_TOPICS as readonly string[]).includes(requested ?? "") ? (requested as ContactTopic) : undefined;
  // Never show a form whose submissions cannot be delivered (the API answers 503 contact_unavailable).
  const formConnected = Boolean(getContactDestination());
  const mailboxes = (["sales", "security", "privacy"] as const)
    .map((channel) => [channel, getContactEmail(channel)] as const)
    .filter((entry): entry is readonly [ContactChannel, string] => Boolean(entry[1]));
  const fallbackEmail = getContactEmail(topic === "security" || topic === "privacy" ? topic : "sales");

  return (
    <>
      <DocHeader
        eyebrow="Contact"
        title="Talk to us"
        lead="Use this form for enterprise orders, the 14-day evaluation, support, privacy requests and procurement questions. A person reads every message."
      />

      <DocSection title="Send a message">
        {formConnected ? (
          <ContactForm initialTopic={topic} fallbackEmail={fallbackEmail ?? undefined} />
        ) : (
          <Callout tone="warn" title="The contact form is not connected on this deployment.">
            Messages cannot be delivered from this page yet, so the form is not shown.{" "}
            {mailboxes.length > 0 ? (
              <>
                Please write to{" "}
                {mailboxes.map(([label, email], index) => (
                  <span key={label}>
                    {index > 0 ? (index === mailboxes.length - 1 ? " or " : ", ") : null}
                    <a href={`mailto:${email}`}>{email}</a> ({label})
                  </span>
                ))}
                .
              </>
            ) : (
              <>No monitored mailbox is configured either. Please try again later.</>
            )}
          </Callout>
        )}
      </DocSection>

      <DocSection title="Other routes">
        <ul>
          <li>
            Support for evaluation users: see <Link href="/support">Support</Link>.
          </li>
          <li>
            Privacy and data requests: <ContactLink channel="privacy">use the privacy contact</ContactLink>.
          </li>
          <li>
            Security reports: follow the <Link href="/security#disclosure">disclosure process</Link>. Do not put vulnerability
            details in this form.
          </li>
        </ul>
        <Callout tone="info" title="No response-time commitment yet.">
          Reply targets have not been approved. Do not rely on this form for urgent or production-impacting issues.
        </Callout>
      </DocSection>
    </>
  );
}
