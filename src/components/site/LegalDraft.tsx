import {
  COMPANY_NAME,
  LEGAL_DRAFT_LABEL,
  LEGAL_DRAFT_PENDING_REVIEW,
  LEGAL_EFFECTIVE_DATE,
} from "@/lib/site/config";

/** Effective date text, driven by the single switch in lib/site/config.ts. */
export function legalEffectiveLabel(): string {
  if (LEGAL_DRAFT_PENDING_REVIEW || !LEGAL_EFFECTIVE_DATE) return "TBD";
  return LEGAL_EFFECTIVE_DATE;
}

/**
 * Visible draft marker for legal pages. Renders nothing once
 * LEGAL_DRAFT_PENDING_REVIEW is set to false in lib/site/config.ts.
 */
export function LegalDraftBanner() {
  if (!LEGAL_DRAFT_PENDING_REVIEW) return null;
  return (
    <div className="callout callout-warn" role="note" data-legal-draft="true">
      <strong>{LEGAL_DRAFT_LABEL}.</strong> This page is a plain-language draft written by the product team. It has not been
      reviewed or approved by counsel, is not a binding contract and may change. Do not rely on it for a purchasing, legal or
      compliance decision, and do not send production or personal data on the strength of this page.
    </div>
  );
}

export function LegalMeta() {
  return (
    <p className="doc-lead" style={{ marginTop: 12, fontSize: 14 }}>
      {COMPANY_NAME} &middot; Effective date: {legalEffectiveLabel()}
    </p>
  );
}

