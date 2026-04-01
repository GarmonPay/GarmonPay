"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cinzel_Decorative } from "next/font/google";
import { createBrowserClient } from "@/lib/supabase";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

type Strength = "empty" | "weak" | "medium" | "strong";

function getStrength(pw: string): Strength {
  if (!pw) return "empty";
  if (pw.length < 8) return "weak";
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasNum = /[0-9]/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  const score = [hasUpper, hasLower, hasNum, hasSpecial].filter(Boolean).length;
  if (pw.length >= 12 && score >= 3) return "strong";
  if (pw.length >= 8 && score >= 2) return "medium";
  return "weak";
}

const STRENGTH_CONFIG: Record<Strength, { label: string; color: string; width: string }> = {
  empty:  { label: "",       color: "transparent",  width: "0%" },
  weak:   { label: "Weak",   color: "#ef4444",       width: "33%" },
  medium: { label: "Medium", color: "#eab308",       width: "66%" },
  strong: { label: "Strong", color: "#22c55e",       width: "100%" },
};

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "#0e0118", color: "#fff" }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#12081f]/95 p-8 shadow-[0_0_50px_-12px_rgba(139,92,246,0.45)]"
        style={{ border: "1px solid rgba(245,200,66,0.35)" }}
      >
        <h1
          className={`${cinzel.className} text-center text-2xl font-bold tracking-tight md:text-3xl`}
          style={{ background: "linear-gradient(90deg,#fde047,#eab308,#a16207)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
        >
          GarmonPay
        </h1>
        {children}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validSession, setValidSession] = useState<boolean | null>(null);
  const router = useRouter();
  const strength = getStrength(password);
  const cfg = STRENGTH_CONFIG[strength];

  useEffect(() => {
    const supabase = createBrowserClient();
    if (!supabase) { setValidSession(false); return; }

    function check() {
      supabase!.auth.getSession().then(({ data }) => {
        if (data?.session?.user) { setValidSession(true); return; }
        supabase!.auth.getUser().then(({ data: ud }) => setValidSession(!!ud?.user));
      });
    }
    check();
    const t1 = setTimeout(check, 500);
    const t2 = setTimeout(check, 1500);
    const { data: authData } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") check();
    });
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      authData.subscription.unsubscribe();
    };
  }, []);

  // After success, redirect to dashboard after 2 seconds
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => router.push("/dashboard"), 2000);
    return () => clearTimeout(t);
  }, [success, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    const supabase = createBrowserClient();
    if (!supabase) { setError("Auth not configured."); return; }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError("Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (validSession === null) {
    return (
      <AuthCard>
        <p className="mt-4 text-center text-sm" style={{ color: "rgba(196,181,253,0.9)" }}>
          Checking reset link…
        </p>
      </AuthCard>
    );
  }

  if (!validSession) {
    return (
      <AuthCard>
        <p className="mt-4 text-center text-sm font-medium text-white/90">Invalid or expired link</p>
        <p className="mt-2 text-center text-xs" style={{ color: "rgba(167,139,250,0.75)" }}>
          This password reset link is invalid or has expired. Request a new one below.
        </p>
        <div className="mt-8 flex flex-col gap-3 text-center text-sm">
          <Link
            href="/forgot-password"
            className="font-medium underline underline-offset-2"
            style={{ color: "#F5C842" }}
          >
            Request new link
          </Link>
          <Link href="/login" style={{ color: "rgba(196,181,253,0.9)" }}>
            Back to login
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (success) {
    return (
      <AuthCard>
        <div className="mt-8 text-center">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: "rgba(34,197,94,0.12)", border: "2px solid rgba(34,197,94,0.3)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" style={{ color: "#22c55e" }}>
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-white">Password updated!</h2>
          <p className="mt-2 text-sm" style={{ color: "rgba(196,181,253,0.85)" }}>
            Redirecting you to your dashboard…
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <p className="mt-2 text-center text-sm font-medium" style={{ color: "rgba(221,214,254,0.9)" }}>
        Create new password
      </p>
      <p className="mt-1 text-center text-xs" style={{ color: "rgba(167,139,250,0.7)" }}>
        Choose a strong password you haven&apos;t used elsewhere.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label
            htmlFor="new-pw"
            className="block text-xs font-medium uppercase tracking-wider"
            style={{ color: "rgba(196,181,253,0.9)" }}
          >
            New password
          </label>
          <input
            id="new-pw"
            type="password"
            autoComplete="new-password"
            className="mt-1.5 w-full rounded-xl px-4 py-3 text-white placeholder:text-violet-400/50 outline-none transition"
            style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            minLength={8}
            onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(245,200,66,0.6)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
          />

          {/* Password strength bar */}
          {password.length > 0 && (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: cfg.width, background: cfg.color }}
                />
              </div>
              <p className="mt-1 text-right text-xs font-medium" style={{ color: cfg.color }}>
                {cfg.label}
              </p>
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="confirm-pw"
            className="block text-xs font-medium uppercase tracking-wider"
            style={{ color: "rgba(196,181,253,0.9)" }}
          >
            Confirm password
          </label>
          <input
            id="confirm-pw"
            type="password"
            autoComplete="new-password"
            className="mt-1.5 w-full rounded-xl px-4 py-3 text-white placeholder:text-violet-400/50 outline-none transition"
            style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
            placeholder="Repeat password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={loading}
            minLength={8}
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
              Updating…
            </>
          ) : (
            "Update Password"
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

      <p className="mt-8 text-center text-sm" style={{ color: "rgba(196,181,253,0.9)" }}>
        <Link href="/login" className="font-medium underline underline-offset-2" style={{ color: "#F5C842" }}>
          Back to login
        </Link>
      </p>
    </AuthCard>
  );
}
