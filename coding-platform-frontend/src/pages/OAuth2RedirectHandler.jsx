import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useRoute } from "../hooks/useRoute";

export function OAuth2RedirectHandler({ navigate }) {
  const { login } = useAuth();
  const { query } = useRoute();

  useEffect(() => {
    const { token, userId, username, email, role } = query;
    if (token) {
      login(
        { userId, username, email, role },
        token
      );
      navigate("/problems");
    } else {
      navigate("/login");
    }
  }, [query, login, navigate]);

  return (
    <div
      className="page"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "calc(100vh - 56px)",
      }}
    >
      <span className="spinner" style={{ width: 40, height: 40, marginBottom: 16 }} />
      <div style={{ color: "var(--text2)", fontSize: 15 }}>
        Authenticating, please wait...
      </div>
    </div>
  );
}
