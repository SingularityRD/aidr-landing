import Link from "next/link";
import { ContactLink } from "@/components/site/ContactLink";
import { DataTable, DocHeader, DocSection } from "@/components/site/Doc";
import { LegalDraftBanner, LegalMeta } from "@/components/site/LegalDraft";
import { pageMetadata } from "@/lib/site/metadata";

export const metadata = pageMetadata({
  title: "Privacy (draft)",
  description:
    "Plain-language draft of how Singularity AIDR handles personal data on this website and in the hosted dashboard. Pending legal review.",
  path: "/privacy",
});

type DataRow = { category: string; examples: string; purpose: string; when: string };

const WEBSITE_DATA: DataRow[] = [
  {
    category: "Account and sign-in",
    examples: "Email address, name, profile image, sign-in method, session identifiers (held by Clerk).",
    purpose: "Create and secure your account and sign you in.",
    when: "When you sign in or create an account.",
  },
  {
    category: "Dashboard records",
    examples:
      "Registered agents and installation identifiers, policy documents, security events and incidents reported by your enrolled agents, audit entries, plan and seat information.",
    purpose: "Provide the dashboard, policy rollout, incident review and billing entitlements.",
    when: "When you use the dashboard or an enrolled agent reports to the control plane.",
  },
  {
    category: "Contact and evaluation requests",
    examples: "Name, work email, company, topic and message; the use case you describe in an evaluation application.",
    purpose: "Reply to you and decide whether to approve an evaluation.",
    when: "When you submit the contact form, the waitlist or the evaluation application.",
  },
  {
    category: "Billing",
    examples: "Billing contact, plan and seat count. Card and tax details are entered at Polar and are not stored here.",
    purpose: "Process orders placed through hosted checkout.",
    when: "Only if you place an order through hosted checkout.",
  },
  {
    category: "Technical request data",
    examples: "IP address, user agent, requested URL and timestamps, kept in hosting and application logs.",
    purpose: "Operate, secure and debug the website; rate-limit abuse.",
    when: "Every request.",
  },
  {
    category: "Optional error diagnostics",
    examples: "Error messages, stack traces and technical context sent to Sentry. Session replay is not enabled.",
    purpose: "Find and fix defects.",
    when: "Server-side when a Sentry project is configured. In your browser only if you choose Allow diagnostics.",
  },
];

export default function PrivacyPage() {
  return (
    <>
      <DocHeader
        eyebrow="Legal"
        title="Privacy notice (draft)"
        lead="How Singularity AIDR handles personal data on this website and in the hosted dashboard, in plain language."
      >
        <LegalMeta />
      </DocHeader>
      <LegalDraftBanner />

      <DocSection id="scope" title="What this covers">
        <p>
          This draft covers the public website and the hosted web dashboard operated by Singularity Research &amp;
          Development. The AIDR software that runs on a developer machine is described separately below, because most of
          what it does stays on that machine.
        </p>
        <p>
          Roles: for dashboard records about your agents and your users, your organization decides what is collected and
          we process it on your behalf (see the <Link href="/dpa">DPA summary</Link>). For website visits, sign-up and
          enquiries, we decide why and how data is used.
        </p>
      </DocSection>

      <DocSection id="data" title="Data we handle on the website and dashboard">
        <DataTable
          caption="Categories of data, why they are used and when they are collected"
          rows={WEBSITE_DATA}
          rowKey={(row) => row.category}
          columns={[
            { header: "Category", render: (row) => row.category, rowHeader: true },
            { header: "Examples", render: (row) => row.examples },
            { header: "Purpose", render: (row) => row.purpose },
            { header: "When", render: (row) => row.when },
          ]}
        />
        <p style={{ marginTop: 12 }}>
          We do not sell personal data. We do not run advertising or analytics trackers on this website.
        </p>
      </DocSection>

      <DocSection id="software" title="What the AIDR software does with data">
        <p>
          Detection and policy decisions run on the developer machine. Local detection does not upload source files or
          full prompts. Some features have their own outbound paths, and each one is controlled by configuration:
        </p>
        <ul>
          <li>
            <strong>URL, file and package reputation:</strong> when enabled, extracted URLs, package names and versions,
            and file hashes (SHA-256) are sent to the configured reputation service. File contents are not uploaded by
            these checks. In source defaults these checks are off, and they need a deployed first-party endpoint to work.
          </li>
          <li>
            <strong>Managed control plane:</strong> only when an installation is enrolled and sync is turned on. Events
            pass through a credential scrub, and by default tool summaries and artifacts are replaced by hashes.
            Other modes can keep ordinary command or URL text, so the setting should be reviewed for sensitive
            environments.
          </li>
          <li>
            <strong>Version check:</strong> off by default. When on, it sends versions, operating system and a random
            installation identifier.
          </li>
          <li>
            <strong>Deep scans and alerts:</strong> only when an operator configures a scan bridge or a webhook. These
            can contain full targets or file paths, so the destination should be one you control.
          </li>
        </ul>
        <p>
          Local audit logs can contain security evidence. Keep them confidential and review them before sharing in a
          support ticket.
        </p>
      </DocSection>

      <DocSection id="cookies" title="Cookies and local storage">
        <p>The site uses only what it needs to work:</p>
        <ul>
          <li>Sign-in session and security cookies set by Clerk while you are signed in.</li>
          <li>
            A <code>theme</code> value in local storage remembering light or dark mode, and a record of your privacy
            choice.
          </li>
        </ul>
        <p>
          Optional diagnostics are off until you choose to allow them, and you can change the choice at any time with
          Privacy settings in the footer. There is no advertising or analytics tracking, so there is nothing else to
          consent to.
        </p>
      </DocSection>

      <DocSection id="sharing" title="Who receives data">
        <p>
          We use the service providers listed on the <Link href="/security#subprocessors">security page</Link>{" "}
          (identity, database, billing, error diagnostics and hosting). We share data with others only where the law
          requires it or where you ask us to, for example a webhook destination you configure.
        </p>
      </DocSection>

      <DocSection id="retention" title="Retention">
        <p>
          Final retention periods are one of the items awaiting legal and privacy review. The periods below are the ones
          the service stamps on records today; they are not a contractual commitment.
        </p>
        <ul>
          <li>Device codes (15 minutes), install codes (15 minutes) and enrollment tokens (30 minutes) are short-lived.</li>
          <li>Only a digest of a device code or enrollment token is stored, never the credential itself.</li>
          <li>
            Event records are stamped to expire after 365 days for blocked or critical events, 180 days for warnings and
            requests held for approval, and 90 days for the rest. Each event keeps an allow-listed set of fields, with
            credential-looking strings redacted.
          </li>
          <li>Control-plane audit entries are stamped to expire after 90 days.</li>
          <li>
            Expired records are removed by database time-to-live policies defined in the repository. They take effect
            once the operator deploys them to the database, and removal can lag expiry by up to a day or so.
          </li>
          <li>Other dashboard records are kept while the account is active. A deletion schedule is to be defined.</li>
        </ul>
      </DocSection>

      <DocSection id="rights" title="Your choices and rights">
        <p>
          You can ask us to access, correct, export or delete your personal data, or to object to or restrict its use,
          depending on where you live. Requests are handled by a person and there is no automated self-service flow
          yet. Send a request through <ContactLink channel="privacy">the privacy contact</ContactLink>. A response
          deadline has not been approved.
        </p>
      </DocSection>

      <DocSection id="transfers" title="Where data is processed">
        <p>
          The regions used by our providers have not been confirmed, so no residency or transfer commitment is made yet.
          EU, US and Asia-Pacific placement is an intended option that is not yet available.
        </p>
      </DocSection>

      <DocSection id="security-measures" title="Security">
        <p>
          See the <Link href="/security">security page</Link> for how the product and this site are protected and for
          what has not yet been independently verified. No system is perfectly secure.
        </p>
      </DocSection>

      <DocSection id="changes" title="Changes and contact">
        <p>
          This draft will be replaced by an approved version. The effective date is shown at the top once it is set.
          Questions: <ContactLink channel="privacy">privacy contact</ContactLink>.
        </p>
      </DocSection>
    </>
  );
}
