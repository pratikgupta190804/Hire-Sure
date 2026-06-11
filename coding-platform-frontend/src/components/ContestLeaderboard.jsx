import { useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";

export default function ContestLeaderboard({ contestId, problems }) {
  const api = useApi();
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!contestId) return;
    setLoading(true);
    api(`/api/contests/${contestId}/ranking`)
      .then((data) => {
        setLeaderboard(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || "Failed to load leaderboard.");
        setLoading(false);
      });
  }, [api, contestId]);

  const formatTime = (totalSeconds) => {
    if (totalSeconds <= 0) return "0s";
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };

  const renderRatingChange = (change) => {
    if (change === null || change === undefined) return <span style={{ color: "var(--text3)" }}>-</span>;
    if (change > 0) {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            background: "rgba(0, 229, 160, 0.1)",
            border: "1px solid rgba(0, 229, 160, 0.2)",
            color: "rgba(0, 229, 160, 1)",
            padding: "2px 8px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          ▲ +{change}
        </span>
      );
    }
    if (change < 0) {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            color: "rgba(239, 68, 68, 1)",
            padding: "2px 8px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          ▼ {change}
        </span>
      );
    }
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          background: "rgba(107, 114, 128, 0.1)",
          border: "1px solid rgba(107, 114, 128, 0.2)",
          color: "rgba(156, 163, 175, 1)",
          padding: "2px 8px",
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        0
      </span>
    );
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 24, color: "var(--red)" }}>
        <p>{error}</p>
      </div>
    );
  }

  const rows = leaderboard?.rows || [];

  if (rows.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 32 }}>
        <p style={{ color: "var(--text3)" }}>No participants registered for this contest yet.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflowX: "auto" }}>
      <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th style={{ width: 60, textAlign: "center" }}>Rank</th>
            <th style={{ minWidth: 150 }}>User</th>
            <th style={{ width: 90, textAlign: "center" }}>Score</th>
            <th style={{ width: 120, textAlign: "center" }}>Penalty</th>
            <th style={{ width: 140, textAlign: "center" }}>Rating Change</th>
            {problems?.map((p, idx) => (
              <th
                key={idx}
                style={{
                  width: 90,
                  textAlign: "center",
                  fontSize: 12,
                  fontWeight: 600,
                }}
                title={p.title}
              >
                P{idx + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.userId}
              style={{
                borderBottom: "1px solid var(--border)",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg3)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <td style={{ textAlign: "center", fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
                {row.rank}
              </td>
              <td>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>{row.username}</span>
                  {row.ratingBefore && (
                    <span style={{ fontSize: 11, color: "var(--text3)" }}>
                      Rating: {row.ratingBefore}
                    </span>
                  )}
                </div>
              </td>
              <td style={{ textAlign: "center", fontWeight: 600, color: "var(--accent)" }}>
                {row.score}
              </td>
              <td style={{ textAlign: "center", fontSize: 12, color: "var(--text2)", fontFamily: "var(--mono)" }}>
                {formatTime(row.penaltyTimeSeconds)}
              </td>
              <td style={{ textAlign: "center" }}>
                {renderRatingChange(row.ratingChange)}
              </td>
              {problems?.map((p, idx) => {
                // Find matching status
                // Backend maps slug or problem id, let's look up using indices or matching fields
                const status = row.problemStatuses?.[idx];
                if (!status) return <td key={idx} style={{ textAlign: "center" }}>-</td>;

                if (status.solved) {
                  return (
                    <td
                      key={idx}
                      style={{
                        textAlign: "center",
                        background: "rgba(0, 229, 160, 0.04)",
                        color: "rgba(0, 229, 160, 1)",
                        fontSize: 12,
                        padding: "8px 4px",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>✓</div>
                      <div style={{ fontSize: 10, fontFamily: "var(--mono)" }}>
                        {formatTime(status.timeToSolveSeconds)}
                      </div>
                      {status.failedAttempts > 0 && (
                        <div style={{ fontSize: 9, opacity: 0.8 }}>
                          (+{status.failedAttempts})
                        </div>
                      )}
                    </td>
                  );
                } else if (status.failedAttempts > 0) {
                  return (
                    <td
                      key={idx}
                      style={{
                        textAlign: "center",
                        background: "rgba(239, 68, 68, 0.04)",
                        color: "rgba(239, 68, 68, 1)",
                        fontSize: 12,
                        padding: "8px 4px",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>✗</div>
                      <div style={{ fontSize: 9, fontFamily: "var(--mono)" }}>
                        (-{status.failedAttempts})
                      </div>
                    </td>
                  );
                }

                return (
                  <td
                    key={idx}
                    style={{
                      textAlign: "center",
                      color: "var(--text3)",
                      fontSize: 13,
                    }}
                  >
                    -
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
