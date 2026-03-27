"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cinzel_Decorative } from "next/font/google";
import { createBrowserClient } from "@/core/supabase";
import { getDashboardUrl } from "@/lib/site-url";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export default function Verify2FAPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient();
    if (!supabase) {
      router.replace("/login");
      return;
    }
    supabase.auth.mfa.listFactors().then(({ data, error: err }) => {
      if (err || !data?.totp?.length) {
        router.replace("/login");
        return;
      }
      const totp = data.totp.find((f) => (f as { status?: string }).status === "verified");
      if (!totp) {
        router.replace("/login");
        return;
      }
      setFactorId((totp as { id: string }).id);
      setReady(true);
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || !code.trim()) return;
    setError("");
    setLoading(true);
    const supabase = createBrowserClient();
    if (!supabase) {
      setError("Auth not configured");
      setLoading(false);
      return;
    }
    try {
      const { data, error: err } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });
      if (err) {
        setError(err.message || "Invalid code. Try again.");
        setLoading(false);
        return;
      }
      const token = data?.access_token;
      if (token) {
        try {
          await fetch("/api/auth/login-success", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {
          // best-effort
        }
        window.location.href = getDashboardUrl();
      } else {
        setError("Verification failed. Try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex flex-1 flex-col items-center justify-center px-4 py-12 text-white">
        <div className="w-full max-w-md rounded-2xl border border-[#eab308]/35 bg-[#12081f]/95 p-8 shadow-[0_0_50px_-12px_rgba(139,92,246,0.45)]">
          <p className="text-center text-violet-300/90">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-1 flex-col items-center justify-center px-4 py-12 text-white">
      <div className="w-full max-w-md rounded-2xl border border-[#eab308]/35 bg-[#12081f]/95 p-8 shadow-[0_0_50px_-12px_rgba(139,92,246,0.45)]">
        <h1
          className={`${cinzel.className} text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-[#fde047] via-[#eab308] to-[#a16207] bg-clip-text text-transparent md:text-3xl`}
        >
          GarmonPay
        </h1>
        <p className="mt-2 text-center text-sm font-medium text-violet-200/90">Two-factor authentication</p>
        <p className="mt-1 text-center text-xs text-violet-400/70">
          Enter the 6-digit code from your authenticator app.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="mfa-code" className="block text-xs font-medium uppercase tracking-wider text-violet-300/90">
              Authenticator code
            </label>
            <input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-center text-lg tracking-[0.35em] text-white placeholder:text-violet-400/50 outline-none transition focus:border-[#eab308]/60 focus:ring-1 focus:ring-[#eab308]/30"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="btn-press w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 py-3.5 font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Verifying…" : "Verify and continue"}
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
      </div>
    </div>
  );
}
