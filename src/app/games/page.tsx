"use client";

import { useState } from "react";
import Link from "next/link";
import { Cinzel_Decorative } from "next/font/google";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const TEASERS = [
  {
    title: "Skill Challenges",
    body: "Earn up to $1.00 per win in head-to-head skill rounds.",
    emoji: "🎯",
  },
  {
    title: "Daily Tournaments",
    body: "Earn up to $5.00 for first place in daily brackets.",
    emoji: "🏆",
  },
  {
    title: "Trivia Battles",
    body: "Earn up to $0.50 per correct answer in live trivia.",
    emoji: "🧠",
  },
  {
    title: "Instant Win Scratch Cards",
    body: "Earn up to $2.00 per card with instant reveals.",
    emoji: "🎫",
  },
] as const;

export default function GamesComingSoonPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMsg("");
    try {
      const res = await fetch("/api/game-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setStatus("error");
        setMsg(typeof data.message === "string" ? data.message : "Something went wrong.");
        return;
      }
      setStatus("done");
      setMsg(typeof data.message === "string" ? data.message : "You are on the list!");
      setEmail("");
    } catch {
      setStatus("error");
      setMsg("Network error. Try again.");
    }
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#05020a] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-violet-600/30 blur-[100px]" />
        <div className="absolute right-0 top-40 h-96 w-96 rounded-full bg-[#eab308]/15 blur-[110px]" />
        <div className="absolute bottom-10 left-1/3 h-64 w-64 rounded-full bg-purple-500/25 blur-[90px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-16 md:py-24">
        <div className="mb-4 rounded-2xl border border-[#eab308]/40 bg-[#12081f]/95 p-5 shadow-[0_0_40px_-12px_rgba(139,92,246,0.35)]">
          <h2 className="text-lg font-semibold text-[#fde047]">🎲 C-Lo Street Dice — live</h2>
          <p className="mt-2 text-sm text-violet-200/90">
            Multiplayer street dice. Banker sets the bank, players challenge with entries. Roll 4-5-6 for C-Lo.
          </p>
          <a
            href="/games/celo"
            className="mt-4 inline-flex rounded-xl bg-gradient-to-r from-[#7C3AED] to-violet-500 px-5 py-2.5 text-sm font-semibold text-white no-underline shadow-lg shadow-violet-900/40"
          >
            Enter lobby →
          </a>
        </div>
        <div className="mb-10 rounded-2xl border border-[#eab308]/40 bg-[#12081f]/95 p-5 shadow-[0_0_40px_-12px_rgba(139,92,246,0.35)]">
          <h2 className="text-lg font-semibold text-[#fde047]">Stake & Escape — live</h2>
          <p className="mt-2 text-sm text-violet-200/90">
            Members-only 3D vault escape. Stake from your wallet or play free (ad-supported).
          </p>
          <a
            href="/games/escape"
            className="mt-4 inline-flex rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white no-underline shadow-lg shadow-violet-900/40"
          >
            Enter lobby →
          </a>
        </div>
        <p className="text-center text-7xl md:text-8xl drop-shadow-[0_0_40px_rgba(234,179,8,0.35)]" aria-hidden>
          🎮
        </p>
        <h1
          className={`${cinzel.className} mt-6 text-center text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-5xl`}
        >
          <span className="bg-gradient-to-r from-[#fde047] via-[#eab308] to-[#a16207] bg-clip-text text-transparent">
            Game Station Coming Soon
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-center text-base text-violet-200/90 sm:text-lg">
          Earn real money playing skill-based games. Be the first to know when we launch.
        </p>

        <form
          onSubmit={submit}
          className="mx-auto mt-10 max-w-md rounded-2xl border border-[#eab308]/35 bg-[#12081f]/90 p-6 shadow-[0_0_50px_-12px_rgba(139,92,246,0.4)]"
        >
          <label className="block text-xs font-medium uppercase tracking-wider text-violet-300/90">
            Email for launch updates
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "loading"}
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-violet-400/50 outline-none focus:border-[#eab308]/60"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 py-3.5 font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-violet-400 disabled:opacity-70"
          >
            {status === "loading" ? "Submitting…" : "Submit"}
          </button>
          {status === "done" && msg && (
            <p className="mt-4 text-center text-sm font-medium text-emerald-400/95">{msg}</p>
          )}
          {status === "error" && msg && <p className="mt-4 text-center text-sm text-red-400">{msg}</p>}
        </form>

        <div className="mt-16 grid gap-4 sm:grid-cols-2">
          {TEASERS.map((t) => (
            <div
              key={t.title}
              className="rounded-2xl border border-white/[0.08] bg-[#12081f]/90 p-6 shadow-[0_0_40px_-12px_rgba(139,92,246,0.35)]"
            >
              <span className="text-3xl" aria-hidden>
                {t.emoji}
              </span>
              <h2 className="mt-3 text-lg font-semibold text-[#fde047]">{t.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-violet-200/85">{t.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-14 text-center">
          <Link
            href="/"
            className="text-sm font-medium text-violet-300 underline underline-offset-2 hover:text-[#fde047]"
          >
            ← Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
