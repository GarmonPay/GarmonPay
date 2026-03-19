"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { gamesSpin } from "@/lib/api";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "/api";

function authHeaders(accessTokenOrUserId: string, isToken: boolean): Record<string, string> {
  return isToken ? { Authorization: `Bearer ${accessTokenOrUserId}` } : { "X-User-Id": accessTokenOrUserId };
}

export default function SpinPage() {
  const router = useRouter();
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);

  const tokenOrId = session?.accessToken ?? session?.userId ?? "";
  const isToken = !!session?.accessToken;

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/games/spin");
        return;
      }
      setSession(s);
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    if (!tokenOrId) return;
    fetch(`${apiBase}/wallet/get`, { headers: authHeaders(tokenOrId, isToken), credentials: "include" })
      .then((r) => (r.ok ? r.json() : { balance_cents: 0 }))
      .then((d: { balance_cents?: number }) => setBalanceCents(d.balance_cents ?? 0))
      .catch(() => setBalanceCents(0));
  }, [tokenOrId, isToken]);

  const handleSpin = () => {
    if (!session || spinning) return;
    setError(null);
    setResult(null);
    setSpinning(true);
    gamesSpin(tokenOrId, isToken)
      .then((r) => {
        setResult(r.amountCents);
        fetch(`${apiBase}/wallet/get`, { headers: authHeaders(tokenOrId, isToken), credentials: "include" })
          .then((res) => (res.ok ? res.json() : {}))
          .then((d: { balance_cents?: number }) => setBalanceCents(d.balance_cents ?? 0));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Spin failed"))
      .finally(() => setSpinning(false));
  };

  if (loading || !session) {
    return (
      <div className="min-h-screen bg-[#0a0a12] flex items-center justify-center">
        <p className="text-[#00f0ff]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/games" className="text-[#00f0ff]/80 hover:text-[#00f0ff] text-sm font-medium">← Game Station</Link>
          <h1 className="text-2xl font-bold" style={{ color: "#ffd700", textShadow: "0 0 20px rgba(255,215,0,0.5)" }}>Spin Wheel Jackpot</h1>
          <span className="text-[#39ff14] font-mono">Balance: ${((balanceCents ?? 0) / 100).toFixed(2)}</span>
        </div>
        {error && (
          <div className="rounded-xl bg-red-500/20 border border-red-500/50 p-4 flex justify-between">
            <p className="text-red-200">{error}</p>
            <button type="button" onClick={() => setError(null)} className="text-red-300 underline">Dismiss</button>
          </div>
        )}
        {result != null && (
          <div className="rounded-xl bg-[#39ff14]/15 border border-[#39ff14]/50 p-4">
            <p className="text-[#39ff14] font-medium">You won {result}¢!</p>
          </div>
        )}
        <div className="rounded-2xl border-2 border-[#ffd700]/50 bg-black/40 p-8 text-center">
          <p className="text-[#ffd700]/90 mb-4">Uses platform reward budget. Spin for a random reward.</p>
          <button
            type="button"
            onClick={handleSpin}
            disabled={spinning}
            className="px-10 py-5 rounded-xl bg-[#ffd700]/20 border-2 border-[#ffd700] text-[#ffd700] font-bold text-xl disabled:opacity-50"
          >
            {spinning ? "Spinning…" : "SPIN"}
          </button>
        </div>
      </div>
    </div>
  );
}
