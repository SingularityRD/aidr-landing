import Link from "next/link";

export default function DemoPage() {
  return (
    <div className="stack">
      <div className="card">
        <h1>Book a demo</h1>
        <p className="muted">
          We&apos;ll walk through real blocked tool calls, incident timelines, plugin/package findings,
          and the enrollment flow for your runtime.
        </p>
        <div className="notice">
          For now: send a message with your use case, runtime, and threat model. We&apos;ll reply with a
          time slot.
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <Link className="button" href="/waitlist">
            Join Waitlist
          </Link>
          <Link className="button button-secondary" href="/pilot">
            Request Pilot
          </Link>
        </div>
      </div>
    </div>
  );
}
