export default function ContestProblemList({ problems, navigate }) {
  if (!problems?.length) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {problems.map((problem, idx) => (
        <div
          key={idx}
          className="card"
          onClick={() => navigate(`/problems/${problem.slug}`)}
          style={{
            padding: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 12,
                color: "var(--text3)",
                width: 24,
              }}
            >
              {idx + 1}
            </span>

            <span
              style={{
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              {problem.title}
            </span>
          </div>

          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--accent)",
            }}
          >
            {problem.points} pts
          </span>
        </div>
      ))}
    </div>
  );
}