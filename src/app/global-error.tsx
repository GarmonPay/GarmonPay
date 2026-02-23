"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ background: "#0a0e17", color: "#f9fafb", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <main style={{ padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Something went wrong</h1>
          <p style={{ color: "#9ca3af", marginBottom: "1.5rem" }}>{error.message}</p>
          <button
            type="button"
            onClick={reset}
            style={{ padding: "0.5rem 1rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "0.5rem", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
