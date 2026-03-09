"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Fighter = {
  user_id: string;
  email: string;
  wins: number;
  losses: number;
  knockouts: number;
  total_earnings_cents: number;
  rank: number;
};

function maskEmail(email: string) {
  if (!email || email === "—") return "—";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const show = local.length <= 2 ? local : local.slice(0, 2) + "***";
  return `${show}@${domain}`;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function TopFightersLeaderboard() {
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/boxing/leaderboard?limit=10")
      .then((r) => r.ok ? r.json() : { leaderboard: [] })
      .then((d) => setFighters(d.leaderboard ?? []))
      .catch(() => setFighters([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="w-full max-w-2xl mt-12 px-4">
        <h2 className="text-xl font-bold text-white mb-4">Top Fighters</h2>
        <p className="text-white/60 text-sm">Loading…</p>
      </section>
    );
  }

  if (fighters.length === 0) {
    return (
      <section className="w-full max-w-2xl mt-12 px-4">
        <h2 className="text-xl font-bold text-white mb-4">Top Fighters</h2>
        <p className="text-white/60 text-sm">No fights yet. Be the first to climb the ranks.</p>
        <Link
          href="/dashboard/games/boxing?section=arena"
          className="inline-block mt-3 text-blue-400 hover:underline text-sm"
        >
          Enter the Arena →
        </Link>
      </section>
    );
  }

  return (
    <section className="w-full max-w-2xl mt-12 px-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Top Fighters</h2>
        <Link
          href="/dashboard/leaderboard"
          className="text-sm text-blue-400 hover:underline"
        >
          Full leaderboard →
        </Link>
      </div>
      <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/70">
              <th className="p-3 font-medium">#</th>
              <th className="p-3 font-medium">Fighter</th>
              <th className="p-3 font-medium text-right">W</th>
              <th className="p-3 font-medium text-right">L</th>
              <th className="p-3 font-medium text-right">KO</th>
              <th className="p-3 font-medium text-right">Earnings</th>
            </tr>
          </thead>
          <tbody>
            {fighters.map((f) => (
              <tr key={f.user_id} className="border-b border-white/5 hover:bg-white/5">
                <td className="p-3 text-amber-400 font-semibold">{f.rank}</td>
                <td className="p-3 text-white">{maskEmail(f.email)}</td>
                <td className="p-3 text-right text-green-400 font-medium">{f.wins}</td>
                <td className="p-3 text-right text-red-400/90">{f.losses}</td>
                <td className="p-3 text-right text-white/90">{f.knockouts}</td>
                <td className="p-3 text-right text-emerald-400 font-medium">{formatCents(f.total_earnings_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link
        href="/dashboard/games/boxing?section=arena"
        className="inline-block mt-3 text-blue-400 hover:underline text-sm"
      >
        Enter the Arena →
      </Link>
    </section>
  );
}
