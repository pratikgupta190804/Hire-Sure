export function LandingPage({ navigate }) {
  return (
    <div
      className="page"
      style={{ minHeight: "calc(100vh - 56px)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div style={{ textAlign: "center", maxWidth: 640, padding: "0 24px" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 20 }}>
          AI-Powered Coding & Career Platform
        </div>
        <h1 style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.1, marginBottom: 20 }}>
          Code. Learn.<br />
          <span style={{ color: "var(--accent)" }} className="glow">Get Hired.</span>
        </h1>
        <p style={{ fontSize: 16, color: "var(--text2)", lineHeight: 1.8, marginBottom: 36 }}>
          Practice DSA problems, get AI-generated questions tailored to top companies,
          and track your progress with detailed analytics.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-lg" onClick={() => navigate("/problems")}>
            Start Practicing →
          </button>
          <button className="btn btn-ghost btn-lg" onClick={() => navigate("/register")}>
            Create Account
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 60 }}>
          {[
            { icon: "⚡", title: "Real-time Execution", desc: "Run code in 10+ languages instantly" },
            { icon: "🤖", title: "AI-Generated Problems", desc: "Fresh questions daily using Gemini" },
            { icon: "📊", title: "Progress Tracking", desc: "Detailed submission analytics" },
          ].map((f) => (
            <div key={f.title} className="card" style={{ textAlign: "left" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: "var(--text3)" }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}