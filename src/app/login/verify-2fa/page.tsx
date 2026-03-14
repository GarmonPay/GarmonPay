"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/core/supabase";
import { getDashboardUrl } from "@/lib/site-url";

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
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="bg-gray-900 p-8 rounded w-96">
          <p className="text-gray-400">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="bg-gray-900 p-8 rounded w-96">
        <h1 className="text-2xl mb-4">Two-factor authentication</h1>
        <p className="text-gray-400 text-sm mb-4">
          Enter the 6-digit code from your authenticator app (Google Authenticator, Authy, Microsoft Authenticator).
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            className="w-full p-3 mb-3 text-black rounded text-center text-lg tracking-widest"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed text-white font-semibold w-full py-3 rounded-lg transition"
          >
            {loading ? "Verifying…" : "Verify"}
          </button>
          {error && <p className="text-red-500 mt-3 text-sm">{error}</p>}
        </form>
        <p className="mt-4 text-center text-gray-400 text-sm">
          <a href="/login" className="text-blue-400 hover:underline">Back to login</a>
        </p>
      </div>
    </div>
  );
}
