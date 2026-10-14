import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../components/Header";
import Background from "../../components/Background";
import { checkVendorAdmin } from "@/lib/vendor-admin/access";

export const metadata: Metadata = {
  title: "Yönetim | Singularity AIDR",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const panel: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto 24px",
  padding: "16px 20px",
  borderRadius: 12,
  background: "var(--panel-bg)",
  border: "1px solid var(--panel-border)",
};

/** Vendor admin panel: Singularity staff only (src/lib/vendor-admin/access.ts). */
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const access = await checkVendorAdmin();
  if (!access.ok && access.status === 404) notFound();

  return (
    <div className="relative w-full min-h-screen">
      <Background />
      <Header />
      <main id="main" tabIndex={-1} style={{ position: "relative", zIndex: 1, padding: "90px 20px 80px", minHeight: "100vh" }}>
        <nav style={{ ...panel, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/admin" style={{ color: "var(--text-primary)", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
            Müşteri şirketler
          </Link>
          <span style={{ marginLeft: "auto", color: "var(--text-faint)", fontSize: 12 }}>
            {access.ok ? `Yönetici: ${access.actor.email}` : "Singularity yönetim paneli"}
          </span>
        </nav>
        {access.ok ? (
          children
        ) : (
          <div style={{ ...panel, maxWidth: 640 }}>
            <h1 style={{ fontSize: 22, color: "var(--text-primary)", margin: "0 0 8px" }}>
              {access.reason === "second_factor_required" ? "İki adımlı doğrulama gerekli" : "Yönetim paneli şu an kullanılamıyor"}
            </h1>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              {access.reason === "second_factor_required"
                ? "Bu panel lisans imzalar. Hesabınızda iki adımlı doğrulamayı açın, sonra çıkış yapıp iki adımlı doğrulamayla yeniden giriş yapın."
                : "Kimlik doğrulama ya da veritabanı yapılandırılmamış (ya da site demo modunda). Yönetim paneli bu durumda kapalı kalır."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
