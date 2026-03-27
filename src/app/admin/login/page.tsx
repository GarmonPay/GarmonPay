"use client";

import { useState } from "react";
import Link from "next/link";
import { Cinzel_Decorative } from "next/font/google";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

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
    <div className="flex min-h-screen items-center justify-center bg-[#0a0e17] px-4 py-12 text-white">
      <div className="w-full max-w-md rounded-2xl border border-[#eab308]/35 bg-[#12081f]/95 p-8 shadow-[0_0_50px_-12px_rgba(139,92,246,0.45)]">
        <h1
          className={`${cinzel.className} text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-[#fde047] via-[#eab308] to-[#a16207] bg-clip-text text-transparent md:text-3xl`}
        >
          GarmonPay
        </h1>
        <p className="mt-2 text-center text-sm font-medium text-violet-200/90">Admin login</p>
        <p className="mt-1 text-center text-xs text-violet-400/70">Staff dashboard access</p>

        <form onSubmit={login} className="mt-8 space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-xs font-medium uppercase tracking-wider text-violet-300/90">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              required
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-violet-400/50 outline-none transition focus:border-[#eab308]/60 focus:ring-1 focus:ring-[#eab308]/30"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-xs font-medium uppercase tracking-wider text-violet-300/90">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-violet-400/50 outline-none transition focus:border-[#eab308]/60 focus:ring-1 focus:ring-[#eab308]/30"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="btn-press w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 py-3.5 font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-violet-300/90">
          <Link href="/" className="font-medium text-[#fde047] underline underline-offset-2 hover:text-[#eab308]">
            Back to site
          </Link>
        </p>
      </div>
    </div>
  );
}
