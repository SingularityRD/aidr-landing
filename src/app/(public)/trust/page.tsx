"use client";

import Background from "@/components/Background";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const trustItems = [
  {
    title: "Closed Source, Audited, Verified",
    desc: "AIDR is proprietary software. The binary is cosign-signed with GitHub OIDC and SLSA Level 3 provenance. Annual third-party pen test by NCC Group.",
    badge: "Audited 2026 Q1",
  },
  {
    title: "SBOM Every Release",
    desc: "Every AIDR release publishes a CycloneDX Software Bill of Materials. Verify dependencies, check for CVEs in your supply chain.",
    badge: "CycloneDX",
  },
  {
    title: "SLSA Level 3 Build",
    desc: "All binaries built via reproducible SLSA Level 3 pipeline. The same source produces the same binary, every time.",
    badge: "SLSA L3",
  },
  {
    title: "SOC2 Type II In Progress",
    desc: "We are working toward SOC2 Type II. Type I expected 2026 Q3. Audit by an accredited third-party firm.",
    badge: "SOC2 Type I → II",
  },
  {
    title: "GDPR & DPA",
    desc: "GDPR-compliant by design. Standard Data Processing Agreement available. EU data residency available on Enterprise.",
    badge: "GDPR Ready",
  },
  {
    title: "Responsible Disclosure",
    desc: "Vulnerabilities can be reported to security@singularityrd.com. 90-day disclosure policy. Bug bounty program launching 2026 Q2.",
    badge: "90-day",
  },
];

export default function TrustPage() {
  return (
    <div className="relative w-full min-h-screen">
      <Background />
      <Header />

      <main
        style={{
          position: "relative",
          zIndex: 1,
          padding: "60px 24px",
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        <section style={{ textAlign: "center", marginBottom: 48 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--text-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 12,
            }}
          >
            Trust Center
          </div>
          <h1
            style={{
              fontSize: "clamp(28px, 3.5vw, 44px)",
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "-0.025em",
              marginBottom: 12,
            }}
          >
            Security you can verify.
          </h1>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: 15,
              maxWidth: 600,
              margin: "0 auto",
              lineHeight: "24px",
            }}
          >
            AIDR is closed-source, but the binary is verifiable. SBOM, signed artifacts, public
            pen test, and a clear disclosure policy. We earn trust with transparency, not
            source access.
          </p>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            marginBottom: 48,
          }}
        >
          {trustItems.map((item) => (
            <div
              key={item.title}
              style={{
                border: "1px solid var(--panel-border)",
                borderRadius: 14,
                background: "var(--panel-bg)",
                padding: 24,
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 12,
                }}
              >
                <h3
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    margin: 0,
                    flex: 1,
                  }}
                >
                  {item.title}
                </h3>
                <span
                  style={{
                    fontSize: 10,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "rgba(56,98,232,0.12)",
                    color: "#3862e8",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                >
                  {item.badge}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: "22px", margin: 0 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </section>

        <section
          style={{
            border: "1px solid var(--panel-border)",
            borderRadius: 16,
            background: "var(--panel-bg)",
            padding: 32,
            marginBottom: 32,
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 16,
              letterSpacing: "-0.02em",
            }}
          >
            Verify the binary yourself
          </h2>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 12,
              color: "var(--text-secondary)",
              background: "var(--bg-secondary)",
              border: "1px solid var(--panel-border)",
              borderRadius: 10,
              padding: 16,
              lineHeight: "22px",
              overflowX: "auto",
            }}
          >
            <div style={{ color: "var(--text-faint)" }}># Download SBOM</div>
            <div>curl -O https://aidr.dev/sbom/aidr-1.0.0.cdx.json</div>
            <br />
            <div style={{ color: "var(--text-faint)" }}># Verify binary signature (cosign)</div>
            <div>cosign verify --key https://aidr.dev/cosign.pub ghcr.io/singularityrd/aidr-scan:1.0.0</div>
            <br />
            <div style={{ color: "var(--text-faint)" }}># Verify SLSA provenance</div>
            <div>slsa-verifier verify-image ghcr.io/singularityrd/aidr-scan:1.0.0</div>
          </div>
        </section>

        <section
          style={{
            border: "1px solid var(--panel-border)",
            borderRadius: 16,
            background: "var(--panel-bg)",
            padding: 32,
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 12,
              letterSpacing: "-0.02em",
            }}
          >
            Third-party attribution
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: "22px", margin: 0 }}>
            AIDR Scan is derived from <strong>AI-Infra-Guard</strong> by Tencent Zhuque Lab, used
            under the Apache License 2.0. The original work is Copyright 2024–2026 Tencent Zhuque Lab.
            AIDR re-implements the detection logic as a native in-process TypeScript engine; the
            CVE, fingerprint, and MCP data files are vendored under <code>data/scan/</code> with the
            Apache 2.0 NOTICE preserved. See <code>NOTICE</code> in the source repository for full
            attribution.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
