import { spawnSync } from "node:child_process";

process.noDeprecation = true;

const session = process.env.SMOKE_SESSION || "aidr-onboarding-smoke";
const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:4568").replace(/\/+$/, "");

function run(args, options = {}) {
  const result = spawnSync(
    "npx",
    ["--yes", "--package", "@playwright/cli", "playwright-cli", `-s=${session}`, ...args],
    {
      encoding: "utf8",
      stdio: options.capture ? "pipe" : "inherit",
      env: { ...process.env, NPM_CONFIG_LOGLEVEL: "error" },
      shell: process.platform === "win32",
    },
  );

  if (!options.allowFail && (result.status !== 0 || result.error)) {
    throw new Error(String(result.error ?? result.stderr ?? result.stdout ?? `playwright-cli ${args.join(" ")} failed`));
  }

  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function assertIncludes(value, needle, label) {
  if (!value.includes(needle)) {
    throw new Error(`${label} did not include: ${needle}`);
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function snapshotUntilIncludes(needles, label) {
  let snapshot = "";
  for (let attempt = 0; attempt < 30; attempt += 1) {
    snapshot = run(["snapshot"], { capture: true });
    if (needles.every((needle) => snapshot.includes(needle))) return snapshot;
    sleep(500);
  }
  for (const needle of needles) assertIncludes(snapshot, needle, label);
  return snapshot;
}

function refFor(snapshot, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = snapshot.match(new RegExp(`button "${escaped}"[^\\n]*\\[ref=(e\\d+)\\]`));
  if (!match) throw new Error(`Could not find button ref for: ${label}`);
  return match[1];
}

run(["close"], { allowFail: true, capture: true });

run(["open", `${baseUrl}/onboarding`], { capture: true });
const opened = snapshotUntilIncludes(["Welcome, Demo", "Generate Install Prompt"], "onboarding snapshot");

run(["click", refFor(opened, "Generate Install Prompt")], { capture: true });
const prompted = snapshotUntilIncludes(["AIDR Security Enrollment", "Copy Prompt"], "prompted onboarding snapshot");

run(["click", refFor(prompted, "📋 Copy Prompt")], { capture: true });
const copied = run(["snapshot"], { capture: true });
assertIncludes(copied, "4 of 4 complete", "copied onboarding snapshot");
assertIncludes(copied, "100%", "copied onboarding snapshot");

run(["goto", `${baseUrl}/compare`], { capture: true });
const compared = run(["snapshot"], { capture: true });
assertIncludes(compared, "AIDR is the only tool that protects", "compare page");
assertIncludes(compared, "Competitive Position", "compare page");
assertIncludes(compared, "Feature Comparison Matrix", "compare page");
assertIncludes(compared, "Why AIDR Wins", "compare page");

run(["goto", `${baseUrl}/settings`], { capture: true });
const settings = run(["snapshot"], { capture: true });
assertIncludes(settings, "Policy rollout", "settings page");
assertIncludes(settings, "Policy drift alerts", "settings page");
assertIncludes(settings, "pol_demo_locked_down", "settings page");
assertIncludes(settings, "policy stale", "settings page");
assertIncludes(settings, "Mark reviewed", "settings page");
assertIncludes(settings, "Reconnect", "settings page");
assertIncludes(settings, "audit-backed", "settings page");
assertIncludes(settings, "Security export", "settings page");
assertIncludes(settings, "Runtime deny events", "settings page");
assertIncludes(settings, "Policy rollout reminders", "settings page");
assertIncludes(settings, "Delivery failure escalations", "settings page");
assertIncludes(settings, "Incident case escalations", "settings page");
assertIncludes(settings, "Additional destinations", "settings page");
assertIncludes(settings, "Add destination", "settings page");
assertIncludes(settings, "Send test export", "settings page");
assertIncludes(settings, "Policy-as-code contract", "settings page");
assertIncludes(settings, "aidr.policy.v1", "settings page");
assertIncludes(settings, "Validate and apply", "settings page");

run(["click", refFor(settings, "Send test export")], { capture: true });
const settingsExportTest = run(["snapshot"], { capture: true });
assertIncludes(settingsExportTest, "Demo security export test prepared.", "settings security export test");

run(["click", refFor(settingsExportTest, "Validate and apply")], { capture: true });
const settingsPolicyApplied = run(["snapshot"], { capture: true });
assertIncludes(settingsPolicyApplied, "Policy-as-code import applied.", "settings policy-as-code import");

run(["click", refFor(settingsPolicyApplied, "Publish with approval")], { capture: true });
const settingsPolicyPublished = run(["snapshot"], { capture: true });
assertIncludes(settingsPolicyPublished, "Policy published with approval evidence.", "settings policy publish");

run(["click", refFor(settingsPolicyPublished, "Request two-person approval")], { capture: true });
const settingsPolicyApproval = run(["snapshot"], { capture: true });
assertIncludes(settingsPolicyApproval, "Two-person policy approval requested.", "settings policy approval request");

run(["goto", `${baseUrl}/policy-approvals`], { capture: true });
const policyApprovals = run(["snapshot"], { capture: true });
assertIncludes(policyApprovals, "Policy publish approvals", "policy approvals page");
assertIncludes(policyApprovals, "pending approval", "policy approvals page");
assertIncludes(policyApprovals, "pol_demo_pending", "policy approvals page");
assertIncludes(policyApprovals, "1/2", "policy approvals page");
assertIncludes(policyApprovals, "Needs another reviewer", "policy approvals page");
assertIncludes(policyApprovals, "command_default: ask -> deny", "policy approvals page");

run(["goto", `${baseUrl}/events`], { capture: true });
const events = run(["snapshot"], { capture: true });
assertIncludes(events, "Remediation", "events page");
assertIncludes(events, "Policy drift mark reviewed", "events page");
assertIncludes(events, "Admin marked this policy drift item as reviewed.", "events page");
assertIncludes(events, "Current agent policy cache", "events page");
assertIncludes(events, "Triggering security events", "events page");

run(["goto", `${baseUrl}/events?class=remediation`], { capture: true });
const filteredEvents = run(["snapshot"], { capture: true });
assertIncludes(filteredEvents, "Policy drift mark reviewed", "filtered events page");
assertIncludes(filteredEvents, "aidr_ag_demo_cursor", "filtered events page");

run(["goto", `${baseUrl}/events?agent=aidr_ag_demo_cursor`], { capture: true });
const agentEvents = run(["snapshot"], { capture: true });
assertIncludes(agentEvents, "Policy drift mark reviewed", "agent-filtered events page");
assertIncludes(agentEvents, "aidr_ag_demo_cursor", "agent-filtered events page");

run(["goto", `${baseUrl}/incidents`], { capture: true });
const incidents = run(["snapshot"], { capture: true });
assertIncludes(incidents, "policy_rollout on aidr_ag_demo_cursor", "incidents page");
assertIncludes(incidents, "An admin remediation action was recorded for policy rollout drift.", "incidents page");
assertIncludes(incidents, "Keep acknowledgement evidence", "incidents page");
assertIncludes(incidents, "Remediation evidence", "incidents page");
assertIncludes(incidents, "Case status", "incidents page");
assertIncludes(incidents, "Owner unassigned", "incidents page");
assertIncludes(incidents, "All cases", "incidents page");
assertIncludes(incidents, "Open", "incidents page");
assertIncludes(incidents, "Assignee", "incidents page");
assertIncludes(incidents, "Assign", "incidents page");
assertIncludes(incidents, "Resolve", "incidents page");
assertIncludes(incidents, "Snooze 24h", "incidents page");

run(["click", refFor(incidents, "Assign")], { capture: true });
const assignedIncident = run(["snapshot"], { capture: true });
assertIncludes(assignedIncident, "Demo incident assigned.", "incident assignment");
assertIncludes(assignedIncident, "assigned", "incident assignment");
assertIncludes(assignedIncident, "Owner Demo User", "incident assignment");
assertIncludes(assignedIncident, "Assigned (1)", "incident assignment");

run(["goto", `${baseUrl}/policy-rollout`], { capture: true });
const rollout = run(["snapshot"], { capture: true });
assertIncludes(rollout, "One place to verify what every agent will enforce.", "policy rollout page");
assertIncludes(rollout, "pol_demo_locked_down", "policy rollout page");
assertIncludes(rollout, "Agent cache state", "policy rollout page");
assertIncludes(rollout, "Drift alerts", "policy rollout page");
assertIncludes(rollout, "Acknowledgement history", "policy rollout page");
assertIncludes(rollout, "Related security events", "policy rollout page");
assertIncludes(rollout, "Admin actions", "policy rollout page");
assertIncludes(rollout, "Generate stale-agent CSV", "policy rollout page");
assertIncludes(rollout, "Draft bulk reconnect reminder", "policy rollout page");
assertIncludes(rollout, "Send webhook reminder", "policy rollout page");
assertIncludes(rollout, "Claude Code - laptop", "policy rollout page");
assertIncludes(rollout, "Cursor workspace", "policy rollout page");

run(["click", refFor(rollout, "Generate stale-agent CSV")], { capture: true });
const rolloutWithExport = run(["snapshot"], { capture: true });
assertIncludes(rolloutWithExport, "Stale-agent export", "policy rollout export");
assertIncludes(rolloutWithExport, "agent_id", "policy rollout export");
assertIncludes(rolloutWithExport, "pol_demo_standard", "policy rollout export");

run(["click", refFor(rolloutWithExport, "Draft bulk reconnect reminder")], { capture: true });
const rolloutWithReminder = run(["snapshot"], { capture: true });
assertIncludes(rolloutWithReminder, "Bulk reconnect reminder", "policy rollout reminder");
assertIncludes(rolloutWithReminder, "AIDR policy rollout reminder", "policy rollout reminder");
assertIncludes(rolloutWithReminder, "Current policy: pol_demo_locked_down", "policy rollout reminder");

run(["click", refFor(rolloutWithReminder, "Send webhook reminder")], { capture: true });
const rolloutWithDelivery = run(["snapshot"], { capture: true });
assertIncludes(rolloutWithDelivery, "Demo delivery prepared", "policy rollout delivery");

run(["goto", `${baseUrl}/delivery-failures`], { capture: true });
const deliveryFailures = run(["snapshot"], { capture: true });
assertIncludes(deliveryFailures, "Keep failed exports visible until someone closes the loop.", "delivery failures page");
assertIncludes(deliveryFailures, "retry pending", "delivery failures page");
assertIncludes(deliveryFailures, "dead-letter", "delivery failures page");
assertIncludes(deliveryFailures, "https://hooks.example", "delivery failures page");
assertIncludes(deliveryFailures, "https://siem.example", "delivery failures page");
assertIncludes(deliveryFailures, "Manual replay action", "delivery failures page");
assertIncludes(deliveryFailures, "Assign to me", "delivery failures page");
assertIncludes(deliveryFailures, "SLA", "delivery failures page");

run(["click", refFor(deliveryFailures, "Manual replay action")], { capture: true });
const deliveryReplay = run(["snapshot"], { capture: true });
assertIncludes(deliveryReplay, "Demo replay marked as delivered.", "delivery replay");
assertIncludes(deliveryReplay, "replay delivered", "delivery replay");

run(["click", refFor(deliveryReplay, "Assign to me")], { capture: true });
const assignedCase = run(["snapshot"], { capture: true });
assertIncludes(assignedCase, "Demo case assign recorded.", "delivery case assignment");

run(["click", refFor(assignedCase, "Close case")], { capture: true });
const closedCase = run(["snapshot"], { capture: true });
assertIncludes(closedCase, "Demo case close recorded.", "delivery case close");
assertIncludes(closedCase, "closed", "delivery case close");

run(["close"], { allowFail: true, capture: true });

console.log(`onboarding smoke passed at ${baseUrl}`);
