"use client";

import { useEffect, useState } from "react";

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<{ id: string; title: string; severity: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch incidents from API
    setLoading(false);
  }, []);

  return (
    <div style={{ padding: 40, maxWidth: 800, margin: "0 auto" }}>
      <h1>Incidents</h1>
      <p>Security incidents will appear here.</p>
      
      {loading ? (
        <div>Loading...</div>
      ) : incidents.length === 0 ? (
        <div style={{ 
          padding: 40, 
          background: "#f9fafb", 
          borderRadius: 12,
          textAlign: "center",
          marginTop: 20 
        }}>
          <p>No incidents reported.</p>
          <p>Your agents are running safely.</p>
        </div>
      ) : (
        <div>
          {incidents.map((incident) => (
            <div key={incident.id}>{incident.title}</div>
          ))}
        </div>
      )}
    </div>
  );
}
