"use client";

import { useEffect, useState } from "react";

export default function AgentsPage() {
  const [agents, setAgents] = useState<{ id: string; name: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch agents from API
    setLoading(false);
  }, []);

  return (
    <div style={{ padding: 40, maxWidth: 800, margin: "0 auto" }}>
      <h1>Agents</h1>
      <p>Connected AI agents will appear here.</p>
      
      {loading ? (
        <div>Loading...</div>
      ) : agents.length === 0 ? (
        <div style={{ 
          padding: 40, 
          background: "#f9fafb", 
          borderRadius: 12,
          textAlign: "center",
          marginTop: 20 
        }}>
          <p>No agents connected yet.</p>
          <p>Go to <a href="/onboarding" style={{ color: "#3b82f6" }}>Onboarding</a> to set up your first agent.</p>
        </div>
      ) : (
        <div>
          {agents.map((agent) => (
            <div key={agent.id}>{agent.name}</div>
          ))}
        </div>
      )}
    </div>
  );
}
