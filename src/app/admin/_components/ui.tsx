"use client";

export const panel: React.CSSProperties = {
  border: "1px solid var(--panel-border)",
  borderRadius: 18,
  background: "var(--panel-bg)",
  boxShadow: "0 12px 36px var(--shadow-color)",
  padding: 24,
};

export const page: React.CSSProperties = { maxWidth: 1100, margin: "0 auto", display: "grid", gap: 20 };

export const eyebrow: React.CSSProperties = { color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" };

export const h1: React.CSSProperties = { fontSize: 26, color: "var(--text-primary)", margin: "6px 0 4px" };

export const muted: React.CSSProperties = { color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 };

export const input: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 8,
  border: "1px solid var(--panel-border)",
  background: "transparent",
  color: "var(--text-primary)",
  fontSize: 14,
};

export const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
export const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  color: "var(--text-faint)",
  fontWeight: 500,
  borderBottom: "1px solid var(--panel-border)",
  whiteSpace: "nowrap",
};
export const td: React.CSSProperties = { padding: "10px", color: "var(--text-primary)", borderBottom: "1px solid var(--panel-border)", verticalAlign: "top" };

export function Button({
  children,
  primary,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      {...props}
      style={{
        padding: "9px 16px",
        borderRadius: 8,
        border: primary ? "none" : "1px solid var(--panel-border)",
        background: primary ? "var(--text-primary)" : "transparent",
        color: primary ? "var(--bg, #000)" : "var(--text-primary)",
        fontSize: 14,
        fontWeight: 600,
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.55 : 1,
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

export function Notice({ tone, children }: { tone: "error" | "ok" | "info"; children: React.ReactNode }) {
  const color = tone === "error" ? "#e5484d" : tone === "ok" ? "#30a46c" : "var(--text-secondary)";
  return (
    <div role={tone === "error" ? "alert" : "status"} style={{ border: `1px solid ${color}`, color, borderRadius: 10, padding: "10px 14px", fontSize: 14 }}>
      {children}
    </div>
  );
}

export type ApiError = { error: string; message?: string; field?: string };

/** JSON call to /api/admin/*; throws the API's error body. */
export async function adminApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({ error: "bad_response" }));
  if (!response.ok) throw data as ApiError;
  return data as T;
}

export function errorText(caught: unknown): string {
  const e = caught as ApiError;
  if (e?.message) return e.message;
  if (e?.error === "second_factor_required") return "Oturumunuz iki adımlı doğrulamayla açılmamış ya da süresi dolmuş; yeniden giriş yapın.";
  return `İşlem başarısız (${e?.error ?? "bilinmeyen hata"}).`;
}

/** YYYY-MM-DD → 14.10.2026 */
export function trDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}
