"use client";

import React, { forwardRef, useRef, useImperativeHandle } from "react";
import { BoxingRing3D, FighterModelInRing } from "@/components/arena/BoxingRing3D";
import type { RefereeState } from "@/components/arena/Referee3D";

type ArenaFight3DViewProps = {
  fighterAModelUrl?: string | null;
  fighterBModelUrl?: string | null;
  fighterAAnim?: string;
  fighterBAnim?: string;
  refereeState?: RefereeState;
  winnerSide?: "left" | "right" | null;
  knockdownCount?: number;
  modelGenerating?: boolean;
  mode?: string;
  koIntensity?: number;
};

function animTo3D(a: string): string {
  return a === "ko" ? "ko" : a === "big_hit" ? "hit" : "idle";
}

export const ArenaFight3DView = forwardRef<{ shake: () => void }, ArenaFight3DViewProps>(
  function ArenaFight3DView(
    {
      fighterAModelUrl,
      fighterBModelUrl,
      fighterAAnim = "idle",
      fighterBAnim = "idle",
      refereeState = "watching",
      winnerSide = null,
      knockdownCount = 0,
      modelGenerating = false,
      mode = "fight",
      koIntensity = 0,
    },
    ref
  ) {
    const ring3dRef = useRef<{ shake: () => void } | null>(null);
    useImperativeHandle(ref, () => ({
      shake: () => ring3dRef.current?.shake?.(),
    }));

    return (
      <BoxingRing3D
        ref={ring3dRef}
        mode={mode as "fight" | "setup" | "victory"}
        koIntensity={koIntensity}
        refereeState={refereeState}
        winnerSide={winnerSide}
        knockdownCount={knockdownCount}
        modelGenerating={modelGenerating}
        fighterASlot={
          <FighterModelInRing
            modelUrl={fighterAModelUrl}
            color="#f0a500"
            animation={animTo3D(fighterAAnim)}
          />
        }
        fighterBSlot={
          <FighterModelInRing
            modelUrl={fighterBModelUrl}
            color="#c1272d"
            animation={animTo3D(fighterBAnim)}
          />
        }
      />
    );
  }
);
