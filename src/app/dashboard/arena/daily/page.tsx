"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export default function ArenaDailyPage() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [loginStatus, setLoginStatus] = useState<{ claimed: boolean; dayStreak: number; coinsEarnedToday: number } | null>(null);
  const [spinStatus, setSpinStatus] = useState<{ spinsLeft: number; maxSpins: number; spinsUsed: number } | null>(null);
  const [jackpot, setJackpot] = useState<{ weekStart: string; totalAmount: number; paidOut: boolean } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<{ prizeCoins: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const s = await getSessionAsync();
    if (!s) return;
    setSession(s);
    const token = s.accessToken ?? s.userId;
    const headers: Record<string, string> = s.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
    const [loginRes, spinRes, jackpotRes] = await Promise.all([
      fetch(`${API_BASE}/arena/daily-login`, { headers, credentials: "include" }),
      fetch(`${API_BASE}/arena/spin`, { headers, credentials: "include" }),
      fetch(`${API_BASE}/arena/jackpot`, { headers, credentials: "include" }),
    ]);
    if (loginRes.ok) setLoginStatus(await loginRes.json());
    if (spinRes.ok) setSpinStatus(await spinRes.json());
    if (jackpotRes.ok) setJackpot(await jackpotRes.json());
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const claimLogin = async () => {
    if (!session) return;
    setError(null);
    setClaiming(true);
    const token = session.accessToken ?? session.userId;
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token }) };
    const res = await fetch(`${API_BASE}/arena/daily-login`, { method: "POST", headers, credentials: "include", body: "{}" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) fetchAll();
    else setError(data.message || "Claim failed");
    setClaiming(false);
  };

  const spin = async () => {
    if (!session) return;
    setError(null);
    setSpinResult(null);
    setSpinning(true);
    const token = session.accessToken ?? session.userId;
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token }) };
    const res = await fetch(`${API_BASE}/arena/spin`, { method: "POST", headers, credentials: "include", body: "{}" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSpinResult({ prizeCoins: data.prizeCoins ?? 0 });
      fetchAll();
    } else setError(data.message || "Spin failed");
    setSpinning(false);
  };

  if (!session) {
    return <div className="p-6 text-[#9ca3af]">Loading…</div>;
  }

  return (
    <div className="rounded-xl bg-[#161b22] border border-white/10 p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Daily Engagement</h1>
        <Link href="/dashboard/arena" className="text-[#f0a500] hover:underline">Back to Arena</Link>
      </div>
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

      <div className="space-y-6">
        <div className="rounded-lg bg-[#0d1117] border border-white/10 p-4">
          <h2 className="font-semibold text-white mb-2">Daily login bonus</h2>
          <p className="text-[#9ca3af] text-sm mb-2">Day 1–7 streak: 25 → 150 coins. Season Pass: double.</p>
          {loginStatus?.claimed ? (
            <p className="text-[#86efac]">Claimed today. Streak: {loginStatus.dayStreak}. Coins earned: {loginStatus.coinsEarnedToday}</p>
          ) : (
            <button type="button" onClick={claimLogin} disabled={claiming} className="px-4 py-2 rounded-lg bg-[#f0a500] text-black font-medium disabled:opacity-50">
              {claiming ? "…" : "Claim"}
            </button>
          )}
        </div>

        <div className="rounded-lg bg-[#0d1117] border border-white/10 p-4">
          <h2 className="font-semibold text-white mb-2">Daily spin</h2>
          <p className="text-[#9ca3af] text-sm mb-2">1 free spin per day (2 with Season Pass). Win 10–100 coins.</p>
          {spinStatus && <p className="text-[#d1d5db] text-sm mb-2">Spins left: {spinStatus.spinsLeft} / {spinStatus.maxSpins}</p>}
          {spinResult && <p className="text-[#86efac] mb-2">Won {spinResult.prizeCoins} coins!</p>}
          <button type="button" onClick={spin} disabled={spinning || (spinStatus?.spinsLeft ?? 0) <= 0} className="px-4 py-2 rounded-lg bg-[#3b82f6] text-white font-medium disabled:opacity-50">
            {spinning ? "…" : "Spin"}
          </button>
        </div>

        <div className="rounded-lg bg-[#0d1117] border border-white/10 p-4">
          <h2 className="font-semibold text-white mb-2">Weekly jackpot</h2>
          <p className="text-[#9ca3af] text-sm mb-2">2% of spectator pots. Drawn Friday. Random winner among users who logged in that week.</p>
          {jackpot && (
            <p className="text-[#d1d5db]">
              This week ({jackpot.weekStart}): ${jackpot.totalAmount.toFixed(2)} {jackpot.paidOut ? "(paid)" : ""}
            </p>
          )}
        </div>

        <p className="text-[#9ca3af] text-sm">Win streak bonuses: 3 wins → 50 coins, 5 → 100, 10 → 250. Refer a friend → 500 coins.</p>
      </div>
    </div>
  );
}
