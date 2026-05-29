import { useEffect } from "react";

export function Toast({ msg, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const icons = { success: "✓", error: "✕" };

  return (
    <div className={`toast toast-${type}`}>
      <span style={{ color: type === "success" ? "var(--accent)" : "var(--red)", fontWeight: 700 }}>
        {icons[type]}
      </span>
      <span>{msg}</span>
      <button
        onClick={onClose}
        style={{ background: "none", border: "none", color: "var(--text3)", marginLeft: "auto", fontSize: 16 }}
      >
        ×
      </button>
    </div>
  );
}