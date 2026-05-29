import { useState, useEffect, useCallback } from "react";
import { useApi } from "../../hooks/useApi";
import { useToast } from "../../hooks/useToast";
import { diffBadge } from "../../utils/helpers";

export function AdminProblemsPage({ navigate }) {
  const api = useApi();
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const { show } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api("/api/problems?size=100");
      setProblems(d.content || d);
    } catch (e) {
      show(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const del = async (id, title) => {
    if (!confirm(`Delete "${title}"?`)) return;
    setDeleting(id);
    try {
      await api(`/api/problems/${id}`, { method: "DELETE" });
      show("Problem deleted", "success");
      load();
    } catch (e) {
      show(e.message, "error");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Manage Problems</h1>
        <button className="btn btn-primary" onClick={() => navigate("/admin/problems/new")}>
          + Add Problem
        </button>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : problems.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📝</div>
            <p>No problems yet</p>
            <button className="btn btn-primary" onClick={() => navigate("/admin/problems/new")}>
              Add first problem
            </button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Difficulty</th>
                <th>Created</th>
                <th style={{ width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.title}</td>
                  <td>{diffBadge(p.difficulty)}</td>
                  <td style={{ fontSize: 12, color: "var(--text3)" }}>
                    {new Date(p.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/admin/problems/${p.id}/edit`)}>
                        Edit
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(p.id, p.title)} disabled={deleting === p.id}>
                        {deleting === p.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : "Delete"}
                      </button>
                    </div>
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