"use client";

import { useState } from "react";
import { getDashboardUrl } from "@/lib/site-url";
import { login as authLogin } from "@/core/auth";
import { createBrowserClient } from "@/core/supabase";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Email is required");
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }
    setLoading(true);
    try {
      const lockRes = await fetch("/api/auth/check-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const lockData = await lockRes.json().catch(() => ({}));
      if (lockData.locked) {
        const until = lockData.lockedUntil ? new Date(lockData.lockedUntil).toLocaleTimeString() : "";
        setError(until ? `Account temporarily locked. Try again after ${until}.` : "Account temporarily locked. Try again later.");
        setLoading(false);
        return;
      }
      const result = await authLogin(trimmedEmail, password);
      if (!result.ok) {
        try {
          await fetch("/api/auth/login-failed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: trimmedEmail }),
          });
        } catch {
          // ignore
        }
        setError(result.message);
        setLoading(false);
        return;
      }
      const supabase = createBrowserClient();
      if (supabase) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.nextLevel === "aal2") {
          window.location.href = "/login/verify-2fa";
          return;
        }
      }
      try {
        const session = await import("@/lib/session").then((m) => m.getSessionAsync());
        if (session?.accessToken) {
          await fetch("/api/auth/login-success", {
            method: "POST",
            headers: { Authorization: `Bearer ${session.accessToken}` },
          });
        }
      } catch {
        // best-effort
      }
      if (result.isAdmin) {
        window.location.href = "/admin";
      } else {
        window.location.href = getDashboardUrl();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="bg-gray-900 p-8 rounded w-96">
        <h1 className="text-2xl mb-4">Member Login</h1>

        <form onSubmit={login}>
          <input
            type="email"
            autoComplete="email"
            className="w-full p-2 mb-3 text-black rounded"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />

          <input
            type="password"
            autoComplete="current-password"
            className="w-full p-2 mb-3 text-black rounded"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed text-white font-semibold w-full py-3 rounded-lg transition"
          >
            {loading ? "Logging in…" : "Login"}
          </button>

          <p className="mt-2 text-right">
            <Link href="/forgot-password" className="text-sm text-blue-400 hover:underline">Forgot password?</Link>
          </p>

          {error && <p className="text-red-500 mt-3 text-sm">{error}</p>}
        </form>

        <p className="mt-4 text-center text-gray-400 text-sm">
          Don&apos;t have an account? <Link href="/register" className="text-blue-400 hover:underline">Register</Link>
        </p>
      </div>
    </div>
  );
}
