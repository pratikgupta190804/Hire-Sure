import { useState, useEffect, useCallback } from "react";
import { useApi } from "../hooks/useApi";
import { diffBadge } from "../utils/helpers";

export function ProblemsPage({ navigate }) {
  const api = useApi();
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [diff, setDiff] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        size: 20,
        ...(diff && { difficulty: diff }),
        ...(search && { search }),
      });
      const data = await api(`/api/problems?${params}`);
      setProblems(data.content || data);
      setTotal(data.totalElements || (data.content || data).length);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [api, diff, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = {
    total: problems.length,
    easy: problems.filter((p) => p.difficulty === "EASY").length,
    medium: problems.filter((p) => p.difficulty === "MEDIUM").length,
    hard: problems.filter((p) => p.difficulty === "HARD").length,
  };

  return (
    <div className="page content">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Problems</h1>
          <p style={{ color: "var(--text3)", fontSize: 13, marginTop: 2 }}>{total} problems available</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div className="search-bar" style={{ width: 220 }}>
            <span style={{ color: "var(--text3)" }}>⌕</span>
            <input
              placeholder="Search problems..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <div className="diff-tab">
            {["", "EASY", "MEDIUM", "HARD"].map((d) => (
              <button key={d} className={diff === d ? "active" : ""} onClick={() => { setDiff(d); setPage(0); }}>
                {d || "All"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { l: "Total", v: total, c: "var(--text)" },
          { l: "Easy", v: stats.easy, c: "var(--easy)" },
          { l: "Medium", v: stats.medium, c: "var(--medium)" },
          { l: "Hard", v: stats.hard, c: "var(--hard)" },
        ].map((s) => (
          <div key={s.l} className="stat-card">
            <div className="stat-value" style={{ color: s.c }}>{s.v}</div>
            <div className="stat-label">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : problems.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📭</div>
            <p>No problems found</p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <span style={{ width: 40 }}>#</span>
              <span style={{ flex: 1 }}>Title</span>
              <span style={{ width: 90 }}>Difficulty</span>
              <span style={{ width: 80 }}>Status</span>
            </div>
            {problems.map((p, i) => (
              <div key={p.id} className="problem-row" onClick={() => navigate(`/problems/${p.slug}`)}>
                <span className="num">{i + 1 + page * 20}</span>
                <span className="title">{p.title}</span>
                <span>{diffBadge(p.difficulty)}</span>
                <span style={{ width: 80, display: "flex", justifyContent: "flex-end" }}>
                  <div
                    className={`solved ${p.solved ? "yes" : "no"}`}
                    title={p.solved ? "Solved" : "Not solved"}
                  />
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {total > 20 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
          <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </button>
          <span style={{ padding: "5px 12px", fontSize: 13, color: "var(--text2)" }}>Page {page + 1}</span>
          <button className="btn btn-ghost btn-sm" disabled={(page + 1) * 20 >= total} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}