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

/** Map raw auth error strings to user-friendly messages. */
function friendlyLoginError(raw: string): { message: string; unconfirmed: boolean } {
  const msg = raw.toLowerCase();
  const unconfirmed =
    msg.includes("confirm your email") ||
    msg.includes("email not confirmed") ||
    msg.includes("verify your email") ||
    msg.includes("email_not_confirmed");
  if (unconfirmed) {
    return { message: "Please confirm your email first.", unconfirmed: true };
  }
  if (msg.includes("invalid login") || msg.includes("invalid credentials") || msg.includes("incorrect password") || msg.includes("wrong password")) {
    return { message: "Incorrect password. Please try again.", unconfirmed: false };
  }
  if (msg.includes("no user") || msg.includes("user not found") || msg.includes("no account")) {
    return { message: "No account found with that email.", unconfirmed: false };
  }
  if (msg.includes("locked")) {
    return { message: raw, unconfirmed: false };
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return { message: "Network error. Check your connection and try again.", unconfirmed: false };
  }
  if (msg.includes("error") || msg.includes("exception")) {
    return { message: "Something went wrong. Please try again.", unconfirmed: false };
  }
  return { message: raw, unconfirmed: false };
}

function LoginForm() {
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  async function handleResend() {
    setResendMessage("");
    setResendLoading(true);
    try {
      const supabase = createBrowserClient();
      if (supabase) {
        await supabase.auth.resend({ type: "signup", email: email.trim() });
      }
      setResendMessage("Confirmation email sent! Check your inbox.");
    } catch {
      setResendMessage("Could not resend. Try registering again.");
    } finally {
      setResendLoading(false);
    }
  }

  async function login(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    setUnconfirmed(false);
    setResendMessage("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail) { setError("Email is required"); return; }
    if (!password) { setError("Password is required"); return; }
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
        const parsed = friendlyLoginError(result.message);
        setError(parsed.message);
        setUnconfirmed(parsed.unconfirmed);
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
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

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
        <p className="mt-2 text-center text-sm font-medium" style={{ color: "rgba(221,214,254,0.9)" }}>
          Member login
        </p>
        <p className="mt-1 text-center text-xs" style={{ color: "rgba(167,139,250,0.7)" }}>
          Sign in to your dashboard
        </p>

        <form onSubmit={login} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-medium uppercase tracking-wider"
              style={{ color: "rgba(196,181,253,0.9)" }}
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              className="mt-1.5 w-full rounded-xl px-4 py-3 text-white placeholder:text-violet-400/50 outline-none transition"
              style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(245,200,66,0.6)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-medium uppercase tracking-wider"
              style={{ color: "rgba(196,181,253,0.9)" }}
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-xl px-4 py-3 text-white placeholder:text-violet-400/50 outline-none transition"
              style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(245,200,66,0.6)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
            />
          </div>

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-xs font-medium underline-offset-2 hover:underline"
              style={{ color: "rgba(245,200,66,0.9)" }}
            >
              Forgot password?
            </Link>
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
                Signing in…
              </>
            ) : (
              "Login"
            )}
          </button>

          {/* Unconfirmed email warning */}
          {unconfirmed && (
            <div
              className="rounded-xl p-4 text-sm"
              style={{ background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.35)" }}
            >
              <p className="font-semibold" style={{ color: "#F5C842" }}>
                Please confirm your email first.
              </p>
              <p className="mt-1 text-xs" style={{ color: "rgba(253,224,71,0.75)" }}>
                Check your inbox for the link we sent when you registered.
              </p>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendLoading}
                className="mt-3 w-full rounded-lg py-2 text-xs font-semibold transition disabled:opacity-60"
                style={{ border: "1px solid rgba(245,200,66,0.5)", color: "#F5C842", background: "transparent" }}
              >
                {resendLoading ? "Sending…" : "Resend confirmation email"}
              </button>
              {resendMessage && (
                <p className="mt-2 text-center text-xs" style={{ color: "#86efac" }}>
                  {resendMessage}
                </p>
              )}
            </div>
          )}

          {/* Generic error (non-unconfirmed) */}
          {error && !unconfirmed && (
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
          New member?{" "}
          <Link
            href="/register"
            className="font-medium underline underline-offset-2"
            style={{ color: "#F5C842" }}
          >
            Create free account
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
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: "#0e0118", color: "rgba(196,181,253,0.8)" }}
        >
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
