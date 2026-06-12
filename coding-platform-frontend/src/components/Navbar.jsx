import { useAuth } from "../contexts/AuthContext";

export function Navbar({ navigate, path }) {
  const { user, logout, isAdmin } = useAuth();
  const isActive = (p) => (path === p ? "nav-link active" : "nav-link");

  return (
    <nav className="nav">
      <div
        className="nav-brand"
        onClick={() => navigate("/")}
        style={{ cursor: "pointer" }}
      >
        ⌥ <span>Hire</span>Sure
      </div>
      <div className="nav-links">
        <span
          className={isActive("/problems")}
          onClick={() => navigate("/problems")}
        >
          Problems
        </span>
        <span
          className={isActive("/contests")}
          onClick={() => navigate("/contests")}
        >
          Contests
        </span>
        <span
          className={isActive("/jobs")}
          onClick={() => navigate("/jobs")}
        >
          Jobs
        </span>
        {user && (
          <span
            className={isActive("/submissions")}
            onClick={() => navigate("/submissions")}
          >
            Submissions
          </span>
        )}
        {isAdmin && (
          <span
            className={isActive("/admin")}
            onClick={() => navigate("/admin")}
            style={{ color: "var(--amber)" }}
          >
            Admin
          </span>
        )}
        {user ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginLeft: 8,
            }}
          >
            <span
              className="nav-link"
              onClick={() => navigate("/profile")}
              style={{ color: "var(--accent)" }}
            >
              {user.username}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              Logout
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate("/login")}
            >
              Login
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate("/register")}
            >
              Register
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
