"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { getRegisterUrl } from "@/lib/site-url";

const REF_STORAGE_KEY = "garmonpay_ref";

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const supabase = createBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const ref = searchParams.get("ref")?.trim();
    if (ref && typeof localStorage !== "undefined") {
      localStorage.setItem(REF_STORAGE_KEY, ref);
    }
  }, [searchParams]);

  async function register() {
    setError("");
    setMessage("");
    if (!supabase) {
      setError("Registration not configured.");
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    const { data, error: err } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        emailRedirectTo: getRegisterUrl(),
      },
    });
    if (err) {
      setError(err.message);
      return;
    }
    if (data?.user && data.session?.access_token) {
      const res = await fetch("/api/auth/sync-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({ id: data.user.id, email: data.user.email ?? trimmedEmail }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        console.warn("Register sync-user failed:", json?.message || res.status);
      }
    }
    setMessage("Check your email to confirm your account, or sign in if already confirmed.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="bg-gray-900 p-8 rounded w-96">
        <h1 className="text-2xl mb-4">Register</h1>

        <input
          type="email"
          className="w-full p-2 mb-3 text-black"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="w-full p-2 mb-3 text-black"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="button" onClick={register} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold w-full py-3 rounded-lg transition mb-3">
          Register
        </button>

        {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}
        {message && <p className="text-green-400 mt-2 text-sm">{message}</p>}

        <p className="mt-4 text-gray-400 text-sm">
          Already have an account? <Link href="/login" className="text-blue-400 underline">Login</Link>
        </p>
      </div>
    </div>
  );
}
