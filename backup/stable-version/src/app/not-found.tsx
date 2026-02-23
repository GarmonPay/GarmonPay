export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem", background: "#0a0e17" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", marginBottom: "0.5rem" }}>Page not found</h1>
      <p style={{ color: "#9ca3af", marginBottom: "1.5rem" }}>The page you’re looking for doesn’t exist.</p>
      <a href="/" style={{ padding: "0.75rem 1.5rem", borderRadius: "0.5rem", background: "#2563eb", color: "#fff", fontWeight: 500, textDecoration: "none" }}>
        Back to home
      </a>
    </main>
  );
}
