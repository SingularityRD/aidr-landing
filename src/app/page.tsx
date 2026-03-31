"use client";

import Background from "../components/Background";
import Header from "../components/Header";
import InstallPromptCard from "../components/InstallPromptCard";
import IsometricDiagram from "../components/IsometricDiagram";

export const dynamic = "force-dynamic";

const highlights = [
  "Tool-call inspection: shell, file, network, MCP/plugin actions",
  "Local enforcement with managed visibility",
  "Auth-first model with offline grace after enrollment",
  "Prompt-install onboarding for Claude/Cursor/VS Code/OpenClaw/OpenCode",
];

const featurePillars = [
  {
    title: "Prompt-first setup",
    desc: "Install by prompt, then finish auth in the browser with zero key copying.",
  },
  {
    title: "Device authorization",
    desc: "Short-lived codes bootstrap enrollment and unlock managed protection safely.",
  },
  {
    title: "Incident correlation",
    desc: "Repeated denials, suspicious retries, and abuse patterns roll into one case.",
  },
  {
    title: "Package and plugin guard",
    desc: "Catch typosquats, lifecycle risk, integrity drift, and command surface exposure.",
  },
  {
    title: "Dashboard sync",
    desc: "Every protected agent reports health, incidents, and entitlement state centrally.",
  },
  {
    title: "Offline grace",
    desc: "Enrolled agents keep working when the network drops, within the signed cache window.",
  },
];

export default function Home() {
  return (
    <div className="relative w-full min-h-screen">
      <style jsx global>{`
        /* Hero section responsive */
        @media (max-width: 1100px) {
          .hero-row {
            grid-template-columns: 1fr !important;
          }
          .hero-diagram-cell {
            justify-content: center !important;
            min-height: 340px !important;
          }
        }
        /* Features grid responsive */
        @media (max-width: 1024px) {
          .features-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 640px) {
          .features-grid {
            grid-template-columns: 1fr !important;
          }
          .page-main {
            padding: 16px 16px 60px !important;
          }
        }
        @media (max-width: 900px) {
          #pilot {
            grid-template-columns: repeat(3, 1fr) !important;
          }
        }
        @media (max-width: 600px) {
          #pilot {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <Background />
      <Header />

      <main
        className="page-main"
        style={{
          position: "relative",
          zIndex: 1,
          padding: "40px 60px 80px",
          maxWidth: 1320,
          margin: "0 auto",
        }}
      >
        {/* ── Hero: text + diagram side by side ── */}
        <section
          className="hero-row"
          style={{
            display: "grid",
            gridTemplateColumns: "1.25fr 1fr",
            gap: 32,
            alignItems: "center",
            marginBottom: 40,
          }}
        >
          {/* Left – copy */}
          <div
            style={{
              border: "1px solid var(--panel-border)",
              background: "var(--panel-bg)",
              borderRadius: 16,
              padding: "32px 28px",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
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
              Edge-first AI Agent Detection &amp; Response
            </div>
            <h1
              style={{
                fontSize: "clamp(28px, 3.4vw, 50px)",
                lineHeight: 1.08,
                color: "var(--text-primary)",
                letterSpacing: "-0.025em",
                marginBottom: 16,
                fontWeight: 600,
              }}
            >
              Launch-ready security layer for AI&nbsp;agents.
            </h1>
            <p
              style={{
                color: "var(--text-secondary)",
                maxWidth: 520,
                lineHeight: "26px",
                fontSize: 15,
              }}
            >
              Singularity AIDR protects runtime actions, surfaces incidents, and gives managed
              visibility without forcing cloud-only enforcement. Install by prompt, authorize in
              browser, and go live in minutes.
            </p>

            <div style={{ display: "flex", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
              <a
                href="#install"
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: "1px solid var(--text-primary)",
                  color: "var(--text-primary)",
                  textDecoration: "none",
                  fontWeight: 500,
                  fontSize: 14,
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                Get started
              </a>
              <a
                href="#pricing"
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: "1px solid var(--panel-border)",
                  color: "var(--text-secondary)",
                  textDecoration: "none",
                  fontSize: 14,
                  transition: "border-color 0.2s",
                }}
              >
                View pricing
              </a>
            </div>
          </div>

          {/* Right – diagram */}
          <div
            className="hero-diagram-cell"
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              minHeight: 420,
              transform: "translateX(15%)",
            }}
          >
            <IsometricDiagram compact />
          </div>
        </section>

        {/* ── Core Features ── */}
        <section
          style={{
            width: "100%",
            marginBottom: 32,
            border: "1px solid var(--panel-border)",
            background: "var(--panel-bg)",
            borderRadius: 16,
            padding: "24px 28px",
            boxShadow: "0 10px 24px var(--shadow-color)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--text-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 18,
            }}
          >
            Core Features
          </div>
          <div
            className="features-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 14,
            }}
          >
            {featurePillars.map((feature) => (
              <article
                key={feature.title}
                style={{
                  border: "1px solid var(--panel-border)",
                  background: "var(--bg-secondary)",
                  borderRadius: 14,
                  padding: 18,
                  minHeight: 140,
                  transition: "border-color 0.25s ease, box-shadow 0.25s ease",
                }}
              >
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: 8,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {feature.title}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: "22px",
                    color: "var(--text-secondary)",
                  }}
                >
                  {feature.desc}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── Pricing ── */}
        <section
          id="pricing"
          style={{
            width: "100%",
            marginBottom: 32,
            border: "1px solid var(--panel-border)",
            background: "var(--panel-bg)",
            borderRadius: 16,
            padding: "24px 28px",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <h2
            style={{
              color: "var(--text-primary)",
              fontSize: 24,
              fontWeight: 600,
              marginBottom: 10,
              letterSpacing: "-0.02em",
            }}
          >
            Pricing
          </h2>
          <div style={{ color: "var(--text-body)", marginBottom: 12, fontSize: 15 }}>
            <b>1 protected agent free</b> during pilot. Extra agents are planned as paid expansion.
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              color: "var(--text-secondary)",
              lineHeight: "26px",
              fontSize: 14,
            }}
          >
            {highlights.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        {/* ── Install Prompt ── */}
        <section style={{ width: "100%", marginBottom: 22 }}>
          <InstallPromptCard />
        </section>
      </main>
    </div>
  );
}
