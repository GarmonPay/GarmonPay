"use client";

import { useState } from "react";
import Link from "next/link";
import { Cinzel_Decorative } from "next/font/google";
import { createBrowserClient } from "@/lib/supabase";
import { getResetPasswordUrl } from "@/lib/site-url";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Email is required");
      return;
    }
    const supabase = createBrowserClient();
    if (!supabase) {
      setError("Auth not configured. Please try again later.");
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: getResetPasswordUrl(),
      });
      if (err) {
        setError(err.message || "Failed to send reset email");
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
        <p className="mt-2 text-center text-sm font-medium text-violet-200/90">Reset your password</p>
        <p className="mt-1 text-center text-xs text-violet-400/70">
          We&apos;ll email you a secure link if an account exists.
        </p>

        {sent ? (
          <p className="mt-8 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-200/95">
            If an account exists for that email, we sent a secure reset link. It expires in 15 minutes. Check your inbox
            and spam folder.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="reset-email" className="block text-xs font-medium uppercase tracking-wider text-violet-300/90">
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-violet-400/50 outline-none transition focus:border-[#eab308]/60 focus:ring-1 focus:ring-[#eab308]/30"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-press w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 py-3.5 font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>

            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-sm text-red-300" role="alert">
                {error}
              </p>
            )}
          </form>
        )}

        <p className="mt-8 text-center text-sm text-violet-300/90">
          <Link href="/login" className="font-medium text-[#fde047] underline underline-offset-2 hover:text-[#eab308]">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
