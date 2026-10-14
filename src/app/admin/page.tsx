"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CustomerForm, emptyCustomer } from "./_components/CustomerForm";
import { Button, Notice, adminApi, errorText, eyebrow, h1, muted, page, panel, table, td, th, trDate } from "./_components/ui";

interface CustomerRow {
  customer_id: string;
  display_name: string;
  seats: number;
  deployment: string;
  ends_on: string;
  latest_license_id: string | null;
  latest_issued_at: string | null;
}

interface SigningStatus {
  signing_configured: boolean;
  entry?: Record<string, unknown>;
  fingerprintSha256?: string;
  build_configured: boolean;
}

export default function AdminHome() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  const [signing, setSigning] = useState<SigningStatus | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    adminApi<{ customers: CustomerRow[] }>("customers")
      .then((data) => setCustomers(data.customers))
      .catch((caught) => setProblem(errorText(caught)));
    adminApi<SigningStatus>("signing-key")
      .then(setSigning)
      .catch((caught) => setProblem(errorText(caught)));
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={page}>
      <section style={panel}>
        <div style={eyebrow}>Yönetim</div>
        <h1 style={h1}>Müşteri şirketler</h1>
        <p style={muted}>
          Her şirket için cihaz limitini ve lisans süresini burada tanımlayın. &quot;Lisans üret&quot; imzalı lisansı ve müşteri paketini
          oluşturur; şirkete özel Windows/Linux kurulum dosyaları bu paketle derlenir.
        </p>
        {problem ? <Notice tone="error">{problem}</Notice> : null}
        {signing && !signing.signing_configured ? (
          <Notice tone="error">
            Lisans imzalama anahtarı tanımlı değil (AIDR_LICENSE_SIGNING_KEY_ID, AIDR_LICENSE_SIGNING_PRIVATE_KEY_PKCS8_B64). Şirket kaydı
            yapılabilir, lisans üretilemez.
          </Notice>
        ) : null}
        {signing?.signing_configured ? (
          <div style={{ marginTop: 12 }}>
            <Button type="button" onClick={() => setShowKey((v) => !v)}>
              {showKey ? "Açık anahtarı gizle" : "İmza anahtarının açık kısmını göster"}
            </Button>
            {showKey ? (
              <div style={{ marginTop: 12 }}>
                <p style={muted}>
                  Uç noktaların bu paneldeki lisansları kabul etmesi için bu girdi AIDR deposundaki{" "}
                  <code>deploy/onprem/license-public-keys.json</code> dosyasının <code>keys</code> listesine eklenip yeni bir sürüm
                  çıkarılmalıdır. Parmak izi (SHA-256): <code className="mono">{signing.fingerprintSha256}</code>
                </p>
                <pre className="mono" style={{ fontSize: 12, overflowX: "auto", padding: 12, borderRadius: 8, border: "1px solid var(--panel-border)" }}>
                  {JSON.stringify(signing.entry, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section style={panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, color: "var(--text-primary)", margin: 0 }}>Şirketler</h2>
          <Button type="button" style={{ marginLeft: "auto" }} onClick={() => setCreating((v) => !v)}>
            {creating ? "Vazgeç" : "Yeni şirket"}
          </Button>
        </div>
        {creating ? (
          <div style={{ marginBottom: 20 }}>
            <CustomerForm
              initial={emptyCustomer()}
              editing={false}
              submitLabel="Şirketi kaydet"
              onSubmit={async (values) => {
                const { customer } = await adminApi<{ customer: CustomerRow }>("customers", { method: "POST", body: values });
                router.push(`/admin/customers/${customer.customer_id}`);
              }}
            />
          </div>
        ) : null}
        {customers === null ? (
          <p style={muted}>Yükleniyor…</p>
        ) : customers.length === 0 ? (
          <p style={muted}>Henüz şirket yok.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Şirket</th>
                  <th style={th}>Kimlik</th>
                  <th style={th}>Cihaz limiti</th>
                  <th style={th}>Kurulum</th>
                  <th style={th}>Bitiş</th>
                  <th style={th}>Son lisans</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.customer_id}>
                    <td style={td}>
                      <Link href={`/admin/customers/${c.customer_id}`} style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                        {c.display_name}
                      </Link>
                    </td>
                    <td style={td} className="mono">
                      {c.customer_id}
                    </td>
                    <td style={td}>{c.seats}</td>
                    <td style={td}>{c.deployment === "airgap" ? "Air-gap" : "On-prem"}</td>
                    <td style={{ ...td, color: c.ends_on < today ? "#e5484d" : td.color }}>{trDate(c.ends_on)}</td>
                    <td style={td}>{c.latest_license_id ? `${trDate(c.latest_issued_at)} · ${c.latest_license_id}` : "Henüz üretilmedi"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
