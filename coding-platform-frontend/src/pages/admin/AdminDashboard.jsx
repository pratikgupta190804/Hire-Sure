import { useState, useEffect } from "react";
import { useApi } from "../../hooks/useApi";

export function AdminDashboard({ navigate }) {
  const api = useApi();
  const [stats, setStats] = useState({ problems: 0 });

  useEffect(() => {
    api("/api/problems?size=1")
      .then((d) => setStats((s) => ({ ...s, problems: d.totalElements || 0 })))
      .catch(() => {});
  }, []);

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Admin Dashboard</h1>
      <p style={{ color: "var(--text3)", fontSize: 13, marginBottom: 24 }}>Manage your platform</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--accent)" }}>{stats.problems}</div>
          <div className="stat-label">Total Problems</div>
        </div>
        <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => navigate("/admin/problems/new")}>
          <div className="stat-value">+</div>
          <div className="stat-label">Add Problem</div>
        </div>
        <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => navigate("/admin/generate")}>
          <div className="stat-value" style={{ color: "var(--purple)" }}>AI</div>
          <div className="stat-label">Generate Problem</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[
          { title: "Add Problem Manually", desc: "Create a new problem with custom test cases", btn: "Add Problem", to: "/admin/problems/new", color: "var(--accent)" },
          { title: "AI Problem Generator", desc: "Generate problems using Gemini AI, preview and edit before saving", btn: "Open Generator", to: "/admin/generate", color: "var(--purple)" },
        ].map((c) => (
          <div key={c.title} className="card">
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{c.title}</div>
            <div style={{ color: "var(--text3)", fontSize: 13, marginBottom: 16 }}>{c.desc}</div>
            <button className="btn btn-ghost" onClick={() => navigate(c.to)} style={{ color: c.color, borderColor: c.color + "40" }}>
              {c.btn} →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}