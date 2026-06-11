import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useApi } from "../hooks/useApi";
import { API } from "../utils/constants";

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

          <div style={{ display: "flex", alignItems: "center", margin: "20px 0", color: "var(--text3)", fontSize: 11 }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ padding: "0 10px", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 10, fontWeight: 600 }}>or continue with</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              className="btn btn-ghost"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => window.location.href = `${API}/oauth2/authorization/google`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              Google
            </button>
            <button
              className="btn btn-ghost"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => window.location.href = `${API}/oauth2/authorization/github`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.479C19.138 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              GitHub
            </button>
          </div>

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