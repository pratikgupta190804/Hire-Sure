import { format } from "date-fns";
import ContestStatusBadge from "./ContestStatusBadge";
import ContestCountdown from "./ContestCountdown";

export default function ContestCard({ contest, navigate }) {
  const {
    id,
    title,
    status,
    startAt,
    endAt,
    problemCount,
    participating,
    visibility,
  } = contest;

  const formatDateRange = () => {
    if (!startAt || !endAt) return "";
    try {
      const startStr = format(new Date(startAt), "MMM d, yyyy · h:mm a");
      const endStr = format(new Date(endAt), "MMM d, yyyy · h:mm a");
      return `${startStr} → ${endStr}`;
    } catch (e) {
      return "";
    }
  };

  return (
    <div
      onClick={() => navigate(`/contests/${id}`)}
      className="card"
      style={{
        cursor: "pointer",
        transition: "border-color 0.2s, transform 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: 0 }}>
          {title}
        </h3>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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
          <ContestStatusBadge status={status} />
        </div>
      </div>

      <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 16 }}>
        {formatDateRange()}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "var(--text2)" }}>
          <span>
            {problemCount} problem{problemCount !== 1 ? "s" : ""}
          </span>

          {participating && (
            <span style={{ color: "var(--accent)", fontWeight: 500 }}>
              ✓ Registered
            </span>
          )}
        </div>

        {status === "UPCOMING" && startAt && (
          <ContestCountdown target={startAt} label="Starts in" />
        )}

        {status === "ONGOING" && endAt && (
          <ContestCountdown target={endAt} label="Ends in" />
        )}
      </div>
    </div>
  );
}