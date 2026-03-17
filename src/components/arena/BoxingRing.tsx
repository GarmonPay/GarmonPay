"use client";

import React from "react";
import { FighterDisplay } from "@/components/arena/FighterLayers";
import type { FighterData } from "@/lib/arena-fighter-types";

export type RingAnimationState = "idle" | "fight" | "victory" | "setup" | "profile" | "pre_fight" | "big_hit" | "ko";

type BoxingRingProps = {
  mode?: RingAnimationState;
  fighterA: FighterData;
  fighterB?: FighterData | null;
  winner?: "a" | "b" | null;
  currentRound?: number;
  animation?: RingAnimationState;
  fighterAAnimation?: string;
  fighterBAnimation?: string;
  healthA?: number;
  healthB?: number;
  lastAction?: { actionA?: string; actionB?: string; damageAtoB?: number; damageBtoA?: number } | string | null;
  children?: React.ReactNode;
};

export function BoxingRing({
  mode = "idle",
  fighterA,
  fighterB = null,
  winner = null,
  currentRound = 1,
  animation = "idle",
  fighterAAnimation = "idle",
  fighterBAnimation = "idle",
  healthA = 100,
  healthB = 100,
  lastAction = null,
  children,
}: BoxingRingProps) {
  const isProfile = mode === "profile";
  const fa = fighterA ?? ({ name: "Fighter A", body_type: "middleweight", skin_tone: "tone3", equipped_gloves: "default", equipped_shorts: "default", equipped_shoes: "default" } as FighterData);
  const fb = fighterB ?? (isProfile ? null : ({ name: "Fighter B", body_type: "middleweight", skin_tone: "tone4", equipped_gloves: "default", equipped_shorts: "default", equipped_shoes: "default" } as FighterData));

  return (
    <div className="flex flex-col rounded-xl bg-[#0d1117] border border-white/10 overflow-hidden">
      <div className={`min-h-[200px] flex items-center justify-center gap-6 p-6 ${isProfile ? "py-8" : ""}`} style={{ background: "linear-gradient(180deg, #1a1008 0%, #0d1117 100%)" }}>
        <div className="flex items-end justify-center gap-4 md:gap-8">
          <div className="flex flex-col items-center">
            {healthA !== undefined && healthA !== 100 && !isProfile && (
              <div className="w-20 h-2 bg-[#1f2937] rounded-full overflow-hidden mb-1">
                <div className="h-full bg-[#22c55e]" style={{ width: `${Math.max(0, healthA)}%` }} />
              </div>
            )}
            <FighterDisplay fighter={fa} size={isProfile ? "large" : "medium"} animation={fighterAAnimation || animation} showGear />
            {!isProfile && <span className="text-xs text-[#9ca3af] mt-1">{fa.name}</span>}
          </div>
          {!isProfile && <span className="text-[#f0a500] font-medium pb-8">vs</span>}
          {fb && (
            <div className="flex flex-col items-center">
              {healthB !== undefined && healthB !== 100 && !isProfile && (
                <div className="w-20 h-2 bg-[#1f2937] rounded-full overflow-hidden mb-1">
                  <div className="h-full bg-[#ef4444]" style={{ width: `${Math.max(0, healthB)}%` }} />
                </div>
              )}
              <FighterDisplay fighter={fb} size={isProfile ? "large" : "medium"} animation={fighterBAnimation || animation} showGear mirrored />
              {!isProfile && <span className="text-xs text-[#9ca3af] mt-1">{fb.name}</span>}
            </div>
          )}
        </div>
      </div>
      {children && <div className="p-4 border-t border-white/10">{children}</div>}
    </div>
  );
}
