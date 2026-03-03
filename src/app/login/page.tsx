"use client";

import { useState } from "react";
import { getDashboardUrl } from "@/lib/site-url";
import { login as authLogin } from "@/core/auth";
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
      const result = await authLogin(trimmedEmail, password);
      if (!result.ok) {
        setError(result.message);
        return;
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

          {error && <p className="text-red-500 mt-3 text-sm">{error}</p>}
        </form>

        <p className="mt-4 text-center text-gray-400 text-sm">
          Don&apos;t have an account? <Link href="/register" className="text-blue-400 hover:underline">Register</Link>
        </p>
      </div>
    </div>
  );
}
