import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../lib/supabase/server";
import Header from "../../components/Header";
import Background from "../../components/Background";

export const metadata: Metadata = {
  title: "Dashboard | Singularity AIDR",
  description: "Manage your AIDR account, billing, and API keys.",
};

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Check authentication server-side
  const supabase = await createServerSupabaseClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    // Redirect to login if not authenticated
    redirect("/login");
  }

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
            <a
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
            </a>
            <a
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
            </a>
            <a
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
            </a>
            <div style={{ marginLeft: "auto" }}>
              <form
                action="/auth/signout"
                method="post"
              >
                <button
                  type="submit"
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "1px solid var(--panel-border)",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    fontSize: 14,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </nav>

        {children}
      </main>
    </div>
  );
}
