"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Cinzel_Decorative } from "next/font/google";
import { getDashboardUrl } from "@/lib/site-url";
import { login as authLogin } from "@/core/auth";
import { createBrowserClient } from "@/core/supabase";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

function LoginForm() {
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
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
      const safeNext =
        nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : null;
      if (result.isAdmin) {
        window.location.href = "/admin";
      } else {
        window.location.href = safeNext ?? getDashboardUrl();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-1 flex-col items-center justify-center px-4 py-12 text-white">
      <div className="w-full max-w-md rounded-2xl border border-[#eab308]/35 bg-[#12081f]/95 p-8 shadow-[0_0_50px_-12px_rgba(139,92,246,0.45)]">
        <h1
          className={`${cinzel.className} text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-[#fde047] via-[#eab308] to-[#a16207] bg-clip-text text-transparent md:text-3xl`}
        >
          GarmonPay
        </h1>
        <p className="mt-2 text-center text-sm font-medium text-violet-200/90">Member login</p>
        <p className="mt-1 text-center text-xs text-violet-400/70">Sign in to your dashboard</p>

        <form onSubmit={login} className="mt-8 space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-medium uppercase tracking-wider text-violet-300/90">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-violet-400/50 outline-none transition focus:border-[#eab308]/60 focus:ring-1 focus:ring-[#eab308]/30"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-medium uppercase tracking-wider text-violet-300/90">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-violet-400/50 outline-none transition focus:border-[#eab308]/60 focus:ring-1 focus:ring-[#eab308]/30"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="flex justify-end pt-0.5">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-[#fde047]/90 underline-offset-2 hover:text-[#eab308] hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-press mt-2 w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 py-3.5 font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-sm text-red-300" role="alert">
              {error}
            </p>
          )}
        </form>

        <p className="mt-8 text-center text-sm text-violet-300/90">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-[#fde047] underline underline-offset-2 hover:text-[#eab308]"
          >
            Create one free
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-8rem)] flex flex-1 items-center justify-center px-4 py-12 text-violet-300/80">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
