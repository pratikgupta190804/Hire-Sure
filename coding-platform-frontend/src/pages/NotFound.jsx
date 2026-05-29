export function NotFound({ navigate }) {
  return (
    <div className="page empty-state" style={{ paddingTop: 80 }}>
      <div className="icon">404</div>
      <p style={{ fontSize: 20, fontWeight: 600 }}>Page not found</p>
      <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate("/")}>
        Go home
      </button>
    </div>
  );
}