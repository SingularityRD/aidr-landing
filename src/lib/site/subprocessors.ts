/**
 * Third parties that can process personal data or customer-supplied data for the
 * hosted web application (this repository). Drawn from the actual stack:
 * Clerk, Firebase/Firestore, Polar, Sentry, hosting and an optional CAPTCHA.
 *
 * "Location" is deliberately "Not yet confirmed": the region and residency
 * model is an open release gate (COM-011) and must not be implied.
 */

export type Subprocessor = {
  name: string;
  entity: string;
  purpose: string;
  data: string;
  trigger: string;
  location: string;
  status: "In use" | "In use when enabled" | "To be confirmed";
};

const NOT_CONFIRMED = "Not yet confirmed by the owner";

export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Clerk",
    entity: "Clerk, Inc.",
    purpose: "Sign-in, sessions and user identity for the web application.",
    data: "Email address, name, profile image, sign-in method, session identifiers.",
    trigger: "Whenever a person signs in or creates an account.",
    location: NOT_CONFIRMED,
    status: "In use",
  },
  {
    name: "Firebase / Cloud Firestore",
    entity: "Google LLC",
    purpose: "Database for account-scoped control-plane records.",
    data: "Registered agents and installation identifiers, policy documents, security events and incidents sent by enrolled agents, audit records, billing entitlements, waitlist and pilot requests.",
    trigger: "Whenever an account uses the dashboard or an enrolled agent reports to the control plane.",
    location: NOT_CONFIRMED,
    status: "In use",
  },
  {
    name: "Polar",
    entity: "Polar Software, Inc.",
    purpose: "Checkout, subscription billing and, where applicable, payment and tax handling as merchant of record.",
    data: "Billing contact, plan and seat count, payment and tax details entered in Polar checkout. Card details are entered at Polar and are not stored by this application.",
    trigger: "Only when an order or subscription is created through hosted checkout.",
    location: NOT_CONFIRMED,
    status: "In use when enabled",
  },
  {
    name: "Sentry",
    entity: "Functional Software, Inc. (Sentry)",
    purpose: "Error and performance diagnostics for the web application.",
    data: "Error messages, stack traces, request URL and technical metadata. Session replay is not enabled. Browser diagnostics are sent only after a visitor opts in.",
    trigger: "Server-side errors when a Sentry project is configured; browser errors only after opt-in.",
    location: NOT_CONFIRMED,
    status: "In use when enabled",
  },
  {
    name: "Application hosting and edge network",
    entity: "To be confirmed (the repository contains deployment targets for Vercel, Google Cloud Run and Cloudflare Workers)",
    purpose: "Serving the website and API, TLS termination and request routing.",
    data: "Request metadata (IP address, user agent, URL), and the content of requests to the application.",
    trigger: "Every request.",
    location: NOT_CONFIRMED,
    status: "To be confirmed",
  },
  {
    name: "Cloudflare Turnstile",
    entity: "Cloudflare, Inc.",
    purpose: "Bot protection on forms and sign-in when a Turnstile site key is configured.",
    data: "Challenge response token, IP address and browser signals used for the challenge.",
    trigger: "Only when bot-protection keys are configured. No keys are configured at the time of writing.",
    location: NOT_CONFIRMED,
    status: "In use when enabled",
  },
  {
    name: "Contact-form destination",
    entity: "The ticketing, chat or CRM service the owner configures for sales and support enquiries",
    purpose: "Receives messages submitted through the contact form.",
    data: "Name, work email, company, topic and message text submitted by the visitor.",
    trigger: "Only when a visitor submits the contact form and a destination is configured.",
    location: NOT_CONFIRMED,
    status: "To be confirmed",
  },
];
