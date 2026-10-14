"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CustomerForm, type CustomerFormValues } from "../../_components/CustomerForm";
import { Button, Notice, adminApi, errorText, eyebrow, h1, input, muted, page, panel, table, td, th, trDate } from "../../_components/ui";

interface Customer extends Omit<CustomerFormValues, "features"> {
  features: string[];
  updated_at: string;
  updated_by: string;
}

interface Issuance {
  license_id: string;
  packet_id: string;
  issued_at: string;
  issued_by: string;
  seats: number;
  starts_on: string;
  ends_on: string;
  updates_until: string;
  license_sha256: string;
  packet_sha256: string;
  builds: Array<{ requested_at: string; requested_by: string; release_tag: string; build_exe: boolean }>;
}

const RELEASE_TAG = /^v[0-9]+\.[0-9]+\.[0-9]+-rc\.(0|[1-9][0-9]{0,3})$/;

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [issuances, setIssuances] = useState<Issuance[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<React.ReactNode>(null);
  const [editing, setEditing] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [releaseTag, setReleaseTag] = useState("");
  const [buildExe, setBuildExe] = useState(true);
  const [building, setBuilding] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi<{ customer: Customer; issuances: Issuance[] }>(`customers/${encodeURIComponent(id)}`)
      .then((data) => {
        setCustomer(data.customer);
        setIssuances(data.issuances);
      })
      .catch((caught) => setProblem(errorText(caught)));
  }, [id]);

  useEffect(load, [load]);

  async function issue() {
    if (!customer) return;
    const confirmed = window.confirm(
      `${customer.display_name} için ${customer.seats} cihazlık, ${trDate(customer.ends_on)} tarihine kadar geçerli yeni bir lisans imzalansın mı?`,
    );
    if (!confirmed) return;
    setIssuing(true);
    setProblem(null);
    try {
      const { issuance } = await adminApi<{ issuance: Issuance }>(`customers/${encodeURIComponent(id)}/issue`, { method: "POST", body: {} });
      setNotice(`Lisans ${issuance.license_id} imzalandı. Dosyaları aşağıdan indirebilir ya da kurulum derlemesini başlatabilirsiniz.`);
      load();
    } catch (caught) {
      setProblem(errorText(caught));
    } finally {
      setIssuing(false);
    }
  }

  async function build(licenseId: string) {
    setBuilding(licenseId);
    setProblem(null);
    try {
      const { runs_url } = await adminApi<{ runs_url: string }>(`customers/${encodeURIComponent(id)}/licenses/${encodeURIComponent(licenseId)}/build`, {
        method: "POST",
        body: { release_tag: releaseTag.trim(), build_exe: buildExe },
      });
      setNotice(
        <>
          Kurulum derlemesi başlatıldı. İlerlemeyi ve çıkan dosyaları{" "}
          <a href={runs_url} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
            GitHub Actions
          </a>{" "}
          sayfasında görebilirsiniz (onay gerektiren ortamlarda bir yöneticinin onayı beklenir).
        </>,
      );
      load();
    } catch (caught) {
      setProblem(errorText(caught));
    } finally {
      setBuilding(null);
    }
  }

  if (!customer) {
    return (
      <div style={page}>
        <section style={panel}>{problem ? <Notice tone="error">{problem}</Notice> : <p style={muted}>Yükleniyor…</p>}</section>
      </div>
    );
  }

  const download = (licenseId: string, file: string) => `/api/admin/customers/${encodeURIComponent(id)}/licenses/${encodeURIComponent(licenseId)}/${file}`;

  return (
    <div style={page}>
      <section style={panel}>
        <Link href="/admin" style={{ ...muted, textDecoration: "none" }}>
          ← Müşteri şirketler
        </Link>
        <div style={{ ...eyebrow, marginTop: 12 }}>
          {customer.customer_id} · {customer.deployment === "airgap" ? "Air-gap" : "On-prem"} · {customer.plan_id}
        </div>
        <h1 style={h1}>{customer.display_name}</h1>
        <p style={muted}>{customer.legal_name}</p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", margin: "16px 0" }}>
          {[
            ["Cihaz limiti", String(customer.seats)],
            ["Süre", `${trDate(customer.starts_on)} – ${trDate(customer.ends_on)}`],
            ["Ek süre", `${customer.grace_days} gün`],
            ["Şirket sunucusu", customer.control_plane_url || "Yok"],
          ].map(([name, value]) => (
            <div key={name} style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "var(--text-faint)", fontSize: 12 }}>{name}</div>
              <div style={{ color: "var(--text-primary)", fontSize: 16, fontWeight: 600, marginTop: 4, overflowWrap: "anywhere" }}>{value}</div>
            </div>
          ))}
        </div>
        {notice ? <Notice tone="ok">{notice}</Notice> : null}
        {problem ? <Notice tone="error">{problem}</Notice> : null}
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <Button primary type="button" disabled={issuing} onClick={issue}>
            {issuing ? "İmzalanıyor…" : "Lisans üret"}
          </Button>
          <Button type="button" onClick={() => setEditing((v) => !v)}>
            {editing ? "Düzenlemeyi kapat" : "Koşulları düzenle"}
          </Button>
        </div>
        <p style={{ ...muted, fontSize: 13, marginTop: 12 }}>
          Koşulları değiştirmek daha önce teslim edilen lisansı değiştirmez; değişiklik için yeni lisans üretip yeni kurulum dosyalarını
          teslim edin. Son güncelleme: {trDate(customer.updated_at)} ({customer.updated_by}).
        </p>
      </section>

      {editing ? (
        <section style={panel}>
          <h2 style={{ fontSize: 18, color: "var(--text-primary)", marginTop: 0 }}>Koşulları düzenle</h2>
          <CustomerForm
            initial={{ ...customer, features: customer.features.join(", ") }}
            editing
            submitLabel="Değişiklikleri kaydet"
            onSubmit={async (values) => {
              await adminApi(`customers/${encodeURIComponent(id)}`, { method: "PUT", body: values });
              setEditing(false);
              setNotice("Koşullar kaydedildi. Yeni koşullar bir sonraki lisansta geçerli olur.");
              load();
            }}
          />
        </section>
      ) : null}

      <section style={panel}>
        <h2 style={{ fontSize: 18, color: "var(--text-primary)", marginTop: 0 }}>Üretilen lisanslar</h2>
        {issuances.length === 0 ? (
          <p style={muted}>Henüz lisans üretilmedi.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <label style={{ ...muted, display: "flex", gap: 8, alignItems: "center" }}>
                Sürüm etiketi
                <input
                  style={{ ...input, width: 180 }}
                  value={releaseTag}
                  onChange={(e) => setReleaseTag(e.target.value)}
                  placeholder="v1.0.0-rc.3"
                  aria-label="Kurulum için yayımlanmış sürüm etiketi"
                />
              </label>
              <label style={{ ...muted, display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={buildExe} onChange={(e) => setBuildExe(e.target.checked)} />
                Windows için setup EXE de üret
              </label>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Lisans</th>
                    <th style={th}>Üretim</th>
                    <th style={th}>Cihaz</th>
                    <th style={th}>Süre</th>
                    <th style={th}>Güncellemeler</th>
                    <th style={th}>Dosyalar</th>
                    <th style={th}>Kurulum</th>
                  </tr>
                </thead>
                <tbody>
                  {issuances.map((item) => (
                    <tr key={item.license_id}>
                      <td style={td} className="mono">
                        {item.license_id}
                      </td>
                      <td style={td}>
                        {trDate(item.issued_at)}
                        <div style={{ color: "var(--text-faint)", fontSize: 12 }}>{item.issued_by}</div>
                      </td>
                      <td style={td}>{item.seats}</td>
                      <td style={td}>
                        {trDate(item.starts_on)} – {trDate(item.ends_on)}
                      </td>
                      <td style={td}>{trDate(item.updates_until)} tarihine kadar</td>
                      <td style={td}>
                        <a href={download(item.license_id, "license.json")} style={{ color: "var(--text-primary)" }}>
                          Lisans
                        </a>
                        {" · "}
                        <a href={download(item.license_id, "customer-packet.json")} style={{ color: "var(--text-primary)" }}>
                          Müşteri paketi
                        </a>
                      </td>
                      <td style={td}>
                        <Button
                          type="button"
                          disabled={building !== null || !RELEASE_TAG.test(releaseTag.trim())}
                          title={RELEASE_TAG.test(releaseTag.trim()) ? undefined : "Önce sürüm etiketini girin (vX.Y.Z-rc.N)"}
                          onClick={() => build(item.license_id)}
                        >
                          {building === item.license_id ? "Başlatılıyor…" : "Kurulum dosyalarını derle"}
                        </Button>
                        {item.builds.length > 0 ? (
                          <div style={{ color: "var(--text-faint)", fontSize: 12, marginTop: 6 }}>
                            Son derleme: {trDate(item.builds.at(-1)?.requested_at)} · {item.builds.at(-1)?.release_tag}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
