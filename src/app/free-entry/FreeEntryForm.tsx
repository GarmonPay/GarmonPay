"use client";

import { useState } from "react";

export function FreeEntryForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/free-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          username: username.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div
        className="rounded-lg border border-[#22c55e]/50 bg-[#22c55e]/10 px-4 py-4 text-[#bbf7d0]"
        role="status"
      >
        Your 10 free GPay Coins have been added to your account!
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-md">
      <div>
        <label htmlFor="free-entry-name" className="block text-sm font-medium text-[#c4b5fd] mb-1">
          Full name (required)
        </label>
        <input
          id="free-entry-name"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-lg border border-[#7C3AED]/40 bg-black/30 px-3 py-2.5 text-white placeholder:text-gray-500 focus:border-[#F5C842] focus:outline-none focus:ring-1 focus:ring-[#F5C842]"
          placeholder="Your legal name"
        />
      </div>
      <div>
        <label htmlFor="free-entry-email" className="block text-sm font-medium text-[#c4b5fd] mb-1">
          Email address (required)
        </label>
        <input
          id="free-entry-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-[#7C3AED]/40 bg-black/30 px-3 py-2.5 text-white placeholder:text-gray-500 focus:border-[#F5C842] focus:outline-none focus:ring-1 focus:ring-[#F5C842]"
          placeholder="Same email as your GarmonPay account"
        />
      </div>
      <div>
        <label htmlFor="free-entry-user" className="block text-sm font-medium text-[#c4b5fd] mb-1">
          GarmonPay username (required)
        </label>
        <input
          id="free-entry-user"
          name="username"
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-lg border border-[#7C3AED]/40 bg-black/30 px-3 py-2.5 text-white placeholder:text-gray-500 focus:border-[#F5C842] focus:outline-none focus:ring-1 focus:ring-[#F5C842]"
          placeholder="Your referral code (username)"
        />
      </div>
      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="min-h-touch w-full rounded-lg bg-[#7C3AED] px-4 py-3 font-semibold text-white transition hover:bg-[#6d28d9] disabled:opacity-60"
      >
        {loading ? "Submitting…" : "SUBMIT FREE ENTRY"}
      </button>
    </form>
  );
}
