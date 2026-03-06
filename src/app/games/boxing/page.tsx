"use client";

import { useEffect, useState } from "react";
import { getSessionAsync } from "@/lib/session";
import { BoxingGame3D } from "@/components/games/BoxingGame3D";
import Link from "next/link";

export default function BoxingGamePage() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [betCents, setBetCents] = useState(0);
  const [player2Id, setPlayer2Id] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = new URLSearchParams(window.location.search);
    const bet = search.get("bet");
    const opponent = search.get("opponent");
    if (bet !== null) {
      const n = parseInt(bet, 10);
      if (Number.isFinite(n) && n >= 0) setBetCents(n);
    }
    if (opponent) setPlayer2Id(opponent.trim());

    getSessionAsync().then((s) => {
      setSession(s);
      if (!s && !opponent) setPlayer2Id(null);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <p className="text-white">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-white text-center">Sign in to play the boxing game.</p>
        <Link
          href="/dashboard"
          className="text-fintech-accent hover:underline"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  const p1Id = session.userId;
  const p2Id = player2Id ?? session.userId;

  return (
    <div className="min-h-screen bg-[#0f172a] p-4">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-white">3D Boxing</h1>
          <Link
            href="/dashboard/games/boxing"
            className="text-sm text-fintech-muted hover:text-white"
          >
            ← Back to games
          </Link>
        </div>
        <p className="text-fintech-muted text-sm">
          Local play: both players on one keyboard. Bet: {betCents}¢ (set via ?bet=100). Multiplayer: use ?opponent=USER_ID and configure WebSocket URL.
        </p>
        <BoxingGame3D
          player1Id={p1Id}
          player2Id={p2Id}
          betAmountCents={betCents}
          accessToken={session.accessToken}
          wsUrl={
            typeof process !== "undefined" && process.env.NEXT_PUBLIC_BOXING_WS_URL
              ? process.env.NEXT_PUBLIC_BOXING_WS_URL
              : null
          }
          onMatchEnd={(winnerId, loserId) => {
            console.log("Match ended", { winnerId, loserId });
          }}
        />
      </div>
    </div>
  );
}
