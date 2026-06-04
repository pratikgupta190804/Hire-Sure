import { useCallback, useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi";
import { useToast } from "../../hooks/useToast";

export function AdminContestsPage({ navigate }) {
  const api = useApi();
  const { show } = useToast();
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api("/api/contests?size=100");
      setContests(d.content || d);
    } catch (e) {
      show(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [api, show]);

  useEffect(() => {
    load();
  }, [load]);

  const del = async (id, title) => {
    if (!confirm(`Delete "${title}"?`)) return;
    setDeleting(id);
    try {
      await api(`/api/contests/${id}`, { method: "DELETE" });
      show("Contest deleted", "success");
      load();
    } catch (e) {
      show(e.message, "error");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="page">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            Manage Contests
          </h1>
          <p style={{ color: "var(--text3)", fontSize: 13 }}>
            Schedule contests, assign problems, and manage rankings.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate("/admin/contests/new")}
        >
          + Create Contest
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div
            style={{ display: "flex", justifyContent: "center", padding: 40 }}
          >
            <div className="spinner" />
          </div>
        ) : contests.length === 0 ? (
          <div className="empty-state">
            <div className="icon">⏱</div>
            <p>No contests yet</p>
            <button
              className="btn btn-primary"
              onClick={() => navigate("/admin/contests/new")}
            >
              Create your first contest
            </button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th>Problems</th>
                <th style={{ width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contests.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.title}</td>
                  <td style={{ fontSize: 12, color: "var(--text3)" }}>
                    {c.startAt ? new Date(c.startAt).toLocaleString() : "-"}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text3)" }}>
                    {c.endAt ? new Date(c.endAt).toLocaleString() : "-"}
                  </td>
                  <td>{c.status || "-"}</td>
                  <td>{c.problemCount ?? 0}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/admin/contests/${c.id}/edit`)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => del(c.id, c.title)}
                        disabled={deleting === c.id}
                      >
                        {deleting === c.id ? (
                          <span
                            className="spinner"
                            style={{ width: 12, height: 12 }}
                          />
                        ) : (
                          "Delete"
                        )}
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
