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

/** Map raw Supabase/server errors to friendly messages shown to the user. */
function friendlyError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("database error") || msg.includes("saving new user")) {
    return "We had trouble creating your account. Please try again or contact support.";
  }
  if (msg.includes("already registered") || msg.includes("already been registered") || msg.includes("user already")) {
    return "An account with this email already exists. Try logging in instead.";
  }
  if (msg.includes("invalid email")) {
    return "Please enter a valid email address.";
  }
  if (msg.includes("password") && msg.includes("short")) {
    return "Password must be at least 8 characters.";
  }
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }
  // For unknown errors, don't expose technical details
  if (msg.includes("error") || msg.includes("exception") || msg.includes("violates")) {
    return "We had trouble creating your account. Please try again or contact support.";
  }
  return raw;
}

const AVATARS = ["🧑", "👩", "👨", "🧑‍💼", "👩‍💼"];

export default function RegisterPage() {
  const supabase = createBrowserClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
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
    if (!supabase) {
      setError("Registration not configured.");
      return;
    }
    const trimmedEmail = email.trim();
    const trimmedName = fullName.trim();
    if (!trimmedName) { setError("Full name is required."); return; }
    if (!trimmedEmail) { setError("Email is required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (!agreed) { setError("Please agree to the Terms of Service to continue."); return; }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Please complete the security check.");
      return;
    }

    setLoading(true);
    try {
      const checkRes = await fetch("/api/auth/check-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, turnstileToken: turnstileToken || undefined }),
      });
      const checkData = await checkRes.json().catch(() => ({}));
      if (!checkRes.ok || !checkData.allowed) {
        setError(friendlyError(checkData.message || "Signup check failed. Try again."));
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
        setError(friendlyError(err.message));
        setLoading(false);
        return;
      }

      if (data?.user) {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (data.session?.access_token) {
          headers.Authorization = `Bearer ${data.session.access_token}`;
        }
        // Best-effort sync — don't block the user if this fails
        await fetch("/api/auth/sync-user", {
          method: "POST",
          headers,
          body: JSON.stringify({
            id: data.user.id,
            email: data.user.email ?? trimmedEmail,
            full_name: trimmedName,
            referralCode: refCode || undefined,
          }),
        }).catch(() => {
          // Non-critical: trigger already created the user row; sync-user is a fallback
        });
      }

      setSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0c0618] text-white px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-[#eab308]/35 bg-[#12081f]/95 p-8 shadow-[0_0_50px_-12px_rgba(139,92,246,0.45)] text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className={`${cinzel.className} text-2xl font-bold bg-gradient-to-r from-[#fde047] via-[#eab308] to-[#a16207] bg-clip-text text-transparent`}>
            Welcome to GarmonPay!
          </h2>
          <p className="mt-3 text-violet-200/90">
            Your account is ready. Check your email to confirm your address, then sign in.
          </p>
          <div className="mt-8 space-y-3 text-left text-sm text-violet-200/80">
            <p className="font-semibold text-white text-base">Here&apos;s how to get started:</p>
            <div className="flex items-start gap-3">
              <span className="text-[#eab308] font-bold">1.</span>
              <span>Confirm your email (check your inbox)</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-[#eab308] font-bold">2.</span>
              <span>Watch your first ad and earn instantly</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-[#eab308] font-bold">3.</span>
              <span>Share your referral link and earn $0.50 per signup</span>
            </div>
          </div>
          <Link
            href="/login"
            className="mt-8 block w-full rounded-xl bg-gradient-to-r from-[#eab308] to-[#d97706] py-3.5 font-semibold text-[#0c0618] transition hover:from-[#fde047] hover:to-[#eab308]"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
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
              Full name <span className="text-red-400">*</span>
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
              Email <span className="text-red-400">*</span>
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
              Password <span className="text-red-400">*</span>
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
              Confirm password <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-violet-400/50 outline-none focus:border-[#eab308]/60"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-violet-300/90">
              Referral code <span className="text-violet-500 normal-case font-normal">(optional)</span>
            </label>
            <input
              type="text"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-violet-400/50 outline-none focus:border-[#eab308]/60"
              placeholder="Friend's referral code"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              disabled={loading}
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-violet-400/80">
              Have a referral code? Enter it to earn your inviter a bonus.
            </p>
          </div>
        </div>

        {TURNSTILE_SITE_KEY && (
          <div className="mt-4">
            <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onVerify={onTurnstileVerify} />
          </div>
        )}

        <label className="mt-5 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={loading}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#eab308]"
          />
          <span className="text-xs text-violet-300/90 leading-relaxed">
            I agree to the{" "}
            <Link href="/terms" className="text-[#fde047] underline underline-offset-2 hover:text-[#eab308]">
              Terms of Service
            </Link>{" "}
            and confirm I am 18 years of age or older.
          </span>
        </label>

        <button
          type="button"
          disabled={loading}
          onClick={register}
          className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#eab308] to-[#d97706] py-3.5 font-semibold text-[#0c0618] shadow-lg shadow-yellow-900/30 transition hover:from-[#fde047] hover:to-[#eab308] disabled:cursor-not-allowed disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Creating account…
            </>
          ) : (
            "Create My Account"
          )}
        </button>

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-center text-sm text-red-400">
            {error}
          </p>
        )}

        <p className="mt-8 text-center text-sm text-violet-300/90">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[#fde047] underline underline-offset-2 hover:text-[#eab308]">
            Login
          </Link>
        </p>

        {/* Social proof */}
        <div className="mt-6 flex items-center justify-center gap-3 border-t border-white/[0.06] pt-5">
          <div className="flex -space-x-2">
            {AVATARS.map((a, i) => (
              <div
                key={i}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#12081f] bg-violet-800/60 text-sm"
              >
                {a}
              </div>
            ))}
          </div>
          <p className="text-xs text-violet-300/80">Join 10,000+ members already earning</p>
        </div>
      </div>
    </div>
  );
}
