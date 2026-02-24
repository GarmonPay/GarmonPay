"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { getDashboardUrl } from "@/lib/site-url";

export default function LoginPage() {
  const supabase = createBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function login() {
    setError("");
    if (!supabase) {
      setError("Login not configured.");
      return;
    }
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (err) {
      setError(err.message);
    } else {
      window.location.href = getDashboardUrl();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="bg-gray-900 p-8 rounded w-96">
        <h1 className="text-2xl mb-4">Member Login</h1>

        <input
          className="w-full p-2 mb-3 text-black"
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="w-full p-2 mb-3 text-black"
          placeholder="Password"
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="button" onClick={login} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold w-full py-3 rounded-lg transition">
          Login
        </button>

        {error && <p className="text-red-500 mt-3">{error}</p>}
      </div>
    </div>
  );
}
