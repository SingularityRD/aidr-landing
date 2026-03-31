import Link from "next/link";

const highlights = [
  "Tool-call inspection: shell, file, network, MCP/plugin actions",
  "Local enforcement with managed visibility",
  "Auth-first model with offline grace after enrollment",
  "Prompt-install onboarding for Claude/Cursor/VS Code/OpenClaw/OpenCode",
];

export default function PricingPage() {
  return (
    <div className="stack">
      <div className="card">
        <h1 style={{ color: "var(--text-primary)", fontSize: 26, marginBottom: 10 }}>
          Pricing
        </h1>
        <div style={{ color: "var(--text-body)", marginBottom: 10 }}>
          <b>1 protected agent free</b> during pilot. Extra agents are planned as paid expansion.
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            color: "var(--text-secondary)",
            lineHeight: "24px",
          }}
        >
          {highlights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="card" style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 24, marginBottom: 12 }}>Ready to protect your AI agents?</h2>
        <p className="muted" style={{ marginBottom: 16 }}>
          Get started with the free pilot and secure your first agent in minutes.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="button" href="/pilot">
            Get Pilot Access
          </Link>
          <Link className="button button-secondary" href="/waitlist">
            Join Waitlist
          </Link>
        </div>
      </div>
    </div>
  );
}
