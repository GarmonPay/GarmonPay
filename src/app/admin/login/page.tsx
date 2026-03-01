"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase";

/** Set session cookie so middleware allows access to /admin. */
function setSessionCookie(accessToken: string) {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24; // 24 hours
  const secure = window.location?.protocol === "https:";
  let cookie = `sb-access-token=${encodeURIComponent(accessToken)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  if (secure) cookie += "; Secure";
  document.cookie = cookie;
}

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login(e?: React.FormEvent) {
    e?.preventDefault();
    const supabase = createBrowserClient();
    if (!supabase) {
      setError("Admin login is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    setLoading(true);
    setError("");
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const token = data.session?.access_token;
    if (!token) {
      setError("Invalid response from sign in.");
      setLoading(false);
      return;
    }

    // Use server-side admin check (bypasses RLS) so login works when client cannot read public.users
    const meRes = await fetch("/api/auth/admin/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meData = await meRes.json();

    if (!meRes.ok || !meData?.ok) {
      await supabase.auth.signOut();
      if (meRes.status === 403) {
        setError("Not an admin. Your account needs role=admin or is_super_admin=true in public.users. Run the SQL in Supabase: UPDATE public.users SET role = 'admin' WHERE email = 'admin123@garmonpay.com';");
      } else if (meRes.status === 401) {
        setError("Session invalid. Try logging in again.");
      } else if (meRes.status === 503) {
        setError("Server configuration error. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in Vercel.");
      } else {
        setError(meData?.message || "Could not verify admin access. Try again.");
      }
      setLoading(false);
      return;
    }

    setSessionCookie(token);
    localStorage.setItem("admin", "true");

    setLoading(false);
    // Full page redirect so middleware sees the cookie and dashboard loads with session
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
          {loading ? "Signing in..." : "Login"}
        </button>
        </form>
      </div>
    </div>
  );
}
