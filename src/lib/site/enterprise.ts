/**
 * Enterprise capability matrix. Source: the product repository's
 * FEATURE_INVENTORY.md / FEATURE_INVENTORY.json (generated 2026-09-24) and the
 * managed web application in this repository.
 *
 * Availability vocabulary:
 *  - Implemented: code exists and is reachable; NOT yet accepted on a customer or real-host environment.
 *  - Partial: part of the capability exists; the listed work remains.
 *  - Roadmap: not implemented for this deployment option.
 */

export type Availability = "Implemented" | "Partial" | "Roadmap";

export type EnterpriseCapability = {
  name: string;
  managed: Availability;
  selfHosted: Availability;
  note: string;
};

export const ENTERPRISE_CAPABILITIES: EnterpriseCapability[] = [
  {
    name: "Single sign-on (SSO)",
    managed: "Roadmap",
    selfHosted: "Partial",
    note: "Sign-in uses Clerk. Enterprise SSO connections are not configured or accepted for the managed web app. The self-hosted control plane has SSO and directory sync code; real Entra or Okta acceptance and audited SAML enforcement remain open.",
  },
  {
    name: "SCIM directory provisioning",
    managed: "Roadmap",
    selfHosted: "Partial",
    note: "The managed web app has no SCIM endpoint. A SCIM function exists in the self-hosted control plane; provisioning has not been accepted against a real identity provider.",
  },
  {
    name: "SIEM and webhook export of security events",
    managed: "Implemented",
    selfHosted: "Partial",
    note: "The managed dashboard can send signed webhook exports of deny and critical events, policy-rollout reminders and escalations, with failed deliveries tracked and replayable. Customer SIEM configuration and delivery receipts are not yet accepted. Self-hosted SIEM delivery still needs a scheduled worker and native source coverage.",
  },
  {
    name: "Audit trail and audit export",
    managed: "Partial",
    selfHosted: "Implemented",
    note: "The managed app records control-plane audit entries with a 90-day retention window and supports CSV export for stale-agent lists. Paged audit export with signed cursors exists in the self-hosted control plane; the operator must schedule its cleanup.",
  },
  {
    name: "Policy distribution and two-person approval",
    managed: "Implemented",
    selfHosted: "Implemented",
    note: "Policies can be published to agents with rollout tracking, drift alerts and an optional two-person approval step. Enforcement on real hosts still needs acceptance.",
  },
  {
    name: "Role-based access and tenant isolation",
    managed: "Partial",
    selfHosted: "Implemented",
    note: "Tenant isolation and RBAC exist but an independent penetration test is still open, so isolation has not been independently verified.",
  },
  {
    name: "Self-hosted control plane",
    managed: "Roadmap",
    selfHosted: "Partial",
    note: "A single-host Docker baseline with migration, bootstrap and smoke tooling exists. Production TLS, mail delivery, backup, sizing and high-availability acceptance are required before it is offered for production.",
  },
  {
    name: "Air-gapped operation",
    managed: "Roadmap",
    selfHosted: "Partial",
    note: "Local detection runs without a network connection and optional outbound legs can be disabled. A portable install kit exists, but container images need network access or a separate image delivery process, and the offline path has not been accepted.",
  },
  {
    name: "Regional placement (EU, US, APAC)",
    managed: "Roadmap",
    selfHosted: "Roadmap",
    note: "Intended, not proven. No residency commitment is made.",
  },
  {
    name: "Invoice orders and private-registry distribution",
    managed: "Partial",
    selfHosted: "Partial",
    note: "Orders are intended to be placed by invoice with signed packages delivered through an authenticated private registry. Provider-of-record, publisher key custody and registry publication are still open.",
  },
];

export const ENTERPRISE_STATEMENT =
  "Nothing in this table has been accepted in a customer environment. Implemented means the capability exists in the product and is reachable; it does not mean it is certified, independently tested or covered by a service commitment.";
