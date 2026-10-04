import Link from "next/link";
import PrivacySettingsButton from "./site/PrivacySettingsButton";

const footerLinks = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Install", href: "/install" },
      { label: "Evaluation and pricing", href: "/pricing" },
      { label: "How AIDR fits", href: "/compare" },
    ],
  },
  {
    title: "Enterprise",
    links: [
      { label: "Enterprise options", href: "/enterprise" },
      { label: "Pilot application", href: "/pilot" },
      { label: "Trust center", href: "/trust" },
      { label: "Contact sales", href: "/contact?topic=sales" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Support", href: "/support" },
      { label: "Service status", href: "/status" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal and security",
    links: [
      { label: "Security", href: "/security" },
      { label: "Privacy (draft)", href: "/privacy" },
      { label: "Terms (draft)", href: "/terms" },
      { label: "DPA summary (draft)", href: "/dpa" },
    ],
  },
];

export default function Footer() {
  return (
    <footer
      className="site-footer"
      style={{
        position: "relative",
        zIndex: 1,
        borderTop: "1px solid var(--footer-border)",
        background: "var(--nav-bg)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "48px 24px 32px",
      }}
    >
      <div className="footer-grid">
        <div>
          <Link
            href="/"
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              textDecoration: "none",
              letterSpacing: "-0.02em",
            }}
          >
            AIDR
          </Link>
          <p
            style={{
              marginTop: 12,
              fontSize: 13,
              lineHeight: "20px",
              color: "var(--text-faint)",
              maxWidth: 280,
            }}
          >
            Singularity AIDR: AI Agent Detection &amp; Response for AI coding agents. Currently offered as a controlled
            evaluation.
          </p>
        </div>

        {footerLinks.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-faint)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 14,
              }}
            >
              {group.title}
            </h2>
            <ul style={{ display: "flex", flexDirection: "column", gap: 10, listStyle: "none" }}>
              {group.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
              {group.title === "Legal and security" ? (
                <li>
                  <PrivacySettingsButton />
                </li>
              ) : null}
            </ul>
          </nav>
        ))}
      </div>

      <div
        style={{
          maxWidth: 1320,
          margin: "32px auto 0",
          paddingTop: 20,
          borderTop: "1px solid var(--footer-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
          &copy; {new Date().getFullYear()} Singularity Research &amp; Development. All rights reserved.
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
          Legal pages are drafts pending review. No certification is claimed; see the{" "}
          <Link href="/trust" style={{ color: "var(--text-secondary)" }}>
            trust center
          </Link>
          .
        </div>
      </div>
    </footer>
  );
}
