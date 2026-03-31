"use client";

import DarkModeToggle from "./DarkModeToggle";

export default function Header() {
  return (
    <nav
      className="nav-bar flex justify-between items-center"
      style={{
        padding: "26px 100px 20px",
        zIndex: 10,
        position: "sticky",
        top: 0,
        background: "var(--nav-bg)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--footer-border)",
      }}
    >
      <span
        style={{
          fontSize: 22,
          fontWeight: 500,
          lineHeight: "28px",
          color: "var(--text-primary)",
        }}
      >
        Singularity AIDR
      </span>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <a href="#pricing" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>
          Pricing
        </a>
        <a href="#pilot" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>
          Pilot
        </a>
        <a href="#install" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>
          Install Prompt
        </a>
        <a
          href={process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://127.0.0.1:4173/login"}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid var(--panel-border)",
            color: "var(--text-primary)",
            textDecoration: "none",
            background: "var(--toggle-bg)",
          }}
        >
          Sign in
        </a>
        <DarkModeToggle />
      </div>
    </nav>
  );
}
