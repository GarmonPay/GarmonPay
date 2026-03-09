"use client";

import { useEffect, useState } from "react";
import { getSessionAsync } from "@/lib/session";
import { ProBoxingExperience } from "@/components/games/boxing/ProBoxingExperience";
import Link from "next/link";

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

  return (
    <div className="min-h-screen bg-[#0f172a] p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-white">Professional 3D Boxing</h1>
          <Link href="/dashboard/games/boxing" className="text-sm text-fintech-muted hover:text-white">
            ← Back to games
          </Link>
        </div>
        <p className="text-fintech-muted text-sm">
          Realistic ring environment with fighter progression, AI behavior styles, training drills, and wallet-driven tournament flow.
        </p>
        <ProBoxingExperience defaultSection="arena" />
      </div>
    </div>
  );
}
