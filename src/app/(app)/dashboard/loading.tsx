export default function DashboardLoading() {
  const cardStyle: React.CSSProperties = {
    border: "1px solid var(--panel-border)",
    borderRadius: 18,
    background: "var(--panel-bg)",
    padding: 24,
  };

  return (
    <div style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
      <div style={cardStyle}>
        <div style={{ height: 120, background: "var(--bg-secondary)", borderRadius: 14 }} />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginTop: 18,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={cardStyle}>
            <div style={{ height: 60, background: "var(--bg-secondary)", borderRadius: 12 }} />
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: 18,
          marginTop: 18,
        }}
      >
        <div style={cardStyle}>
          <div style={{ height: 200, background: "var(--bg-secondary)", borderRadius: 14 }} />
        </div>
        <div style={cardStyle}>
          <div style={{ height: 200, background: "var(--bg-secondary)", borderRadius: 14 }} />
        </div>
      </div>
    </div>
  );
}
