"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getApiRoot } from "@/lib/api";

const REGEN_COST = 500;

export default function CreateFighterEntryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fighter, setFighter] = useState<unknown>(null);
  const [arenaCoins, setArenaCoins] = useState<number>(0);
  const [freeGenerationUsed, setFreeGenerationUsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSessionAsync()
      .then((session) => {
        if (cancelled) return;
        if (!session) {
          setLoading(false);
          router.replace("/login?next=/dashboard/arena/create");
          return;
        }
        const token = session.accessToken ?? session.userId;
        const headers: Record<string, string> = session.accessToken
          ? { Authorization: `Bearer ${token}` }
          : { "X-User-Id": token };
        return fetch(`${getApiRoot()}/arena/me`, { headers, credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (cancelled || !data) return;
            if (data.fighter) setFighter(data.fighter);
            if (typeof data.arenaCoins === "number") setArenaCoins(data.arenaCoins);
            if (data.freeGenerationUsed === true) setFreeGenerationUsed(true);
          })
          .finally(() => { if (!cancelled) setLoading(false); });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (loading || !fighter) return;
    router.replace("/dashboard/arena");
  }, [loading, fighter, router]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto rounded-xl bg-[#161b22] border border-white/10 p-8 text-center">
        <p className="text-[#9ca3af]">Loading…</p>
      </div>
    );
  }

  if (fighter) {
    return (
      <div className="max-w-2xl mx-auto rounded-xl bg-[#161b22] border border-white/10 p-8 text-center">
        <p className="text-[#9ca3af]">Redirecting to Arena…</p>
      </div>
    );
  }

  const canAffordAI = arenaCoins >= REGEN_COST;
  const aiCostLabel = freeGenerationUsed ? `${REGEN_COST} coins to regenerate` : "FREE — One time only";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="rounded-xl bg-[#161b22] border border-white/10 p-6 md:p-8">
        <h1 className="text-3xl font-bold text-white text-center mb-2">CREATE YOUR FIGHTER</h1>
        <p className="text-[#9ca3af] text-center mb-6">Choose how you want to begin</p>

        {freeGenerationUsed && (
          <p className="text-center text-[#f0a500] text-sm mb-4">You have {arenaCoins} coins. Regenerating costs {REGEN_COST} coins.</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Card 1 — AI Questionnaire (recommended) */}
          <div className={`rounded-xl border-2 p-6 flex flex-col ${freeGenerationUsed ? "border-white/20 bg-[#0d1117]" : "border-[#f0a500] bg-[#0d1117]"}`}>
            <div className="text-3xl mb-3">✨</div>
            <h2 className="text-xl font-bold text-white mb-2">LET AI BUILD YOU</h2>
            <p className="text-[#9ca3af] text-sm mb-4 flex-1">
              Answer 3 questions. Claude AI creates your unique fighter, backstory, name, and style.
            </p>
            <p className="text-[#f0a500] text-xs font-medium mb-4">{aiCostLabel}</p>
            <Link
              href="/dashboard/arena/create/ai"
              className={`block w-full py-3 rounded-lg text-center font-bold ${freeGenerationUsed && !canAffordAI ? "bg-[#6b7280] text-white cursor-not-allowed" : "bg-[#f0a500] text-black hover:bg-[#e09500]"}`}
              onClick={(e) => freeGenerationUsed && !canAffordAI && e.preventDefault()}
            >
              GENERATE MY FIGHTER
            </Link>
            {freeGenerationUsed && !canAffordAI && (
              <Link href="/dashboard/arena/store" className="block text-center text-[#f0a500] text-sm mt-2 hover:underline">Buy coins</Link>
            )}
          </div>

          {/* Card 2 — Quick / Auto */}
          <div className="rounded-xl border-2 border-white/20 bg-[#0d1117] p-6 flex flex-col">
            <div className="text-3xl mb-3">⚡</div>
            <h2 className="text-xl font-bold text-white mb-2">AUTO GENERATE</h2>
            <p className="text-[#9ca3af] text-sm mb-4 flex-1">
              Claude instantly creates a fighter based on your username. No questions needed.
            </p>
            <p className="text-[#f0a500] text-xs font-medium mb-4">{aiCostLabel}</p>
            <Link
              href="/dashboard/arena/create/ai?auto=1"
              className={`block w-full py-3 rounded-lg text-center font-bold border border-white/20 ${freeGenerationUsed && !canAffordAI ? "text-[#6b7280] cursor-not-allowed" : "text-white hover:bg-white/10"}`}
              onClick={(e) => freeGenerationUsed && !canAffordAI && e.preventDefault()}
            >
              INSTANT CREATE
            </Link>
            {freeGenerationUsed && !canAffordAI && (
              <Link href="/dashboard/arena/store" className="block text-center text-[#f0a500] text-sm mt-2 hover:underline">Buy coins</Link>
            )}
          </div>

          {/* Card 3 — Build manually */}
          <div className="rounded-xl border-2 border-white/20 bg-[#0d1117] p-6 flex flex-col">
            <div className="text-3xl mb-3">🔧</div>
            <h2 className="text-xl font-bold text-white mb-2">BUILD YOURSELF</h2>
            <p className="text-[#9ca3af] text-sm mb-4 flex-1">
              Choose every detail yourself. Full control over your fighter.
            </p>
            <p className="text-[#86efac] text-xs font-medium mb-4">Always free</p>
            <Link
              href="/dashboard/arena/create/manual"
              className="block w-full py-3 rounded-lg text-center font-bold border border-white/20 text-white hover:bg-white/10"
            >
              BUILD MANUALLY
            </Link>
          </div>
        </div>

        <div className="text-center">
          <Link href="/dashboard/arena" className="text-[#9ca3af] hover:text-white text-sm">Back to Arena</Link>
        </div>
      </div>
    </div>
  );
}
