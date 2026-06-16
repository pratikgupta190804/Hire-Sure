import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useApi } from "../hooks/useApi";
import ContestStatusBadge from "../components/ContestStatusBadge";
import ContestCountdown from "../components/ContestCountdown";
import ContestProblemList from "../components/ContestProblemList";
import ContestLeaderboard from "../components/ContestLeaderboard";

export default function ContestDetailPage({ contestId, navigate }) {
  const api = useApi();
  const [contest, setContest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [activeTab, setActiveTab] = useState("details");

  useEffect(() => {
    if (!contestId) return;
    setLoading(true);
    api(`/api/contests/${contestId}`)
      .then((c) => setContest(c))
      .catch((e) => setError(e.message || "Contest not found."))
      .finally(() => setLoading(false));
  }, [api, contestId]);

  const handleJoin = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      await api(`/api/contests/${contestId}/join`, { method: "POST" });
      setContest((prev) => ({ ...prev, participating: true }));
    } catch (e) {
      setJoinError(e.message || "Failed to join. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  const shareContest = async () => {
    const contestUrl = `${window.location.origin}/contest/${contest.id}/info`;

    const shareText = `
🚀 Coding Contest Alert! 🚀

${contest.title}

${contest.description || ""}

🏆 Compete with fellow programmers
⚡ Solve challenging problems
📈 Improve your problem-solving skills
🎯 Climb the leaderboard

📌 Rules:
${contest.rules || "Follow contest guidelines."}

🔗 Join the contest:
${contestUrl}

Invite your friends and see who comes out on top! 💻🔥
`.trim();

    try {
      if (navigator.share) {
        await navigator.share({
          title: contest.title,
          text: shareText,
          url: contestUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareText);
        alert("Contest details copied to clipboard!");
      }
    } catch (err) {
      console.log("Share cancelled");
    }
  };

  if (loading) {
    return (
      <div className="page content" style={{ maxWidth: 768, margin: "0 auto", display: "flex", justifyContent: "center", padding: 60 }}>
        <div className="spinner" />
      </div>
    );
  }

  if (error || !contest) {
    return (
      <div className="page content" style={{ maxWidth: 768, margin: "0 auto", textAlign: "center", padding: 40 }}>
        <p style={{ color: "var(--red)", marginBottom: 16 }}>{error ?? "Contest not found."}</p>
        <button
          onClick={() => navigate("/contests")}
          className="btn btn-ghost btn-sm"
        >
          ← Back to contests
        </button>
      </div>
    );
  }

  const {
    title,
    description,
    rules,
    status,
    startAt,
    endAt,
    visibility,
    participating,
    problems,
  } = contest;

  const hasStarted = status !== "UPCOMING";
  const isFinished = status === "FINISHED";

  const formatDateStr = (dt) => {
    if (!dt) return "";
    try {
      return format(new Date(dt), "MMM d, yyyy · h:mm a");
    } catch (e) {
      return "";
    }
  };

  return (
    <div className="page content" style={{ maxWidth: 768, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Back button */}
      <div>
        <button
          onClick={() => navigate("/contests")}
          className="btn btn-ghost btn-sm"
        >
          ← All contests
        </button>
      </div>

      {/* Hero card */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <ContestStatusBadge status={status} />
              {visibility === "PRIVATE" && (
                <span
                  className="tag"
                  style={{
                    borderColor: "var(--amber)",
                    color: "var(--amber)",
                    background: "rgba(245, 158, 11, 0.05)",
                  }}
                >
                  Private
                </span>
              )}
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--text)" }}>
              {title}
            </h1>
          </div>

          <button onClick={shareContest} className="btn btn-ghost btn-sm">
            Share Contest
          </button>

          {!isFinished &&
            (participating ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--accent)",
                  background: "rgba(0, 229, 160, 0.05)",
                  border: "1px solid rgba(0, 229, 160, 0.2)",
                  padding: "6px 12px",
                  borderRadius: "var(--radius)",
                }}
              >
                ✓ Registered
              </span>
            ) : (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="btn btn-primary"
              >
                {joining ? "Joining..." : "Join contest"}
              </button>
            ))}
        </div>

        {joinError && (
          <p style={{ color: "var(--red)", fontSize: 12, margin: 0 }}>{joinError}</p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "var(--text2)", flexWrap: "wrap" }}>
          <span>
            🗓 {formatDateStr(startAt)} → {formatDateStr(endAt)}
          </span>
          <span>
            📝 {problems?.length ?? 0} problems
          </span>
        </div>

        {status === "UPCOMING" && startAt && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <ContestCountdown target={startAt} label="Starts in" />
          </div>
        )}

        {status === "ONGOING" && endAt && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <ContestCountdown target={endAt} label="Ends in" />
          </div>
        )}
      </div>

      {/* Tabs */}
      {hasStarted && (
        <div className="diff-tab" style={{ display: "inline-flex", alignSelf: "flex-start", marginBottom: 10 }}>
          <button
            className={activeTab === "details" ? "active" : ""}
            onClick={() => setActiveTab("details")}
          >
            Contest Details
          </button>
          <button
            className={activeTab === "standings" ? "active" : ""}
            onClick={() => setActiveTab("standings")}
          >
            Leaderboard (Standings)
          </button>
        </div>
      )}

      {activeTab === "details" ? (
        <>
          {/* About */}
          {description && (
            <div className="card">
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>About</h2>
              <p style={{ color: "var(--text2)", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{description}</p>
            </div>
          )}

          {/* Rules */}
          {rules && (
            <div className="card">
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>Rules</h2>
              <p style={{ color: "var(--text2)", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{rules}</p>
            </div>
          )}

          {/* Problems */}
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>Problems</h2>
            {hasStarted ? (
              <ContestProblemList problems={problems} navigate={navigate} participating={participating} status={status} />
            ) : (
              <div className="card" style={{ textAlign: "center", padding: 24, background: "rgba(59, 130, 246, 0.02)", borderColor: "rgba(59, 130, 246, 0.1)" }}>
                <p style={{ color: "var(--blue)", fontSize: 13, fontWeight: 500, marginBottom: 12 }}>
                  Problems will be revealed when the contest starts.
                </p>
                {startAt && <ContestCountdown target={startAt} label="Starts in" />}
              </div>
            )}
          </div>
        </>
      ) : (
        <ContestLeaderboard contestId={contestId} problems={problems} />
      )}
    </div>
  );
}