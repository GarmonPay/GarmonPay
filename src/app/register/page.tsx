"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Cinzel_Decorative } from "next/font/google";
import { createBrowserClient } from "@/lib/supabase";
import { getRegisterUrl } from "@/lib/site-url";
import { TurnstileWidget } from "@/components/TurnstileWidget";

const REF_STORAGE_KEY = "garmonpay_ref";
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export default function RegisterPage() {
  const supabase = createBrowserClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref")?.trim();
    if (ref) {
      setReferralCode(ref);
      try {
        localStorage.setItem(REF_STORAGE_KEY, ref);
        document.cookie = `garmonpay_ref=${encodeURIComponent(ref)}; path=/; max-age=${14 * 24 * 60 * 60}; SameSite=Lax`;
      } catch {
        // ignore
      }
    } else {
      try {
        const fromCookie = document.cookie.match(/garmonpay_ref=([^;]+)/)?.[1];
        if (fromCookie) setReferralCode(decodeURIComponent(fromCookie).trim());
        else {
          const fromLs = localStorage.getItem(REF_STORAGE_KEY)?.trim();
          if (fromLs) setReferralCode(fromLs);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  function getStoredReferralCode(): string {
    const trimmed = referralCode.trim();
    if (trimmed) return trimmed;
    if (typeof document !== "undefined") {
      const match = document.cookie.match(/garmonpay_ref=([^;]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]).trim();
    }
    if (typeof localStorage !== "undefined") {
      return (localStorage.getItem(REF_STORAGE_KEY) ?? "").trim();
    }
    return "";
  }

  const onTurnstileVerify = useCallback((token: string) => setTurnstileToken(token), []);

  async function register() {
    setError("");
    setMessage("");
    if (!supabase) {
      setError("Registration not configured.");
      return;
    }
    const trimmedEmail = email.trim();
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError("Full name is required.");
      return;
    }
    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Please complete the security check.");
      return;
    }
    setLoading(true);
    const checkRes = await fetch("/api/auth/check-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmedEmail, turnstileToken: turnstileToken || undefined }),
    });
    const checkData = await checkRes.json().catch(() => ({}));
    if (!checkRes.ok || !checkData.allowed) {
      setError(checkData.message || "Signup check failed. Try again.");
      setLoading(false);
      return;
    }
    const refCode = getStoredReferralCode();
    const { data, error: err } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        emailRedirectTo: getRegisterUrl(),
        data: {
          full_name: trimmedName,
          ...(refCode ? { referred_by_code: refCode } : {}),
        },
      },
    });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    if (data?.user) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (data.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }
      const res = await fetch("/api/auth/sync-user", {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: data.user.id,
          email: data.user.email ?? trimmedEmail,
          referralCode: refCode || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setError(json.message || "Account created but could not sync to database. Please contact support.");
        setLoading(false);
        return;
      }
    }
    setMessage("Check your email to confirm your account, or sign in if already confirmed.");
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0c0618] text-white px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-[#eab308]/35 bg-[#12081f]/95 p-8 shadow-[0_0_50px_-12px_rgba(139,92,246,0.45)]">
        <h1
          className={`${cinzel.className} text-center text-2xl font-bold tracking-tight bg-gradient-to-r from-[#fde047] via-[#eab308] to-[#a16207] bg-clip-text text-transparent md:text-3xl`}
        >
          GarmonPay
        </h1>
        <p className="mt-2 text-center text-sm text-violet-200/85">Create your free account</p>

        <div className="mt-8 space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-violet-300/90">
              Full name
            </label>
            <input
              type="text"
              autoComplete="name"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-violet-400/50 outline-none focus:border-[#eab308]/60"
              placeholder="Your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-violet-300/90">
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-violet-400/50 outline-none focus:border-[#eab308]/60"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-violet-300/90">
              Password
            </label>
            <input
              type="password"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-violet-400/50 outline-none focus:border-[#eab308]/60"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-violet-300/90">
              Referral code <span className="text-violet-500 normal-case">(optional)</span>
            </label>
            <input
              type="text"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-violet-400/50 outline-none focus:border-[#eab308]/60"
              placeholder="Friend's code"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              disabled={loading}
              autoComplete="off"
            />
          </div>
        </div>

        {TURNSTILE_SITE_KEY && (
          <div className="mt-4">
            <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onVerify={onTurnstileVerify} />
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={register}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 py-3.5 font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Creating account…" : "Register"}
        </button>

        {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
        {message && <p className="mt-3 text-center text-sm text-emerald-400/90">{message}</p>}

        <p className="mt-8 text-center text-sm text-violet-300/90">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[#fde047] underline underline-offset-2 hover:text-[#eab308]">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
