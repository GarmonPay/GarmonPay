"use client";

import dynamic from "next/dynamic";
import React, { forwardRef, useImperativeHandle } from "react";
import type { RefereeState } from "@/components/arena/Referee3D";

const ArenaFightPresentation = dynamic(
  () => import("@/components/arena/arena-presentation/ArenaFightPresentation"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[380px] w-full items-center justify-center rounded-t-xl bg-black text-[10px] tracking-[0.25em] text-amber-400">
        LOADING ARENA…
      </div>
    ),
  }
);

export type ArenaFight3DViewProps = {
  fighterAModelUrl?: string | null;
  fighterBModelUrl?: string | null;
  fighterAName?: string;
  fighterBName?: string;
  fighterAAnim?: string;
  fighterBAnim?: string;
  healthA?: number;
  healthB?: number;
  staminaA?: number;
  staminaB?: number;
  refereeState?: RefereeState;
  winnerSide?: "left" | "right" | null;
  knockdownCount?: number;
  modelGenerating?: boolean;
  mode?: string;
  koIntensity?: number;
  exchangeKey?: number;
  lastHitSide?: "left" | "right" | null;
  modelLoading?: boolean;
  meshyRingUrl?: string | null;
};

const ArenaFight3DViewClient = forwardRef<{ shake: () => void }, ArenaFight3DViewProps>(
  function ArenaFight3DViewClient(
    {
      fighterAModelUrl,
      fighterBModelUrl,
      fighterAName,
      fighterBName,
      fighterAAnim,
      fighterBAnim,
      healthA,
      healthB,
      staminaA,
      staminaB,
      mode,
      koIntensity,
      exchangeKey,
      lastHitSide,
      modelLoading,
      meshyRingUrl,
    },
    ref
  ) {
    useImperativeHandle(ref, () => ({ shake: () => {} }));

    return (
      <ArenaFightPresentation
        fighterAModelUrl={fighterAModelUrl}
        fighterBModelUrl={fighterBModelUrl}
        fighterAName={fighterAName}
        fighterBName={fighterBName}
        fighterAAnim={fighterAAnim}
        fighterBAnim={fighterBAnim}
        healthA={healthA}
        healthB={healthB}
        staminaA={staminaA}
        staminaB={staminaB}
        mode={mode}
        koIntensity={koIntensity}
        exchangeKey={exchangeKey}
        lastHitSide={lastHitSide}
        modelLoading={modelLoading}
        meshyRingUrl={meshyRingUrl}
      />
    );
  }
);

export default ArenaFight3DViewClient;
