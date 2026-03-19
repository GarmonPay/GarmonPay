"use client";

import dynamic from "next/dynamic";
import React, { forwardRef, useRef, useImperativeHandle } from "react";
import type { RefereeState } from "@/components/arena/Referee3D";

const BoxerDisplay = dynamic(
  () => import("@/components/arena/BoxerDisplay"),
  { ssr: false }
);

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

const ArenaFight3DViewClient = forwardRef<
  { shake: () => void },
  ArenaFight3DViewProps
>(function ArenaFight3DViewClient(
  {
    fighterAModelUrl,
    fighterBModelUrl,
  },
  ref
) {
  useImperativeHandle(ref, () => ({ shake: () => {} }));

  return (
    <div style={{ display: "flex", gap: 24, justifyContent: "center", alignItems: "center", minHeight: 320, padding: 24, background: "radial-gradient(ellipse at 50% 0%, #1a0808, #000)" }}>
      <div style={{ flex: 1, maxWidth: 280 }}>
        <BoxerDisplay
          fighter={{ model_3d_url: fighterAModelUrl ?? undefined, fighter_color: "#f0a500" }}
          size="medium"
          facingRight={false}
        />
      </div>
      <span style={{ color: "#f0a500", fontWeight: 800, fontSize: 18 }}>VS</span>
      <div style={{ flex: 1, maxWidth: 280 }}>
        <BoxerDisplay
          fighter={{ model_3d_url: fighterBModelUrl ?? undefined, fighter_color: "#c1272d" }}
          size="medium"
          facingRight
        />
      </div>
    </div>
  );
});

export default ArenaFight3DViewClient;
