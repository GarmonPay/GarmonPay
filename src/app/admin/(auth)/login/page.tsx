"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setAdminSession } from "@/lib/admin-session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? "Admin login failed");
      }
      setAdminSession({
        adminId: data.user.id,
        email: data.user.email,
        expiresAt: data.expiresAt,
        isSuperAdmin: !!(data as { is_super_admin?: boolean }).is_super_admin,
      });
      router.replace("/admin/dashboard");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Admin login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0a0e17", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ width: "100%", maxWidth: "28rem", background: "#111827", borderRadius: "0.75rem", border: "1px solid rgba(255,255,255,0.1)", padding: "2rem", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", marginBottom: "0.25rem" }}>Admin</h1>
        <p style={{ fontSize: "0.875rem", color: "#9ca3af", marginBottom: "1.5rem" }}>Sign in with an admin account</p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {error && (
            <div style={{ padding: "0.75rem", borderRadius: "0.5rem", background: "rgba(239,68,68,0.2)", color: "#f87171", fontSize: "0.875rem" }}>{error}</div>
          )}
          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "#9ca3af", marginBottom: "0.25rem" }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@example.com"
              style={{ width: "100%", padding: "0.5rem 1rem", borderRadius: "0.5rem", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "#9ca3af", marginBottom: "0.25rem" }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: "100%", padding: "0.5rem 1rem", borderRadius: "0.5rem", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: "0.5rem", background: "#2563eb", color: "#fff", fontWeight: 500, border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.875rem", color: "#9ca3af" }}>
          <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>Back to site</Link>
        </p>
      </div>
    </main>
  );
}
