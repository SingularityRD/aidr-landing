import Link from "next/link";

const footerLinks = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "How It Works", href: "/#how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Platforms",
    links: [
      { label: "Claude Code", href: "/#platforms" },
      { label: "Cursor", href: "/#platforms" },
      { label: "VS Code", href: "/#platforms" },
      { label: "OpenClaw", href: "/#platforms" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "https://github.com/singularityrd/aidr" },
      { label: "GitHub", href: "https://github.com/singularityrd/aidr" },
      { label: "Status", href: "/" },
      { label: "Compare", href: "/compare" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Privacy", href: "/" },
      { label: "Terms", href: "/" },
      { label: "Security", href: "/#security" },
      { label: "Contact", href: "mailto:hello@singularityrd.com" },
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
        padding: "48px 60px 32px",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "2fr repeat(4, 1fr)",
          gap: 32,
        }}
      >
        {/* Brand */}
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
              maxWidth: 240,
            }}
          >
            AI Agent Detection & Response. 
            Secure your AI coding agents with edge-first protection.
          </p>
        </div>

        {/* Link columns */}
        {footerLinks.map((group) => (
          <div key={group.title}>
            <div
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
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {group.links.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    textDecoration: "none",
                    transition: "color 0.2s",
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
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
          &copy; {new Date().getFullYear()} Singularity Research & Development. All rights reserved.
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <Link
            href="https://github.com/singularityrd/aidr"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: "var(--text-faint)", textDecoration: "none" }}
          >
            GitHub
          </Link>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
            Polar • Stripe
          </span>
        </div>
      </div>
    </footer>
  );
}
