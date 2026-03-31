import type { Metadata } from "next";
import Background from "../../components/Background";

export const metadata: Metadata = {
  title: "Sign In - Singularity AIDR",
  description: "Sign in to Singularity AIDR to manage your AI agent protection.",
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
      <div style={{ width: "100%", maxWidth: 460, position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}
