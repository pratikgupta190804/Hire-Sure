import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useApi } from "../hooks/useApi";

export function AuthPage({ navigate, mode }) {
  const { login } = useAuth();
  const api = useApi();
  const [form, setForm] = useState({ email: "", password: "", username: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const data = await api(endpoint, { method: "POST", body: form });
      login(
        { userId: data.userId, username: data.username, email: data.email, role: data.role },
        data.token
      );
      navigate("/problems");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="page"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 56px)" }}
    >
      <div style={{ width: 400, padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
            {mode === "login" ? "Welcome back" : "Join the platform"}
          </div>
          <div style={{ color: "var(--text3)", fontSize: 13 }}>
            {mode === "login" ? "Sign in to your account" : "Create your free account"}
          </div>
        </div>
        <div className="card">
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {mode === "register" && (
              <div className="form-group">
                <label className="label">Username</label>
                <input
                  className="input"
                  placeholder="codewizard42"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                />
              </div>
            )}
            <div className="form-group">
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            {error && (
              <div style={{ color: "var(--red)", fontSize: 12, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: "var(--radius)" }}>
                {error}
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? (
                <span className="spinner" style={{ width: 14, height: 14 }} />
              ) : mode === "login" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </button>
          </form>
          <div className="divider" />
          <div style={{ textAlign: "center", fontSize: 13, color: "var(--text3)" }}>
            {mode === "login" ? "No account? " : "Already have one? "}
            <span
              style={{ color: "var(--accent)", cursor: "pointer" }}
              onClick={() => navigate(mode === "login" ? "/register" : "/login")}
            >
              {mode === "login" ? "Register" : "Sign in"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}