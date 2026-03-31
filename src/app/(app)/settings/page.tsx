"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  if (loading) {
    return <div style={{ padding: 40 }}>Loading...</div>;
  }

  return (
    <div style={{ padding: 40, maxWidth: 800, margin: "0 auto" }}>
      <h1>Settings</h1>
      <p>Account settings will be available here.</p>
      
      <div style={{ 
        padding: 40, 
        background: "#f9fafb", 
        borderRadius: 12,
        marginTop: 20 
      }}>
        <p>Coming soon...</p>
      </div>
    </div>
  );
}
