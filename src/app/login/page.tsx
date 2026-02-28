"use client";

import { useState } from "react";
import { getDashboardUrl } from "@/lib/site-url";
import { login as authLogin } from "@/core/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function login(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Email is required");
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }
    const result = await authLogin(trimmedEmail, password);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.isAdmin) {
      window.location.href = "/admin";
    } else {
      window.location.href = getDashboardUrl();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="bg-gray-900 p-8 rounded w-96">
        <h1 className="text-2xl mb-4">Member Login</h1>

        <form onSubmit={login}>
          <input
            type="email"
            autoComplete="email"
            className="w-full p-2 mb-3 text-black"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            autoComplete="current-password"
            className="w-full p-2 mb-3 text-black"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold w-full py-3 rounded-lg transition">
            Login
          </button>

          {error && <p className="text-red-500 mt-3">{error}</p>}
        </form>
      </div>
    </div>
  );
}
