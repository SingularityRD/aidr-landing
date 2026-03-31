"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSession, signOut } from "@/lib/auth/session";

export default function DashboardPage() {
  const [user, setUser] = useState<{ email: string; id: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const session = await getSession();
      if (session?.user) {
        setUser({
          email: session.user.email || "",
          id: session.user.id,
        });
      }
      setLoading(false);
    }
    loadUser();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: 40 }}>
        <h1>Not authenticated</h1>
        <p>Please sign in to view your dashboard.</p>
        <Link href="/login" style={{ color: "#3b82f6" }}>
          Sign In →
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, maxWidth: 800, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 40,
          paddingBottom: 20,
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Dashboard</h1>
          <p style={{ margin: "8px 0 0", color: "#6b7280" }}>
            Welcome, {user.email}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          style={{
            padding: "10px 20px",
            background: "#ef4444",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Sign Out
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: 20,
        }}
      >
        {/* Onboarding Card */}
        <Link
          href="/onboarding"
          style={{
            padding: 24,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "#f9fafb",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>🚀 Onboarding</h3>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            Set up your AI agent protection
          </p>
        </Link>

        {/* API Keys Card */}
        <Link
          href="/api-keys"
          style={{
            padding: 24,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "#f9fafb",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>🔑 API Keys</h3>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            Manage your API keys
          </p>
        </Link>

        {/* Billing Card */}
        <Link
          href="/billing"
          style={{
            padding: 24,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "#f9fafb",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>💳 Billing</h3>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            View and manage billing
          </p>
        </Link>

        {/* Agents Card */}
        <Link
          href="/agents"
          style={{
            padding: 24,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "#f9fafb",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>🤖 Agents</h3>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            View connected agents
          </p>
        </Link>

        {/* Incidents Card */}
        <Link
          href="/incidents"
          style={{
            padding: 24,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "#f9fafb",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>🚨 Incidents</h3>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            View security incidents
          </p>
        </Link>

        {/* Settings Card */}
        <Link
          href="/settings"
          style={{
            padding: 24,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "#f9fafb",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>⚙️ Settings</h3>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            Account settings
          </p>
        </Link>
      </div>
    </div>
  );
}
