import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useApi } from "../hooks/useApi";
import { statusBadge } from "../utils/helpers";

export function ProfilePage() {
  const { user } = useAuth();
  const api = useApi();
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/submissions/me")
      .then((d) => { setSubs(d.content || d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const accepted = subs.filter((s) => s.status === "ACCEPTED").length;
  const uniqueSolved = new Set(
    subs
      .filter(
        (s) =>
          s.status === "ACCEPTED" &&
          s.problemId != null
      )
      .map((s) => s.problemId)
  ).size;
  const rate = subs.length ? Math.round((accepted / subs.length) * 100) : 0;

  return (
    <div className="page content">
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ width: 280 }}>
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--bg4)", border: "2px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 24, fontWeight: 700, color: "var(--accent)" }}>
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{user?.username}</div>
            <div style={{ color: "var(--text3)", fontSize: 12, marginTop: 4 }}>{user?.email}</div>
            {user?.role === "ADMIN" && (
              <span className="badge" style={{ marginTop: 8, background: "rgba(245,158,11,0.1)", color: "var(--amber)" }}>
                ADMIN
              </span>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-value" style={{ color: "var(--accent)" }}>{uniqueSolved}</div>
              <div className="stat-label">Problems Solved</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{subs.length}</div>
              <div className="stat-label">Total Submissions</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: rate >= 50 ? "var(--accent)" : "var(--amber)" }}>{rate}%</div>
              <div className="stat-label">Acceptance Rate</div>
            </div>
          </div>
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 16 }}>Recent Activity</div>
            {loading ? (
              <div className="spinner" />
            ) : (
              subs.slice(0, 8).map((s) => (
                <div key={s.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  {statusBadge(s.status)}
                  <span style={{ fontSize: 13, flex: 1 }}>{s.problemTitle}</span>
                  <span style={{ fontSize: 11, color: "var(--text3)" }}>{new Date(s.submittedAt).toLocaleDateString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}