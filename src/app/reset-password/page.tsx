"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/core/supabase";
import { getLoginUrl } from "@/lib/site-url";

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
      supabase!.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setValidSession(true);
          return;
        }
        supabase!.auth.getUser().then(({ data: { user } }) => setValidSession(!!user));
      });
    }
    check();
    const t1 = setTimeout(check, 500);
    const t2 = setTimeout(check, 1500);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") check();
    });
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
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="bg-gray-900 p-8 rounded w-96">
          <p className="text-gray-400">Checking reset link…</p>
        </div>
      </div>
    );
  }

  if (!validSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="bg-gray-900 p-8 rounded w-96">
          <h1 className="text-2xl mb-4">Invalid or expired link</h1>
          <p className="text-gray-400 mb-4">
            This password reset link is invalid or has expired. Request a new one from the login page.
          </p>
          <Link href="/forgot-password" className="text-blue-400 hover:underline">Request new link</Link>
          <span className="mx-2 text-gray-500">|</span>
          <Link href="/login" className="text-blue-400 hover:underline">Back to login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="bg-gray-900 p-8 rounded w-96">
        <h1 className="text-2xl mb-4">Set new password</h1>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            autoComplete="new-password"
            className="w-full p-2 mb-3 text-black rounded"
            placeholder="New password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            minLength={8}
          />
          <input
            type="password"
            autoComplete="new-password"
            className="w-full p-2 mb-3 text-black rounded"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={loading}
            minLength={8}
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed text-white font-semibold w-full py-3 rounded-lg transition"
          >
            {loading ? "Updating…" : "Update password"}
          </button>
          {error && <p className="text-red-500 mt-3 text-sm">{error}</p>}
        </form>
        <p className="mt-4 text-center text-gray-400 text-sm">
          <Link href="/login" className="text-blue-400 hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
