/**
 * Trust-center data. Every row is a statement of fact about assurance status.
 * Do not move a row to "Available" without an evidence reference the owner can
 * produce to a buyer. Wording avoids the blocked claim patterns in the product
 * repository's commercial-go-evidence-registry.json.
 */

export type TrustStatus = "Not yet" | "Open" | "Self-reported" | "Draft";

export type TrustItem = {
  area: string;
  status: TrustStatus;
  detail: string;
};

export const TRUST_ITEMS: TrustItem[] = [
  {
    area: "SOC 2 attestation report",
    status: "Not yet",
    detail: "No SOC 2 audit has been completed and no report exists. We do not claim SOC 2 status.",
  },
  {
    area: "ISO/IEC 27001 certificate",
    status: "Not yet",
    detail: "No ISO 27001 certification exists. We do not claim ISO 27001 status.",
  },
  {
    area: "Independent penetration test",
    status: "Open",
    detail:
      "An independent assessment with no unresolved critical or high findings is a release gate (SEC-EXT-001) and is still open. No test report can be shared yet.",
  },
  {
    area: "Privacy and data-flow review by counsel",
    status: "Open",
    detail:
      "Engineering data-flow inventories exist. Counsel-approved privacy, terms and DPA documents do not yet exist; the pages on this site are drafts (gates COM-002 and COM-003).",
  },
  {
    area: "Regional data residency (EU, US, APAC)",
    status: "Open",
    detail: "Tenant placement by region is intended but not proven. No residency commitment is made today (COM-011).",
  },
  {
    area: "Availability commitment",
    status: "Draft",
    detail:
      "A 99.9% monthly availability target is drafted for the managed control plane. It is not approved, not measured and not offered as an SLA (COM-013).",
  },
  {
    area: "Real-host connector acceptance",
    status: "Open",
    detail:
      "Connectors are tested against the product code and mocked host contracts. Acceptance on real, licensed hosts for each operating system is not complete (COM-010).",
  },
  {
    area: "Secure development practices",
    status: "Self-reported",
    detail:
      "Automated unit and integration tests, type checks, linting, dependency overrides for known advisories and secret scanning are run by the engineering team. These are not independently audited.",
  },
  {
    area: "Vulnerability disclosure",
    status: "Draft",
    detail:
      "A disclosure policy and a security.txt file are published. Response targets are not yet approved or staffed; see the security page.",
  },
];

export const TRUST_STATEMENT =
  "This page lists what has and has not been independently verified. Items marked Not yet or Open are not in place. We will not describe an item as certified, compliant or attested until the evidence exists and has been approved for use.";
