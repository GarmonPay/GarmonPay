"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getSessionAsync } from "@/lib/session";
import { getApiRoot } from "@/lib/api";
import { getHasWebGL } from "@/lib/webgl-detect";
import { BoxingRing } from "@/components/arena/BoxingRing";
import type { FighterData } from "@/lib/arena-fighter-types";

const Fighter3D = dynamic(() => import("@/components/arena/Fighter3D"), { ssr: false });

const REGEN_COST = 500;
const POLL_3D_INTERVAL_MS = 15_000;

export default function MyFighterPage() {
  const router = useRouter();
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [fighter, setFighter] = useState<FighterData | null>(null);
  const [arenaCoins, setArenaCoins] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [regenModal, setRegenModal] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState("");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [threeDProgress, setThreeDProgress] = useState<number>(0);
  const poll3dRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMe = useCallback(async () => {
    try {
      const s = await getSessionAsync();
      if (!s) {
        setLoading(false);
        router.replace("/login?next=/dashboard/arena/fighter");
        return;
      }
      setSession(s);
      const token = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      const res = await fetch(`${getApiRoot()}/arena/me`, {
        headers: isToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token },
        credentials: "include",
      });
      if (res.status === 401) {
        setLoading(false);
        router.replace("/login?next=/dashboard/arena/fighter");
        return;
      }
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (data?.fighter) setFighter(data.fighter);
      if (typeof data?.arenaCoins === "number") setArenaCoins(data.arenaCoins);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 10000);
    fetchMe();
    return () => clearTimeout(t);
  }, [fetchMe]);

  const poll3dStatus = useCallback(() => {
    const f = fighter as (FighterData & { model_3d_task_id?: string | null }) | null;
    const taskId = f?.model_3d_task_id;
    if (!taskId || !session) return;
    const token = session.accessToken ?? session.userId;
    const headers: Record<string, string> = session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
    fetch(`${getApiRoot()}/arena/fighter/3d-status?taskId=${encodeURIComponent(taskId)}`, { headers, credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { status?: string; progress?: number; modelUrl?: string; thumbnail?: string } | null) => {
        if (!data) return;
        if (data.status === "complete") {
          setFighter((prev) =>
            prev
              ? {
                  ...prev,
                  model_3d_url: data.modelUrl ?? (prev as { model_3d_url?: string }).model_3d_url,
                  model_3d_status: "complete",
                  model_thumbnail_url: data.thumbnail ?? (prev as { model_thumbnail_url?: string }).model_thumbnail_url,
                  model_3d_task_id: null,
                }
              : null
          );
          if (poll3dRef.current) {
            clearInterval(poll3dRef.current);
            poll3dRef.current = null;
          }
          fetchMe();
          return;
        }
        if (data.status === "failed") {
          setFighter((prev) => (prev ? { ...prev, model_3d_status: "failed" } : null));
          if (poll3dRef.current) {
            clearInterval(poll3dRef.current);
            poll3dRef.current = null;
          }
          fetchMe();
          return;
        }
        if (data.status === "generating" && typeof data.progress === "number") {
          setThreeDProgress(data.progress);
        }
      })
      .catch(() => {});
  }, [fighter, session, fetchMe]);

  useEffect(() => {
    const f = fighter as (FighterData & { model_3d_status?: string; model_3d_task_id?: string | null }) | null;
    const shouldPoll =
      f?.model_3d_task_id != null &&
      f?.model_3d_status !== "succeeded" &&
      f?.model_3d_status !== "failed" &&
      f?.model_3d_status !== "complete";
    if (!shouldPoll) {
      if (poll3dRef.current) {
        clearInterval(poll3dRef.current);
        poll3dRef.current = null;
      }
      return;
    }
    poll3dStatus();
    poll3dRef.current = setInterval(poll3dStatus, POLL_3D_INTERVAL_MS);
    return () => {
      if (poll3dRef.current) clearInterval(poll3dRef.current);
    };
  }, [fighter?.id, fighter?.model_3d_status, fighter?.model_3d_task_id, poll3dStatus]); // eslint-disable-line react-hooks/exhaustive-deps -- poll when generating

  const handleGenerate3D = async () => {
    if (!session || !fighter) return;
    setGenerationError(null);
    const token = session.accessToken ?? session.userId;
    const headers: Record<string, string> = session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
    try {
      const res = await fetch(`${getApiRoot()}/arena/fighter/generate-3d`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        credentials: "include",
        body: JSON.stringify({ fighterId: fighter.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenerationError(data.message || "3D generation is currently unavailable. Please try again later.");
        return;
      }
      if (data.taskId) {
        setFighter((prev) =>
          prev
            ? {
                ...prev,
                model_3d_task_id: data.taskId,
                model_3d_status: "generating",
              }
            : null
        );
        setThreeDProgress(0);
      } else {
        setGenerationError("3D generation is currently unavailable. Please try again later.");
      }
    } catch {
      setGenerationError("3D generation is currently unavailable. Please try again later.");
    }
  };

  const handleRegenerate = async () => {
    if (!session || !fighter) return;
    setRegenError("");
    setRegenLoading(true);
    const token = session.accessToken ?? session.userId;
    const headers: Record<string, string> = session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
    try {
      const res = await fetch(`${getApiRoot()}/arena/fighter/ai-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        credentials: "include",
        body: JSON.stringify({
          method: "auto",
          username: fighter.name || "Fighter",
          regeneration: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        setRegenError("You need 500 coins. Get more in the Store.");
        setRegenLoading(false);
        return;
      }
      if (!res.ok) {
        setRegenError(data.error || "Try again in a moment.");
        setRegenLoading(false);
        return;
      }
      setRegenModal(false);
      router.push("/dashboard/arena/create/reveal");
    } catch {
      setRegenError("Something went wrong.");
      setRegenLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl bg-[#161b22] border border-white/10 p-8 text-center">
        <p className="text-[#9ca3af]">Loading…</p>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="rounded-xl bg-[#161b22] border border-white/10 p-8 text-center">
        <p className="text-[#9ca3af]">Redirecting to login…</p>
      </div>
    );
  }
  if (!fighter) {
    return (
      <div className="p-6">
        <p className="text-[#9ca3af] mb-4">You don’t have a fighter yet.</p>
        <Link href="/dashboard/arena/create" className="text-[#f0a500] hover:underline">Create fighter</Link>
      </div>
    );
  }

  const totalStats = (fighter.strength ?? 0) + (fighter.speed ?? 0) + (fighter.stamina ?? 0) + (fighter.defense ?? 0) + (fighter.chin ?? 0) + (fighter.special ?? 0);
  const wins = fighter.wins ?? 0;
  const losses = fighter.losses ?? 0;
  const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) : "—";

  const fighterData: FighterData = {
    ...fighter,
    name: fighter?.name ?? "Fighter",
    style: fighter?.style ?? "Boxer",
    avatar: fighter?.avatar ?? "🥊",
    strength: fighter?.strength ?? 48,
    speed: fighter?.speed ?? 48,
    stamina: fighter?.stamina ?? 48,
    defense: fighter?.defense ?? 48,
    chin: fighter?.chin ?? 48,
    special: fighter?.special ?? 20,
    wins: fighter?.wins ?? 0,
    losses: fighter?.losses ?? 0,
    body_type: (fighter?.body_type as FighterData["body_type"]) ?? "middleweight",
    skin_tone: (fighter?.skin_tone as FighterData["skin_tone"]) ?? "tone3",
    face_style: (fighter?.face_style as FighterData["face_style"]) ?? "determined",
    hair_style: (fighter?.hair_style as FighterData["hair_style"]) ?? "short_fade",
    equipped_gloves: (fighter?.equipped_gloves as FighterData["equipped_gloves"]) ?? "default",
    equipped_shoes: (fighter?.equipped_shoes as FighterData["equipped_shoes"]) ?? "default",
    equipped_shorts: (fighter?.equipped_shorts as FighterData["equipped_shorts"]) ?? "default",
    equipped_headgear: (fighter?.equipped_headgear as FighterData["equipped_headgear"]) ?? "none",
  };

  const model3dStatus = (fighter as { model_3d_status?: string }).model_3d_status ?? "not_started";
  const model3dUrl = (fighter as { model_3d_url?: string | null }).model_3d_url;
  const modelThumbnailUrl = (fighter as { model_thumbnail_url?: string | null }).model_thumbnail_url;
  const fighterColor = (fighter as { fighter_color?: string }).fighter_color ?? "#f0a500";
  const useWebGL = getHasWebGL();

  const renderFighterVisual = () => {
    if (!useWebGL) {
      return (
        <div className="flex-1 min-h-[260px] md:min-h-[320px] relative">
          <BoxingRing mode="profile" fighterA={fighterData} animation="idle" />
          {model3dStatus === "not_started" && (
            <div className="absolute bottom-2 left-2 right-2 md:left-auto md:right-2 md:w-48">
              <button type="button" onClick={handleGenerate3D} className="w-full py-2 rounded-lg bg-[#f0a500] text-black font-medium text-sm hover:bg-[#e09500]">
                Generate My 3D Fighter
              </button>
              {generationError && <p className="text-red-400 text-xs mt-1">{generationError}</p>}
            </div>
          )}
        </div>
      );
    }
    if (model3dStatus === "complete" && model3dUrl) {
      return (
        <Fighter3D
          modelUrl={model3dUrl}
          thumbnailUrl={modelThumbnailUrl}
          fighterColor={fighterColor}
          size="medium"
          fallback={
            <div className="flex-1 min-h-[260px] md:min-h-[320px] flex items-center justify-center bg-[#0d1117]">
              <BoxingRing mode="profile" fighterA={fighterData} animation="idle" />
            </div>
          }
        />
      );
    }
    if (model3dStatus === "generating") {
      return (
        <div className="flex-1 min-h-[260px] md:min-h-[320px] flex flex-col items-center justify-center bg-[#0d1117] border-b border-white/10">
          <div className="generating-3d-banner flex items-center gap-4 p-4 rounded-xl bg-[#161b22] border border-white/10 max-w-md">
            <div className="w-10 h-10 border-2 border-[#f0a500] border-t-transparent rounded-full animate-spin" />
            <div>
              <p className="text-white font-medium">⚡ Your 3D fighter is being forged...</p>
              <p className="text-[#f0a500] text-sm">{threeDProgress}% complete</p>
              <p className="text-[#9ca3af] text-xs">Usually takes 1-3 minutes</p>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex-1 min-h-[260px] md:min-h-[320px] relative">
        {useWebGL ? (
          <Fighter3D
            modelUrl={null}
            thumbnailUrl={null}
            fighterColor={fighterColor}
            size="medium"
            fallback={
              <div className="flex-1 min-h-[260px] md:min-h-[320px] flex items-center justify-center bg-[#0d1117]">
                <BoxingRing mode="profile" fighterA={fighterData} animation="idle" />
              </div>
            }
          />
        ) : (
          <BoxingRing mode="profile" fighterA={fighterData} animation="idle" />
        )}
        {model3dStatus === "not_started" && (
          <div className="absolute bottom-2 left-2 right-2 md:left-auto md:right-2 md:w-48">
            <button
              type="button"
              onClick={handleGenerate3D}
              className="w-full py-2 rounded-lg bg-[#f0a500] text-black font-medium text-sm hover:bg-[#e09500]"
            >
              Generate My 3D Fighter
            </button>
            {generationError && <p className="text-red-400 text-xs mt-1">{generationError}</p>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-[#161b22] border border-white/10 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-stretch gap-0">
          <div className="flex-1 relative">
            {renderFighterVisual()}
          </div>
          <div className="flex-1 p-6 flex flex-col justify-center border-t md:border-t-0 md:border-l border-white/10">
            <span className="text-5xl">{fighter.avatar}</span>
            <h1 className="text-2xl font-bold text-white mt-2">{fighter.name}</h1>
            {(fighter as { nickname?: string | null }).nickname && (
              <p className="text-lg font-medium mt-0.5" style={{ color: (fighter as { fighter_color?: string }).fighter_color || "#f0a500" }}>
                {(fighter as { nickname?: string }).nickname}
              </p>
            )}
            {fighter.title && <p className="text-[#f0a500]">{fighter.title}</p>}
            <p className="text-[#9ca3af]">{fighter.style}</p>
            {(fighter as { origin?: string | null }).origin && (
              <p className="text-sm text-[#9ca3af]">Fighting out of {(fighter as { origin?: string }).origin}</p>
            )}
            <p className="text-white mt-1">Record: {wins}W – {losses}L ({winRate}% win rate) · Streak: {fighter.win_streak ?? 0}</p>
            <p className="text-sm text-[#9ca3af]">Condition: {fighter.condition ?? "—"} · Training sessions: {fighter.training_sessions ?? 0}</p>
            {(fighter as { backstory?: string | null }).backstory && (
              <div className="mt-3 p-3 rounded-lg bg-[#0d1117] border border-white/10">
                <p className="text-[#9ca3af] text-xs uppercase mb-1">Backstory</p>
                <p className="text-white/90 text-sm italic">&ldquo;{(fighter as { backstory?: string }).backstory}&rdquo;</p>
              </div>
            )}
            {(fighter as { signature_move_name?: string | null }).signature_move_name && (
              <div className="mt-2 p-3 rounded-lg bg-[#0d1117] border border-white/10">
                <p className="text-[#f0a500] font-bold text-sm">{(fighter as { signature_move_name?: string }).signature_move_name}</p>
                {(fighter as { signature_move_desc?: string | null }).signature_move_desc && (
                  <p className="text-[#9ca3af] text-xs mt-1">{(fighter as { signature_move_desc?: string }).signature_move_desc}</p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mt-4">
              {(["strength", "speed", "stamina", "defense", "chin", "special"] as const).map((stat) => (
                <div key={stat} className="bg-[#0d1117] rounded-lg p-3">
                  <p className="text-[#9ca3af] text-xs capitalize">{stat}</p>
                  <p className="text-lg font-bold text-white">{fighter[stat] ?? 0}</p>
                  <div className="h-1.5 mt-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#3b82f6] rounded-full" style={{ width: `${Math.min(100, ((fighter[stat] ?? 0) / 99) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[#9ca3af] text-sm mt-2">Total stats: {totalStats} (weight class by total)</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/dashboard/arena/train" className="px-4 py-2 rounded-lg bg-[#3b82f6] text-white font-medium">Training Gym</Link>
              <Link href="/dashboard/arena" className="px-4 py-2 rounded-lg border border-white/20 text-white">Back to Arena</Link>
              <button
                type="button"
                onClick={() => setRegenModal(true)}
                className="px-4 py-2 rounded-lg border border-white/20 text-[#9ca3af] hover:text-white hover:bg-white/5 text-sm"
              >
                Regenerate with AI (500 coins)
              </button>
            </div>
            {regenModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => !regenLoading && setRegenModal(false)}>
                <div className="rounded-xl bg-[#161b22] border border-white/10 p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-white mb-2">Regenerate with AI?</h3>
                  <p className="text-[#9ca3af] text-sm mb-4">
                    This will replace your fighter&apos;s appearance, name, and backstory. Stats and record are kept. Costs 500 coins. You have {arenaCoins} coins.
                  </p>
                  {regenError && <p className="text-red-400 text-sm mb-2">{regenError}</p>}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={regenLoading || arenaCoins < REGEN_COST}
                      onClick={handleRegenerate}
                      className="flex-1 py-2 rounded-lg bg-[#f0a500] text-black font-medium disabled:opacity-50"
                    >
                      {regenLoading ? "Generating…" : "Continue"}
                    </button>
                    <button type="button" onClick={() => setRegenModal(false)} disabled={regenLoading} className="px-4 py-2 rounded-lg border border-white/20 text-white">
                      Cancel
                    </button>
                  </div>
                  {arenaCoins < REGEN_COST && <Link href="/dashboard/arena/store" className="block text-center text-[#f0a500] text-sm mt-2 hover:underline">Buy coins</Link>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
