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
        // Always show success (don't leak whether account exists)
        setSent(true);
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "#0e0118", color: "#fff" }}
    >
      <div className="w-full max-w-md rounded-2xl border bg-[#12081f]/95 p-8 shadow-[0_0_50px_-12px_rgba(139,92,246,0.45)]"
        style={{ borderColor: "rgba(245,200,66,0.35)" }}>

        <h1
          className={`${cinzel.className} text-center text-2xl font-bold tracking-tight md:text-3xl`}
          style={{ background: "linear-gradient(90deg,#fde047,#eab308,#a16207)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
        >
          GarmonPay
        </h1>

        {sent ? (
          <div className="mt-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: "rgba(34,197,94,0.12)", border: "2px solid rgba(34,197,94,0.3)" }}>
              <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" style={{ color: "#22c55e" }}>
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-white">Check your email</h2>
            <p className="mt-2 text-sm" style={{ color: "rgba(196,181,253,0.85)" }}>
              We sent a password reset link to{" "}
              <span className="font-medium text-white">{email}</span>
            </p>
            <p className="mt-2 text-xs" style={{ color: "rgba(167,139,250,0.7)" }}>
              Link expires in 1 hour. Check your spam folder if you don&apos;t see it.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-center text-sm font-medium" style={{ color: "rgba(221,214,254,0.9)" }}>
              Reset your password
            </p>
            <p className="mt-1 text-center text-xs" style={{ color: "rgba(167,139,250,0.7)" }}>
              Enter your email and we&apos;ll send you a reset link
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label
                  htmlFor="reset-email"
                  className="block text-xs font-medium uppercase tracking-wider"
                  style={{ color: "rgba(196,181,253,0.9)" }}
                >
                  Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  className="mt-1.5 w-full rounded-xl px-4 py-3 text-white placeholder:text-violet-400/50 outline-none transition"
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(245,200,66,0.6)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl py-3.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(90deg,#eab308,#d97706)", color: "#0c0618" }}
              >
                {loading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Sending…
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </button>

              {error && (
                <p
                  className="rounded-lg px-3 py-2 text-center text-sm"
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}
                  role="alert"
                >
                  {error}
                </p>
              )}
            </form>
          </>
        )}

        <p className="mt-8 text-center text-sm" style={{ color: "rgba(196,181,253,0.9)" }}>
          Remember your password?{" "}
          <Link
            href="/login"
            className="font-medium underline underline-offset-2"
            style={{ color: "#F5C842" }}
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
