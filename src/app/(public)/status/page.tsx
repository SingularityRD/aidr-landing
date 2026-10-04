import { Callout, DataTable, DocHeader, DocSection, Pill } from "@/components/site/Doc";
import { getReadiness, type CheckResult } from "@/lib/site/health";
import { pageMetadata } from "@/lib/site/metadata";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Service status",
  description: "Live readiness checks for the Singularity AIDR web application, with links to the JSON health endpoints.",
  path: "/status",
});

const LABELS: Record<string, string> = {
  database: "Database (Firestore round trip)",
  auth_config: "Sign-in configuration",
  auth_provider: "Sign-in provider reachable (Clerk)",
  agent_token_secret: "Agent token signing secret",
  billing_config: "Billing provider configured (Polar)",
  contact_destination: "Contact form destination configured",
};

const STATUS_TEXT: Record<CheckResult["status"], string> = {
  ok: "Operational",
  fail: "Failing",
  not_configured: "Not configured",
  skipped: "Skipped",
};

function tone(result: CheckResult): "ok" | "warn" | "bad" {
  if (result.status === "ok") return "ok";
  if (result.status === "fail") return "bad";
  return result.required ? "bad" : "warn";
}

export default async function StatusPage() {
  const readiness = await getReadiness();
  const rows = Object.entries(readiness.checks).map(([key, result]) => ({ key, result }));

  return (
    <>
      <DocHeader
        eyebrow="Status"
        title="Service status"
        lead="A live check of the dependencies this web application needs, run when you load the page."
      />

      <div className={`callout ${readiness.status === "ready" ? "callout-info" : "callout-warn"}`} role="status">
        <strong>{readiness.status === "ready" ? "All required checks passed." : "At least one required check is not passing."}</strong>{" "}
        Checked at {readiness.time}. Release: {readiness.release}.
      </div>

      <DocSection id="checks" title="Current checks">
        <DataTable
          caption="Readiness checks for the web application"
          rows={rows}
          rowKey={(row) => row.key}
          columns={[
            { header: "Check", render: (row) => LABELS[row.key] ?? row.key, rowHeader: true },
            {
              header: "Result",
              render: (row) => <Pill tone={tone(row.result)}>{STATUS_TEXT[row.result.status]}</Pill>,
            },
            { header: "Required", render: (row) => (row.result.required ? "Yes" : "No") },
            { header: "Latency", render: (row) => (row.result.latencyMs !== undefined ? `${row.result.latencyMs} ms` : "-") },
            { header: "Reason code", render: (row) => row.result.reason ?? "-" },
          ]}
        />
      </DocSection>

      <DocSection id="endpoints" title="Machine-readable endpoints">
        <ul>
          <li>
            <code>GET /api/health</code> is a liveness check. It returns JSON with HTTP 200 whenever the process is
            serving requests.
          </li>
          <li>
            <code>GET /api/ready</code> runs the checks above and returns JSON with HTTP 200 when ready or 503 when a
            required dependency fails. Neither endpoint is cached.
          </li>
        </ul>
        <p>
          Open <a href="/api/health">/api/health</a> and <a href="/api/ready">/api/ready</a>.
        </p>
      </DocSection>

      <DocSection id="scope" title="What this page does not show">
        <Callout tone="info">
          This is a point-in-time check of this web application only. It does not show uptime history, past incidents, the
          health of a customer-hosted control plane, or the state of an agent on a developer machine. There is no
          availability commitment, and no incident history has been published yet.
        </Callout>
      </DocSection>
    </>
  );
}
