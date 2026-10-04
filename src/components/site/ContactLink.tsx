import Link from "next/link";
import { getContactEmail, type ContactChannel } from "@/lib/site/config";

/**
 * Shows a mailto link only when the owner has configured a monitored mailbox for
 * the channel. Otherwise it points to the contact form, so a page never shows an
 * address nobody reads.
 */
export function ContactLink({ channel, children }: { channel: ContactChannel; children?: React.ReactNode }) {
  const email = getContactEmail(channel);
  if (email) {
    return <a href={`mailto:${email}`}>{children ?? email}</a>;
  }
  return <Link href={`/contact?topic=${channel}`}>{children ?? "the contact form"}</Link>;
}
