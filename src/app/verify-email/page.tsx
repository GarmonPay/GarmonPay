"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/core/supabase";

export default function VerifyEmailPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function resendVerification(e?: React.FormEvent) {
    e?.preventDefault();
    const supabase = createBrowserClient();
    if (!supabase) {
      setError("Auth not configured");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const emailToUse = (user?.email ?? email.trim()) || "";
    if (!emailToUse) {
      setError("Enter your email or log in first.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error: err } = await supabase.auth.resend({
        type: "signup",
        email: emailToUse,
      });
      if (err) {
        setError(err.message || "Failed to resend");
        return;
      }
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="bg-gray-900 p-8 rounded w-96">
        <h1 className="text-2xl mb-4">Verify your email</h1>
        <p className="text-gray-300 mb-4">
          We sent a verification link to your email. It expires in 24 hours. Click the link to activate your account.
        </p>
        <p className="text-gray-400 text-sm mb-4">
          Didn’t get the email? Check spam, or request a new link below.
        </p>
        <form onSubmit={resendVerification}>
          <input
            type="email"
            autoComplete="email"
            className="w-full p-2 mb-3 text-black rounded"
            placeholder="Your email (to resend link)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || sent}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white font-semibold w-full py-3 rounded-lg transition mb-3"
          >
            {loading ? "Sending…" : sent ? "Link sent" : "Resend verification link"}
          </button>
        </form>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <p className="text-center text-gray-400 text-sm">
          <Link href="/login" className="text-blue-400 hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
