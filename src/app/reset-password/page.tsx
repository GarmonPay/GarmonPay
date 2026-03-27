"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cinzel_Decorative } from "next/font/google";
import { createBrowserClient } from "@/lib/supabase";
import { getLoginUrl } from "@/lib/site-url";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-1 flex-col items-center justify-center px-4 py-12 text-white">
      <div className="w-full max-w-md rounded-2xl border border-[#eab308]/35 bg-[#12081f]/95 p-8 shadow-[0_0_50px_-12px_rgba(139,92,246,0.45)]">
        <h1
          className={`${cinzel.className} text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-[#fde047] via-[#eab308] to-[#a16207] bg-clip-text text-transparent md:text-3xl`}
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
  const [validSession, setValidSession] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient();
    if (!supabase) {
      setValidSession(false);
      return;
    }
    function check() {
      supabase!.auth.getSession().then(({ data }) => {
        const session = data?.session ?? null;
        if (session?.user) {
          setValidSession(true);
          return;
        }
        supabase!.auth.getUser().then(({ data: userData }) => setValidSession(!!userData?.user));
      });
    }
    check();
    const t1 = setTimeout(check, 500);
    const t2 = setTimeout(check, 1500);
    const { data: authChangeData } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") check();
    });
    const subscription = authChangeData?.subscription;
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      subscription?.unsubscribe?.();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    const supabase = createBrowserClient();
    if (!supabase) {
      setError("Auth not configured");
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError(err.message || "Failed to update password");
        return;
      }
      await supabase.auth.signOut();
      router.push(getLoginUrl());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (validSession === null) {
    return (
      <AuthCard>
        <p className="mt-4 text-center text-sm text-violet-300/90">Checking reset link…</p>
      </AuthCard>
    );
  }

  if (!validSession) {
    return (
      <AuthCard>
        <p className="mt-4 text-center text-sm font-medium text-violet-200/90">Invalid or expired link</p>
        <p className="mt-2 text-center text-xs text-violet-400/75">
          This password reset link is invalid or has expired. Request a new one from the login page.
        </p>
        <div className="mt-8 flex flex-col gap-3 text-center text-sm">
          <Link
            href="/forgot-password"
            className="font-medium text-[#fde047] underline underline-offset-2 hover:text-[#eab308]"
          >
            Request new link
          </Link>
          <Link href="/login" className="text-violet-300/90 hover:text-violet-200">
            Back to login
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <p className="mt-4 text-center text-sm font-medium text-violet-200/90">Set a new password</p>
      <p className="mt-1 text-center text-xs text-violet-400/70">Choose a strong password you haven&apos;t used elsewhere.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="new-pw" className="block text-xs font-medium uppercase tracking-wider text-violet-300/90">
            New password
          </label>
          <input
            id="new-pw"
            type="password"
            autoComplete="new-password"
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-violet-400/50 outline-none transition focus:border-[#eab308]/60 focus:ring-1 focus:ring-[#eab308]/30"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            minLength={8}
          />
        </div>
        <div>
          <label htmlFor="confirm-pw" className="block text-xs font-medium uppercase tracking-wider text-violet-300/90">
            Confirm password
          </label>
          <input
            id="confirm-pw"
            type="password"
            autoComplete="new-password"
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-violet-400/50 outline-none transition focus:border-[#eab308]/60 focus:ring-1 focus:ring-[#eab308]/30"
            placeholder="Repeat password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={loading}
            minLength={8}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-press w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 py-3.5 font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Updating…" : "Update password"}
        </button>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
      </form>

      <p className="mt-8 text-center text-sm text-violet-300/90">
        <Link href="/login" className="font-medium text-[#fde047] underline underline-offset-2 hover:text-[#eab308]">
          Back to login
        </Link>
      </p>
    </AuthCard>
  );
}
