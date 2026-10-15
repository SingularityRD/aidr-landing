"use client";

import { useState } from "react";
import { Button, Notice, errorText, input, type ApiError } from "./ui";

export interface CustomerFormValues {
  customer_id: string;
  legal_name: string;
  display_name: string;
  seats: number | string;
  plan_id: string;
  deployment: string;
  features: string;
  starts_on: string;
  ends_on: string;
  grace_days: number | string;
  control_plane_url: string;
  sensitivity: string;
  contact_email: string;
  notes: string;
}

function today(offsetYears = 0): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + offsetYears);
  return d.toISOString().slice(0, 10);
}

export const emptyCustomer = (): CustomerFormValues => ({
  customer_id: "",
  legal_name: "",
  display_name: "",
  seats: 50,
  plan_id: "enterprise",
  deployment: "onprem",
  features: "",
  starts_on: today(),
  ends_on: today(1),
  grace_days: 14,
  control_plane_url: "",
  sensitivity: "",
  contact_email: "",
  notes: "",
});

const label: React.CSSProperties = { display: "grid", gap: 6, fontSize: 13, color: "var(--text-secondary)" };
const hint: React.CSSProperties = { fontSize: 12, color: "var(--text-faint)" };

/** Create or edit a customer company's license terms. */
export function CustomerForm({
  initial,
  editing,
  submitLabel,
  onSubmit,
}: {
  initial: CustomerFormValues;
  editing: boolean;
  submitLabel: string;
  onSubmit(values: CustomerFormValues): Promise<void>;
}) {
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; field?: string } | null>(null);

  const set = (field: keyof CustomerFormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [field]: event.target.value }));
  const fieldStyle = (field: string): React.CSSProperties => ({ ...input, ...(problem?.field === field ? { borderColor: "#e5484d" } : {}) });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await onSubmit(values);
    } catch (caught) {
      setProblem({ text: errorText(caught), field: (caught as ApiError)?.field });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <label style={label}>
          Müşteri kimliği
          <input
            style={fieldStyle("customer_id")}
            value={values.customer_id}
            onChange={set("customer_id")}
            disabled={editing}
            required
            pattern="[a-z0-9][a-z0-9-]{1,31}"
            placeholder="bilgem"
          />
          <span style={hint}>Küçük harf, rakam ve tire. Kurulum dosyasının adında geçer; sonradan değişmez.</span>
        </label>
        <label style={label}>
          Şirketin yasal adı
          <input style={fieldStyle("legal_name")} value={values.legal_name} onChange={set("legal_name")} required maxLength={120} placeholder="TÜBİTAK BİLGEM" />
          <span style={hint}>Lisansa yazılır.</span>
        </label>
        <label style={label}>
          Görünen ad
          <input style={fieldStyle("display_name")} value={values.display_name} onChange={set("display_name")} required maxLength={60} placeholder="TÜBİTAK BİLGEM" />
          <span style={hint}>Kurulum sihirbazı ve aidr status bunu gösterir (en çok 60 karakter).</span>
        </label>
        <label style={label}>
          Cihaz limiti
          <input style={fieldStyle("seats")} type="number" min={1} max={100000} value={values.seats} onChange={set("seats")} required />
          <span style={hint}>Şirket sunucusuna kaydedilebilecek bilgisayar sayısı.</span>
        </label>
        <label style={label}>
          Başlangıç tarihi
          <input style={fieldStyle("starts_on")} type="date" value={values.starts_on} onChange={set("starts_on")} required />
        </label>
        <label style={label}>
          Bitiş tarihi
          <input style={fieldStyle("ends_on")} type="date" value={values.ends_on} onChange={set("ends_on")} required />
          <span style={hint}>Son gün dahil. En çok 5 yıl.</span>
        </label>
        <label style={label}>
          Ek süre (gün)
          <input style={fieldStyle("grace_days")} type="number" min={0} max={90} value={values.grace_days} onChange={set("grace_days")} required />
          <span style={hint}>Bitişten sonra güncellemelerin kabul edileceği gün sayısı (0–90).</span>
        </label>
        <label style={label}>
          Plan
          <select style={fieldStyle("plan_id")} value={values.plan_id} onChange={set("plan_id")}>
            <option value="enterprise">Enterprise</option>
            <option value="business">Business</option>
            <option value="team">Team</option>
            <option value="free">Free</option>
          </select>
        </label>
        <label style={label}>
          Kurulum türü
          <select style={fieldStyle("deployment")} value={values.deployment} onChange={set("deployment")}>
            <option value="onprem">Şirket içi (on-prem)</option>
            <option value="airgap">İnternetsiz ağ (air-gap, yalnızca Enterprise)</option>
          </select>
        </label>
        <label style={label}>
          Şirket sunucusu adresi
          <input style={fieldStyle("control_plane_url")} value={values.control_plane_url} onChange={set("control_plane_url")} placeholder="https://aidr.sirket.local/" />
          <span style={hint}>İsteğe bağlı. Kurulum sihirbazı bu adresi gösterir ve bilgisayarı ona bağlar.</span>
        </label>
        <label style={label}>
          Hassasiyet
          <select style={fieldStyle("sensitivity")} value={values.sensitivity} onChange={set("sensitivity")}>
            <option value="">Varsayılan</option>
            <option value="paranoid">Paranoid (en sıkı)</option>
            <option value="balanced">Balanced</option>
            <option value="relaxed">Relaxed</option>
          </select>
        </label>
        <label style={label}>
          İletişim e-postası
          <input style={fieldStyle("contact_email")} type="email" value={values.contact_email} onChange={set("contact_email")} />
        </label>
      </div>
      <label style={label}>
        Özellikler
        <input style={fieldStyle("features")} value={values.features} onChange={set("features")} placeholder="premium_intel, offline_packs" />
        <span style={hint}>İsteğe bağlı, virgülle ayrılmış.</span>
      </label>
      <label style={label}>
        Notlar
        <textarea style={{ ...fieldStyle("notes"), minHeight: 70 }} value={values.notes} onChange={set("notes")} maxLength={2000} />
      </label>
      {problem ? <Notice tone="error">{problem.text}</Notice> : null}
      <div>
        <Button primary type="submit" disabled={busy}>
          {busy ? "Kaydediliyor…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
