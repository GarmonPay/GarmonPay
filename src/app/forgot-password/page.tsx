"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/core/supabase";
import { getResetPasswordUrl } from "@/lib/site-url";

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
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="bg-gray-900 p-8 rounded w-96">
        <h1 className="text-2xl mb-4">Forgot Password</h1>
        {sent ? (
          <p className="text-gray-300 mb-4">
            If an account exists for that email, we sent a secure reset link. It expires in 15 minutes. Check your inbox and spam folder.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              autoComplete="email"
              className="w-full p-2 mb-3 text-black rounded"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed text-white font-semibold w-full py-3 rounded-lg transition"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
            {error && <p className="text-red-500 mt-3 text-sm">{error}</p>}
          </form>
        )}
        <p className="mt-4 text-center text-gray-400 text-sm">
          <Link href="/login" className="text-blue-400 hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
