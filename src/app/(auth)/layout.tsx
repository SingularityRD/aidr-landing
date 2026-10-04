import type { Metadata } from "next";
import Background from "../../components/Background";

export const metadata: Metadata = {
  title: "Sign in or sign up",
  description: "Sign in or sign up to Singularity AIDR to manage your AI agent protection.",
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        position: "relative",
      }}
    >
      <Background />
      <main id="main" tabIndex={-1} style={{ width: "100%", maxWidth: 460, position: "relative", zIndex: 1 }}>
        {children}
      </main>
    </div>
  );
}
