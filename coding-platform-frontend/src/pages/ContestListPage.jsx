import { useState, useEffect, useCallback } from "react";
import { useApi } from "../hooks/useApi";
import ContestCard from "../components/ContestCard";

const TABS = [
  { label: "All",      value: null },
  { label: "Upcoming", value: "UPCOMING" },
  { label: "Live",     value: "ONGOING" },
  { label: "Finished", value: "FINISHED" },
];

export default function ContestListPage({ navigate }) {
  const api = useApi();
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page,
        size: 10,
        ...(status && { status }),
      });
      const data = await api(`/api/contests?${params}`);
      setContests(data.content || data);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      setError(e.message || "Failed to load contests.");
    } finally {
      setLoading(false);
    }
  }, [api, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = (s) => {
    setStatus(s);
    setPage(0);
  };

  return (
    <div className="page content" style={{ maxWidth: 768, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Contests</h1>
          <p style={{ color: "var(--text3)", fontSize: 13, marginTop: 2 }}>
            Join programming challenges and test your skills
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="diff-tab" style={{ marginBottom: 24, display: "inline-flex" }}>
        {TABS.map((t) => (
          <button
            key={t.label}
            className={status === t.value ? "active" : ""}
            onClick={() => changeStatus(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <div className="spinner" />
        </div>
      ) : error ? (
        <div className="card" style={{ textAlign: "center", padding: 32, color: "var(--red)" }}>
          <p>{error}</p>
        </div>
      ) : contests.length === 0 ? (
        <div className="empty-state">
          <div className="icon">⏱</div>
          <p>No contests found</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {contests.map((c) => (
            <ContestCard key={c.id} contest={c} navigate={navigate} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            ← Prev
          </button>
          <span style={{ padding: "5px 12px", fontSize: 13, color: "var(--text2)" }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}