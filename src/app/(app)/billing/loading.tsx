export default function BillingLoading() {
  const cardStyle: React.CSSProperties = {
    border: "1px solid var(--panel-border)",
    borderRadius: 18,
    background: "var(--panel-bg)",
    padding: 24,
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 20px" }}>
      <div style={cardStyle}>
        <div style={{ height: 180, background: "var(--bg-secondary)", borderRadius: 14 }} />
      </div>
      <div style={{ ...cardStyle, marginTop: 18 }}>
        <div style={{ height: 120, background: "var(--bg-secondary)", borderRadius: 14 }} />
      </div>
    </div>
  );
}
