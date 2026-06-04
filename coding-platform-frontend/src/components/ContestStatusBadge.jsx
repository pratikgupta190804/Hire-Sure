const CONFIG = {
  UPCOMING: { label: "Upcoming", style: { background: "rgba(59, 130, 246, 0.1)", color: "var(--blue)" } },
  ONGOING:  { label: "Live",     style: { background: "rgba(0, 229, 160, 0.1)", color: "var(--accent)" } },
  FINISHED: { label: "Finished", style: { background: "rgba(136, 146, 164, 0.1)", color: "var(--text2)" } },
};

export default function ContestStatusBadge({ status }) {
  const { label, style } = CONFIG[status] ?? CONFIG.FINISHED;
  return (
    <span className="badge" style={{ ...style, fontSize: 10 }}>
      {label}
    </span>
  );
}