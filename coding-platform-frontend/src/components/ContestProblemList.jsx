export default function ContestProblemList({
  problems,
  navigate,
  participating,
  status,
}) {
  if (!problems?.length) return null;

  const isLocked = status === "ONGOING" && !participating;

  const handleClick = (slug) => {
    if (isLocked) {
      alert("You must join/register for the contest before accessing problems.");
      return;
    }

    navigate(`/problems/${slug}`);
  };

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
          onClick={() => handleClick(problem.slug)}
          style={{
            padding: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: isLocked ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
            opacity: isLocked ? 0.6 : 1,
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

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  color: "var(--text)",
                }}
              >
                {problem.title}
              </span>

              {isLocked && (
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--warning, #f59e0b)",
                  }}
                >
                  🔒 Locked (Join contest to unlock)
                </span>
              )}
            </div>
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