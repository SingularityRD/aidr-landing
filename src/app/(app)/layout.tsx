import type { Metadata } from "next";
import Link from "next/link";
import Header from "../../components/Header";
import Background from "../../components/Background";
import AuthGate from "../../components/AuthGate";
import SignOutButton from "../../components/SignOutButton";

export const metadata: Metadata = {
  title: "Dashboard | Singularity AIDR",
  description: "Manage your AIDR account, billing, and API keys.",
};

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative w-full min-h-screen">
      <Background />
      <Header />

      <main
        style={{
          position: "relative",
          zIndex: 1,
          padding: "90px 20px 80px",
          minHeight: "100vh",
        }}
      >
        {/* Navigation for authenticated app pages */}
        <nav
          style={{
            maxWidth: 1100,
            margin: "0 auto 24px",
            padding: "16px 20px",
            borderRadius: 12,
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 24,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Link
              href="/onboarding"
              style={{
                color: "var(--text-primary)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
                padding: "8px 12px",
                borderRadius: 6,
                transition: "background 0.2s",
              }}
            >
              Connect
            </Link>
            <Link
              href="/dashboard"
              style={{
                color: "var(--text-primary)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
                padding: "8px 12px",
                borderRadius: 6,
                transition: "background 0.2s",
              }}
            >
              Dashboard
            </Link>
            <Link
              href="/billing"
              style={{
                color: "var(--text-primary)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
                padding: "8px 12px",
                borderRadius: 6,
                transition: "background 0.2s",
              }}
            >
              Billing
            </Link>
            <Link
              href="/api-keys"
              style={{
                color: "var(--text-primary)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
                padding: "8px 12px",
                borderRadius: 6,
                transition: "background 0.2s",
              }}
            >
              API Keys
            </Link>
            <Link
              href="/agents"
              style={{
                color: "var(--text-primary)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
                padding: "8px 12px",
                borderRadius: 6,
                transition: "background 0.2s",
              }}
            >
              Agents
            </Link>
            <Link
              href="/events"
              style={{
                color: "var(--text-primary)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
                padding: "8px 12px",
                borderRadius: 6,
                transition: "background 0.2s",
              }}
            >
              Events
            </Link>
            <Link
              href="/policy-rollout"
              style={{
                color: "var(--text-primary)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
                padding: "8px 12px",
                borderRadius: 6,
                transition: "background 0.2s",
              }}
            >
              Policy Rollout
            </Link>
            <Link
              href="/policy-approvals"
              style={{
                color: "var(--text-primary)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
                padding: "8px 12px",
                borderRadius: 6,
                transition: "background 0.2s",
              }}
            >
              Approvals
            </Link>
            <Link
              href="/delivery-failures"
              style={{
                color: "var(--text-primary)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
                padding: "8px 12px",
                borderRadius: 6,
                transition: "background 0.2s",
              }}
            >
              Delivery
            </Link>
            <Link
              href="/incidents"
              style={{
                color: "var(--text-primary)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
                padding: "8px 12px",
                borderRadius: 6,
                transition: "background 0.2s",
              }}
            >
              Incidents
            </Link>
            <Link
              href="/settings"
              style={{
                color: "var(--text-primary)",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
                padding: "8px 12px",
                borderRadius: 6,
                transition: "background 0.2s",
              }}
            >
              Settings
            </Link>
            <div style={{ marginLeft: "auto" }}>
              <SignOutButton />
            </div>
          </div>
        </nav>

        <AuthGate>
          {children}
        </AuthGate>
      </main>
    </div>
  );
}
