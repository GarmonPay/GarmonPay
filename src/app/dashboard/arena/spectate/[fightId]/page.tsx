"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getApiRoot } from "@/lib/api";
import { getFighterModelUrl } from "@/lib/meshy-assets";
import { logArenaFighterPayload } from "@/lib/arena-merge-fighter";
import { SPECTATE_MESHY_PROOF_GLB_URL } from "@/lib/spectate-meshy-proof";

/** Minimal WebGL proof — no ArenaFight3DView, no ArenaErrorBoundary (🥊 screen). */
const SpectateMeshyProofCanvas = dynamic(
  () =>
    import("@/components/arena/spectate/SpectateMeshyProofCanvas").then((m) => m.SpectateMeshyProofCanvas),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex w-full items-center justify-center rounded-t-xl bg-black text-xs tracking-[0.2em] text-amber-400"
        style={{ minHeight: 380, height: "min(52vh, 520px)" }}
      >
        LOADING WEBGL…
      </div>
    ),
  }
);

type Fighter = {
  id?: string;
  name?: string | null;
  model_3d_url?: string | null;
  model_url?: string | null;
  glb_url?: string | null;
  meshy_glb_url?: string | null;
};

export default function SpectateFightPage() {
  const params = useParams();
  const fightId = params.fightId as string;
  const [fight, setFight] = useState<{
    id: string;
    bettingOpen: boolean;
    winnerId: string | null;
    winnerCpuFighterId?: string | null;
  } | null>(null);
  const [fighterA, setFighterA] = useState<Fighter | null>(null);
  const [fighterB, setFighterB] = useState<Fighter | null>(null);
  const [loading, setLoading] = useState(true);
  const [glbStatus, setGlbStatus] = useState<"loading" | "success" | "failed">("loading");
  const [glbError, setGlbError] = useState<string | null>(null);
  const loadSuccessOnce = useRef(false);

  const fetchFight = useCallback(async () => {
    if (!fightId) return;
    const res = await fetch(`${getApiRoot()}/arena/fights/${fightId}`, { credentials: "include" });
    const data = res.ok ? await res.json().catch(() => null) : null;
    if (!data || !data.fight) {
      console.error("[Arena] Spectate: invalid fight response", data);
    } else if (!data.fighterA || !data.fighterB) {
      console.error("[Arena] Spectate: fight missing fighterA or fighterB", data);
      setFight(null);
      setFighterA(null);
      setFighterB(null);
    } else {
      setFight(data.fight);
      logArenaFighterPayload("spectate GET fighterA", data.fighterA);
      logArenaFighterPayload("spectate GET fighterB", data.fighterB);
      setFighterA(data.fighterA);
      setFighterB(data.fighterB);
    }
    setLoading(false);
  }, [fightId]);

  useEffect(() => {
    fetchFight();
  }, [fetchFight]);

  const apiModelUrl = useMemo(() => {
    const a = fighterA ? getFighterModelUrl(fighterA) : null;
    if (a) return a;
    return fighterB ? getFighterModelUrl(fighterB) : null;
  }, [fighterA, fighterB]);

  /** Prefer live fighter GLB; otherwise Three.js sample (always loads if network allows). */
  const meshyUrl = apiModelUrl ?? SPECTATE_MESHY_PROOF_GLB_URL;
  const sourceLabel = apiModelUrl ? "FIGHTER_API_GLB" : "HARDCODED_PROOF_GLTF";

  useEffect(() => {
    loadSuccessOnce.current = false;
    setGlbStatus("loading");
    setGlbError(null);
  }, [meshyUrl]);

  const onLoadSuccess = useCallback(() => {
    if (loadSuccessOnce.current) return;
    loadSuccessOnce.current = true;
    setGlbStatus("success");
    setGlbError(null);
  }, []);

  const onLoadFailed = useCallback((message: string, failedUrl: string) => {
    console.error("[Spectate] GLB FAILED", { failedUrl, message });
    setGlbStatus("failed");
    setGlbError(`${message} | URL: ${failedUrl}`);
  }, []);

  if (loading || !fightId) {
    return <div className="p-6 text-[#9ca3af]">Loading…</div>;
  }
  if (!fight || !fighterA || !fighterB) {
    return (
      <div className="p-6">
        <p className="text-[#9ca3af]">Fight not found.</p>
        <Link href="/dashboard/arena/spectate" className="mt-2 inline-block text-[#f0a500] hover:underline">
          Back to lobby
        </Link>
      </div>
    );
  }

  const renderMode = glbStatus === "failed" ? "RED_BOX_PLACEHOLDER" : "MESHY_3D";
  const glbLoadText =
    glbStatus === "loading" ? "LOADING…" : glbStatus === "success" ? "SUCCESS" : "FAILED";

  return (
    <div className="flex min-h-[85vh] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#161b22]">
      <div className="border-b border-white/10 p-4 font-mono text-[11px] leading-relaxed text-[#c9d1d9]">
        <div className="text-sm font-semibold text-white">Spectate — Meshy proof (minimal 3D)</div>
        <div className="mt-2 text-[#58a6ff]">MODEL URL: {meshyUrl}</div>
        <div>SOURCE: {sourceLabel}</div>
        <div>RENDER MODE: {renderMode}</div>
        <div>GLB LOAD: {glbLoadText}</div>
        {glbError && <div className="mt-2 max-w-full break-all text-red-400">ERR: {glbError}</div>}
        <div className="mt-2 text-[#9ca3af]">Fight ID: {fight?.id ?? fightId}</div>
      </div>

      <div className="relative w-full">
        <SpectateMeshyProofCanvas modelUrl={meshyUrl} onLoadSuccess={onLoadSuccess} onLoadFailed={onLoadFailed} />
      </div>

      <div className="flex flex-col gap-2 border-t border-white/10 p-4">
        <Link href="/dashboard/arena/spectate" className="text-[#f0a500] hover:underline">
          Back to lobby
        </Link>
        <p className="text-xs text-[#9ca3af]">
          ArenaFight3DView / ArenaFightPresentation / sockets / betting are off until this GLB path is verified live.
        </p>
      </div>
    </div>
  );
}
