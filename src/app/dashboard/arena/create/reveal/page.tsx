"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getApiRoot } from "@/lib/api";
import { getSessionAsync } from "@/lib/session";

type FighterReveal = {
  id: string;
  name: string;
  nickname?: string | null;
  style: string;
  avatar: string;
  origin?: string | null;
  backstory?: string | null;
  personality?: string | null;
  signature_move_name?: string | null;
  signature_move_desc?: string | null;
  fighter_color?: string | null;
  portrait_svg?: string | null;
  strength?: number;
  speed?: number;
  stamina?: number;
  defense?: number;
  chin?: number;
  special?: number;
};

const PHASES = ["darkness", "silhouette", "reveal", "stats", "backstory", "signature", "final"] as const;
const PHASE_DURATIONS: Record<(typeof PHASES)[number], number> = {
  darkness: 500,
  silhouette: 1000,
  reveal: 1500,
  stats: 2000,
  backstory: 3000,
  signature: 4000,
  final: 0,
};

export default function CreateFighterRevealPage() {
  const router = useRouter();
  const [fighter, setFighter] = useState<FighterReveal | null>(null);
  const [loading, setLoading] = useState(true);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [typedBackstory, setTypedBackstory] = useState("");
  const [error, setError] = useState("");

  const phase = PHASES[phaseIndex];
  const isLast = phaseIndex >= PHASES.length - 1;

  useEffect(() => {
    let cancelled = false;
    getSessionAsync().then((session) => {
      if (!session || cancelled) return;
      const token = session.accessToken ?? session.userId;
      const headers: Record<string, string> = session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
      fetch(`${getApiRoot()}/arena/me`, { headers, credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled) return;
          if (data?.fighter) setFighter(data.fighter);
          else setError("Fighter not found");
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!fighter || loading) return;
    if (phaseIndex >= PHASES.length - 1) return;
    const duration = PHASE_DURATIONS[phase];
    const t = setTimeout(() => setPhaseIndex((i) => i + 1), duration);
    return () => clearTimeout(t);
  }, [fighter, loading, phaseIndex, phase]);

  useEffect(() => {
    if (phase !== "backstory" || !fighter?.backstory) return;
    const full = fighter.backstory;
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setTypedBackstory(full.slice(0, i));
      if (i >= full.length) clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, [phase, fighter?.backstory]);

  const acceptAndEnter = () => router.replace("/dashboard/arena");

  if (loading || error) {
    return (
      <div className="max-w-lg mx-auto rounded-xl bg-[#161b22] border border-white/10 p-8 text-center">
        {error ? <p className="text-red-400">{error}</p> : <p className="text-[#9ca3af]">Loading your fighter…</p>}
        <Link href="/dashboard/arena" className="inline-block mt-4 text-[#f0a500] hover:underline">Back to Arena</Link>
      </div>
    );
  }

  if (!fighter) return null;

  const color = fighter.fighter_color || "#f0a500";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#0f172a]">
      {/* Phase 1 — Darkness */}
      {phase === "darkness" && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-10 animate-pulse">
          <p className="text-white/80 text-lg">Forging your fighter…</p>
        </div>
      )}

      {/* Phase 2 — Silhouette */}
      {phase === "silhouette" && (
        <div className="fixed inset-0 bg-[#0f172a] flex flex-col items-center justify-center z-10">
          <div className="w-48 h-48 rounded-full bg-black/60 border-4 border-white/20 flex items-center justify-center">
            <span className="text-6xl opacity-80">{fighter.avatar}</span>
          </div>
          <div className="w-32 h-2 mt-6 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white/60 rounded-full animate-pulse" style={{ width: "60%" }} />
          </div>
        </div>
      )}

      {/* Phase 3+ — Reveal and content */}
      <div className={`w-full max-w-2xl transition-opacity duration-700 ${phase === "darkness" || phase === "silhouette" ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
        <div className="rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl" style={{ borderColor: phaseIndex >= 3 ? `${color}40` : undefined }}>
          {/* Portrait */}
          <div className="relative bg-[#161b22] p-6 flex flex-col items-center">
            {fighter.portrait_svg ? (
              <div
                className="w-40 h-52 rounded-lg overflow-hidden bg-[#0d1117] [&_svg]:w-full [&_svg]:h-full [&_svg]:object-contain"
                dangerouslySetInnerHTML={{ __html: fighter.portrait_svg }}
              />
            ) : (
              <div className="w-40 h-52 rounded-lg bg-[#0d1117] flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
                <span className="text-6xl">{fighter.avatar}</span>
              </div>
            )}
            {phaseIndex >= 3 && (
              <>
                <h1 className="text-2xl md:text-3xl font-bold text-white mt-4">{fighter.name}</h1>
                {fighter.nickname && <p className="text-lg font-medium mt-1" style={{ color }}>{fighter.nickname}</p>}
              </>
            )}
          </div>

          {/* Stats */}
          {phaseIndex >= 4 && (
            <div className="px-6 pb-4">
              <div className="flex flex-wrap gap-2 mb-2">
                {["strength", "speed", "stamina", "defense", "chin", "special"].map((key, i) => {
                  const val = fighter[key as keyof FighterReveal];
                  const n = typeof val === "number" ? val : 0;
                  return (
                    <div key={key} className="flex items-center gap-1">
                      <span className="text-[#9ca3af] text-xs uppercase">{key.slice(0, 3)}</span>
                      <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-[#f0a500]" style={{ width: `${(n / 99) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[#9ca3af] text-sm">{fighter.style}</p>
            </div>
          )}

          {/* Backstory */}
          {phaseIndex >= 5 && fighter.backstory && (
            <div className="px-6 pb-4 border-t border-white/10 pt-4">
              <p className="text-[#9ca3af] text-xs uppercase mb-1">Origin</p>
              <p className="text-white text-sm">{fighter.origin || "—"}</p>
              <p className="text-[#9ca3af] text-xs uppercase mt-2 mb-1">Backstory</p>
              <p className="text-white/90 text-sm italic">&ldquo;{typedBackstory}&rdquo;</p>
            </div>
          )}

          {/* Signature move */}
          {phaseIndex >= 6 && (
            <div className="px-6 pb-6 border-t border-white/10 pt-4">
              <p className="text-[#f0a500] font-bold text-sm mb-1">SIGNATURE MOVE UNLOCKED</p>
              <p className="text-white font-bold" style={{ color }}>{fighter.signature_move_name || "Finishing Blow"}</p>
              <p className="text-[#9ca3af] text-sm mt-1">{fighter.signature_move_desc || ""}</p>
            </div>
          )}
        </div>

        {/* Final CTA */}
        {phase === "final" && (
          <div className="mt-8 text-center space-y-4">
            <h2 className="text-xl font-bold text-white">THIS IS YOUR FIGHTER</h2>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={acceptAndEnter}
                className="px-8 py-4 rounded-xl bg-[#f0a500] text-black font-bold text-lg hover:bg-[#e09500]"
              >
                I LOVE IT — ENTER THE ARENA
              </button>
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <Link href="/dashboard/arena/create/ai" className="text-[#9ca3af] hover:text-white">
                Regenerate (500 coins)
              </Link>
              <Link href="/dashboard/arena/create/manual" className="text-[#9ca3af] hover:text-white">
                Build manually instead
              </Link>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
