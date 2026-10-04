/**
 * Site-wide constants for the public website.
 *
 * Everything an owner has to approve, replace or remove before a public launch
 * lives in this file, so it can be reviewed in one place.
 */

export const SITE_NAME = "Singularity AIDR";
export const COMPANY_NAME = "Singularity Research & Development";
export const SITE_TAGLINE = "AI Agent Detection & Response";

/**
 * LEGAL DRAFT SWITCH
 *
 * The Privacy, Terms and DPA pages are plain-language drafts that have NOT been
 * reviewed by counsel. While this is `true`, every legal page shows a visible
 * "Draft pending legal review" banner and the effective date reads "TBD".
 *
 * To publish attorney-approved text: replace the page copy, set
 * LEGAL_EFFECTIVE_DATE to an ISO date (for example "2026-11-01") and flip this
 * constant to `false`. The banner and the "TBD" label disappear everywhere.
 */
export const LEGAL_DRAFT_PENDING_REVIEW = true;
export const LEGAL_EFFECTIVE_DATE: string | null = null;
export const LEGAL_DRAFT_LABEL = "Draft pending legal review — effective date TBD";

/** `security.txt` must be re-issued before this date (RFC 9116 requires an Expires field). */
export const SECURITY_TXT_EXPIRES = "2027-04-01T00:00:00.000Z";

/** Last time the claims on the public pages were reviewed against the product evidence. */
export const CONTENT_REVIEWED_ON = "2026-10-05";

const FALLBACK_SITE_URL = "https://aidr.singularityrd.com";

/** Absolute origin used for canonical URLs, the sitemap and security.txt. */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || FALLBACK_SITE_URL;
  try {
    return new URL(raw).origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

export type ContactChannel = "sales" | "support" | "security" | "privacy" | "legal";

/**
 * Public contact addresses. There are intentionally NO defaults: an address is
 * shown only when the owner has configured a monitored mailbox through the
 * environment. Otherwise pages direct visitors to the /contact form.
 */
export function getContactEmail(channel: ContactChannel): string | null {
  // Literal property access so Next.js can inline NEXT_PUBLIC_* values in client bundles.
  const value =
    channel === "sales"
      ? process.env.NEXT_PUBLIC_CONTACT_SALES_EMAIL
      : channel === "support"
        ? process.env.NEXT_PUBLIC_CONTACT_SUPPORT_EMAIL
        : channel === "security"
          ? process.env.NEXT_PUBLIC_CONTACT_SECURITY_EMAIL
          : channel === "privacy"
            ? process.env.NEXT_PUBLIC_CONTACT_PRIVACY_EMAIL
            : process.env.NEXT_PUBLIC_CONTACT_LEGAL_EMAIL;
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(trimmed) ? trimmed : null;
}

/** Public routes included in the sitemap and checked by the link tests. */
export const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/pilot",
  "/enterprise",
  "/install",
  "/security",
  "/trust",
  "/privacy",
  "/terms",
  "/dpa",
  "/support",
  "/status",
  "/contact",
  "/compare",
] as const;
