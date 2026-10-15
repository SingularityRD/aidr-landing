/**
 * Enterprise capability matrix. Source: the product repository's
 * FEATURE_INVENTORY.md / FEATURE_INVENTORY.json (generated 2026-09-24), its changes of
 * 2026-10-13 to 2026-10-15 (fleet enrollment, OIDC JIT and on-prem IdP, SIEM forwarding,
 * HSM code signing, air-gap bundles, per-customer installers, Browser Guard work accounts;
 * PRODUCTION_SALES_GAPS.md still records NO-GO) and the managed web application in this repository.
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
    note: "Sign-in uses Clerk. Enterprise SSO connections are not configured or accepted for the managed web app. The self-hosted control plane has OIDC and SAML sign-in, optional just-in-time provisioning (per tenant, verified domains only, group-to-role mapping that never grants owner) and support for an internal identity provider with an internal CA. Real Entra or Okta acceptance and audited SAML enforcement remain open.",
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
    note: "The managed dashboard can send signed webhook exports of deny and critical events, policy-rollout reminders and escalations, with failed deliveries tracked and replayable. The self-hosted control plane forwards centrally to syslog (TLS, TCP or UDP), Splunk HEC, Elastic and Microsoft Sentinel, or a signed webhook, through a queued outbox with dead letters; QRadar and Wazuh are covered by integration guides, not native forwarders. No forwarding path has been accepted against a customer SIEM and delivery receipts are still open.",
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
    note: "Local detection runs without a network connection and optional outbound legs can be disabled. A signed offline image bundle and licence-bound offline detection-content packs with an import folder and revocation list exist for the self-hosted control plane. The offline install and update path has not been accepted in a customer environment.",
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
  {
    name: "Fleet enrollment for mass deployment",
    managed: "Roadmap",
    selfHosted: "Partial",
    note: "The managed web app enrolls one device per install code. The self-hosted control plane issues reusable fleet enrollment keys with a machine cap, an expiry of at most 365 days, revocation and audit, with recipes for MSI/SCCM, Intune, Group Policy and Ansible. Not yet accepted in a customer fleet.",
  },
  {
    name: "Per-customer signed installers",
    managed: "Partial",
    selfHosted: "Partial",
    note: "Per-customer MSI, EXE, deb, rpm and tar.gz builds embed a vendor-signed customer packet. Windows Authenticode signing with a non-exportable key (Azure Key Vault, a cloud HSM or a PKCS#11 token) is wired, but no code-signing certificate has been issued yet, so Windows installers are not Authenticode-signed today. No macOS installer is offered.",
  },
  {
    name: "Browser Guard for web AI assistants",
    managed: "Partial",
    selfHosted: "Partial",
    note: "A Manifest V3 extension for Chrome and Edge 120+ and Firefox 140+ covers the ChatGPT, Claude, Gemini and Copilot web apps and can tell personal from company accounts (warn, block or mask). It is not listed in a browser store, and desktop apps and Safari are not covered. Not yet accepted in a customer environment.",
  },
];

export const ENTERPRISE_STATEMENT =
  "Nothing in this table has been accepted in a customer environment. Implemented means the capability exists in the product and is reachable; it does not mean it is certified, independently tested or covered by a service commitment.";
