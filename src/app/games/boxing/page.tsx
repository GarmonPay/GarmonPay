"use client";

import { useEffect, useState } from "react";
import { getSessionAsync } from "@/lib/session";
import { BoxingArenaSocket } from "@/components/games/BoxingArenaSocket";
import { BoxingGame3D } from "@/components/games/BoxingGame3D";
import Link from "next/link";

const raw = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BOXING_WS_URL : undefined;
const WS_URL = raw ? String(raw).trim().replace(/^["']|["']$/g, "") : undefined;

export default function BoxingGamePage() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessionAsync().then((s) => {
      setSession(s);
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
        <Link href="/dashboard" className="text-fintech-accent hover:underline">
          Go to Dashboard
        </Link>
      </div>
    );
  }

  if (WS_URL) {
    return (
      <div className="min-h-screen bg-[#0f172a] p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-2xl font-bold text-white">Boxing Arena</h1>
            <Link href="/dashboard/games/boxing" className="text-sm text-fintech-muted hover:text-white">
              ← Back to games
            </Link>
          </div>
          <p className="text-white/70 text-sm">
            Join matchmaking to fight another player in real time. Use Jab and Power punch to attack.
          </p>
          <BoxingArenaSocket
            wsUrl={WS_URL}
            playerId={session.userId}
            betAmountCents={0}
            onMatchEnd={(won, winnerId, loserId) => {
              console.log("Match ended", { won, winnerId, loserId });
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] p-4">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-white">3D Boxing</h1>
          <Link href="/dashboard/games/boxing" className="text-sm text-fintech-muted hover:text-white">
            ← Back to games
          </Link>
        </div>
        <p className="text-fintech-muted text-sm">
          Local play: both players on one keyboard. Bet: 0¢ (set via ?bet=100). Multiplayer: use ?opponent=USER_ID and configure WebSocket URL.
        </p>
        <BoxingGame3D
          player1Id={session.userId}
          player2Id={session.userId}
          betAmountCents={0}
          accessToken={session.accessToken}
          wsUrl={null}
          onMatchEnd={(winnerId, loserId) => console.log("Match ended", { winnerId, loserId })}
        />
      </div>
    </div>
  );
}
