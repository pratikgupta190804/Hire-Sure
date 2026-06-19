import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";
import { statusBadge } from "../utils/helpers";
import { LANGUAGES } from "../utils/constants";

export function SubmissionsPage({ navigate }) {
  const api = useApi();
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/submissions/me")
      .then((d) => { setSubs(d.content || d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="page content">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>My Submissions</h1>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : subs.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📋</div>
            <p>No submissions yet</p>
            <button className="btn btn-primary" onClick={() => navigate("/problems")}>
              Start solving
            </button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Problem</th>
                <th>Language</th>
                <th>Status</th>
                <th>Runtime</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/problems/${s.slag}`)}>
                  <td style={{ fontWeight: 500 }}>{s.problemTitle}</td>
                  <td>
                    <span className="tag">{LANGUAGES.find((l) => l.id === s.languageId)?.name || s.languageId}</span>
                  </td>
                  <td>{statusBadge(s.status)}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text2)" }}>
                    {s.runtimeMs ? `${s.runtimeMs}ms` : "—"}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text3)" }}>
                    {new Date(s.submittedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}