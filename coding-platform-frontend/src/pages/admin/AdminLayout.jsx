export function AdminLayout({ children, navigate, path }) {
  const links = [
    { to: "/admin", label: "Dashboard", icon: "▦" },
    { to: "/admin/problems", label: "Problems", icon: "≡" },
    { to: "/admin/problems/new", label: "Add Problem", icon: "+" },
    { to: "/admin/generate", label: "AI Generator", icon: "✦" },
  ];

  return (
    <div className="layout">
      <div className="sidebar">
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 14px 12px" }}>
          Admin Panel
        </div>
        {links.map((l) => (
          <button
            key={l.to}
            className={`sidebar-link ${path === l.to ? "active" : ""}`}
            onClick={() => navigate(l.to)}
          >
            <span className="icon">{l.icon}</span>
            {l.label}
          </button>
        ))}
      </div>
      <div className="main">
        <div className="content">{children}</div>
      </div>
    </div>
  );
}