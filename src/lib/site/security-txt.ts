import { SECURITY_TXT_EXPIRES, getContactEmail, getSiteUrl } from "./config";

/**
 * RFC 9116 security.txt. The Contact field is the configured security mailbox when
 * one exists; otherwise it is the security contact form, so the file never lists an
 * address that nobody monitors.
 */
export function buildSecurityTxt(): string {
  const site = getSiteUrl();
  const email = getContactEmail("security");
  const lines = [
    email ? `Contact: mailto:${email}` : `Contact: ${site}/contact?topic=security`,
    `Expires: ${SECURITY_TXT_EXPIRES}`,
    "Preferred-Languages: en",
    `Canonical: ${site}/.well-known/security.txt`,
    `Policy: ${site}/security#disclosure`,
  ];
  return `${lines.join("\n")}\n`;
}
