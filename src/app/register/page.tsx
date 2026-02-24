"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";

export default function RegisterPage() {
  const supabase = createBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function register() {
    setError("");
    setMessage("");
    if (!supabase) {
      setError("Registration not configured.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://garmonpay.com").replace(/\/$/, "");
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteUrl}/register`,
      },
    });
    if (err) {
      setError(err.message);
    } else {
      setMessage("Check your email to confirm your account, or sign in if already confirmed.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="bg-gray-900 p-8 rounded w-96">
        <h1 className="text-2xl mb-4">Register</h1>

        <input
          type="email"
          className="w-full p-2 mb-3 text-black"
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="w-full p-2 mb-3 text-black"
          placeholder="Password (min 8 characters)"
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
