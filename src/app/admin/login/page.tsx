"use client";

import { useState } from "react";

/**
 * Admin login: server-side only. POST to /api/auth/admin/login with credentials.
 * Server sets httpOnly cookie and returns ok; then redirect to dashboard.
 * No client-side Supabase auth; admin verified via service role + public.users.
 */
export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data?.message || "Login failed");
      setLoading(false);
      return;
    }
    if (!data?.ok) {
      setError(data?.message || "Login failed");
      setLoading(false);
      return;
    }

    setLoading(false);
    window.location.href = "/admin/dashboard";
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        background: "#0f172a",
      }}
    >
      <div
        style={{
          background: "#020617",
          padding: "40px",
          borderRadius: "10px",
          width: "350px",
          color: "white",
        }}
      >
        <h2 style={{ marginBottom: "20px", fontSize: "1.5rem" }}>
          Admin Login
        </h2>

        <form onSubmit={login}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "10px",
              marginBottom: "10px",
              boxSizing: "border-box",
              borderRadius: "5px",
              border: "1px solid #334155",
              background: "#0f172a",
              color: "white",
            }}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "10px",
              marginBottom: "10px",
              boxSizing: "border-box",
              borderRadius: "5px",
              border: "1px solid #334155",
              background: "#0f172a",
              color: "white",
            }}
          />

          {error ? (
            <p style={{ color: "#f87171", fontSize: "14px", marginBottom: "12px" }}>
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              background: loading ? "#1e40af" : "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.8 : 1,
            }}
          >
            {loading ? "Signing in…" : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
