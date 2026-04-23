"use client";

import React, { useEffect, useId, useRef, useState } from "react";

export type DiceType =
  | "standard"
  | "gold"
  | "street"
  | "midnight"
  | "blood"
  | "fire"
  | "diamond";

interface Props {
  value: 1 | 2 | 3 | 4 | 5 | 6;
  diceType?: DiceType;
  size?: number;
  rolling?: boolean;
  /** Stagger multi-die tumble (ms). */
  delay?: number;
}

const STYLES: Record<
  DiceType,
  {
    face: string;
    rim: string;
    dot: string;
    dotGlow: string;
    pipShadow: string;
  }
> = {
  standard: {
    face: "linear-gradient(145deg, #EF4444 0%, #B91C1C 45%, #7F1D1D 100%)",
    rim: "linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(0,0,0,0.25) 100%)",
    dot: "#FAFAFA",
    dotGlow: "rgba(255,255,255,0.45)",
    pipShadow: "0 2px 4px rgba(0,0,0,0.55)",
  },
  gold: {
    face: "linear-gradient(145deg, #FDE68A 0%, #F5C842 35%, #B45309 100%)",
    rim: "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(120,53,15,0.5) 100%)",
    dot: "#1C0A00",
    dotGlow: "rgba(28,10,0,0.35)",
    pipShadow: "0 1px 3px rgba(0,0,0,0.4)",
  },
  street: {
    face: "linear-gradient(145deg, #22C55E 0%, #15803D 50%, #14532D 100%)",
    rim: "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(0,0,0,0.35) 100%)",
    dot: "#F0FDF4",
    dotGlow: "rgba(240,253,244,0.35)",
    pipShadow: "0 2px 4px rgba(0,0,0,0.5)",
  },
  midnight: {
    face: "linear-gradient(145deg, #6366F1 0%, #312E81 50%, #1E1B4B 100%)",
    rim: "linear-gradient(180deg, rgba(196,181,253,0.35) 0%, rgba(0,0,0,0.45) 100%)",
    dot: "#E9D5FF",
    dotGlow: "rgba(233,213,255,0.5)",
    pipShadow: "0 2px 5px rgba(0,0,0,0.65)",
  },
  blood: {
    face: "linear-gradient(145deg, #991B1B 0%, #450A0A 100%)",
    rim: "linear-gradient(180deg, rgba(245,200,66,0.25) 0%, rgba(0,0,0,0.5) 100%)",
    dot: "#F5C842",
    dotGlow: "rgba(245,200,66,0.4)",
    pipShadow: "0 2px 4px rgba(0,0,0,0.6)",
  },
  fire: {
    face: "linear-gradient(145deg, #FB923C 0%, #EA580C 45%, #7C2D12 100%)",
    rim: "linear-gradient(180deg, rgba(254,240,138,0.4) 0%, rgba(124,45,18,0.5) 100%)",
    dot: "#FEF9C3",
    dotGlow: "rgba(254,249,195,0.45)",
    pipShadow: "0 2px 4px rgba(0,0,0,0.55)",
  },
  diamond: {
    face: "linear-gradient(145deg, #EFF6FF 0%, #BFDBFE 40%, #60A5FA 100%)",
    rim: "linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(30,58,138,0.35) 100%)",
    dot: "#1E3A8A",
    dotGlow: "rgba(30,58,138,0.25)",
    pipShadow: "0 1px 3px rgba(0,0,0,0.35)",
  },
};

const PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]],
  2: [
    [1, 3],
    [3, 1],
  ],
  3: [
    [1, 3],
    [2, 2],
    [3, 1],
  ],
  4: [
    [1, 1],
    [1, 3],
    [3, 1],
    [3, 3],
  ],
  5: [
    [1, 1],
    [1, 3],
    [2, 2],
    [3, 1],
    [3, 3],
  ],
  6: [
    [1, 1],
    [2, 1],
    [3, 1],
    [1, 3],
    [2, 3],
    [3, 3],
  ],
};

export default function DiceFace({
  value,
  diceType = "standard",
  size = 64,
  rolling = false,
  delay = 0,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const tumbleId = `celoTumble-${uid}`;
  const landId = `celoLand-${uid}`;
  const s = STYLES[diceType];
  const pips = PIPS[value] ?? PIPS[1];
  const r = Math.round(size * 0.18);
  const pipSize = Math.round(size * 0.168);
  const pad = Math.round(size * 0.11);

  const prevRolling = useRef(rolling);
  const [landSeq, setLandSeq] = useState(0);
  useEffect(() => {
    if (prevRolling.current && !rolling) {
      setLandSeq((n) => n + 1);
    }
    prevRolling.current = rolling;
  }, [rolling]);

  const perspective = Math.round(size * 3.2);
  const dieLift = rolling ? 0 : Math.round(size * 0.04);

  return (
    <>
      <style>{`
        @keyframes ${tumbleId} {
          0%   { transform: rotateX(-12deg) rotateY(0deg) rotateZ(0deg) translateY(0) scale(1); filter: blur(0.5px); }
          12%  { transform: rotateX(38deg) rotateY(52deg) rotateZ(-18deg) translateY(-${Math.max(4, Math.round(size * 0.06))}px) scale(1.04); filter: blur(0.35px); }
          28%  { transform: rotateX(-22deg) rotateY(118deg) rotateZ(24deg) translateY(${Math.round(size * 0.02)}px) scale(0.97); filter: blur(0.45px); }
          44%  { transform: rotateX(55deg) rotateY(200deg) rotateZ(-32deg) translateY(-${Math.round(size * 0.05)}px) scale(1.06); filter: blur(0.3px); }
          60%  { transform: rotateX(-35deg) rotateY(290deg) rotateZ(18deg) translateY(${Math.round(size * 0.03)}px) scale(0.98); filter: blur(0.4px); }
          78%  { transform: rotateX(28deg) rotateY(380deg) rotateZ(-12deg) translateY(-${Math.round(size * 0.025)}px) scale(1.02); filter: blur(0.2px); }
          100% { transform: rotateX(-12deg) rotateY(440deg) rotateZ(6deg) translateY(0) scale(1); filter: blur(0.35px); }
        }
        @keyframes ${landId} {
          0%   { transform: rotateX(-8deg) rotateY(8deg) scale(1.12) translateY(-${Math.round(size * 0.12)}px); filter: blur(0.25px); }
          55%  { transform: rotateX(2deg) rotateY(-2deg) scale(0.94) translateY(${Math.round(size * 0.04)}px); filter: blur(0.05px); }
          100% { transform: rotateX(0deg) rotateY(0deg) scale(1) translateY(0); filter: blur(0); }
        }
      `}</style>
      <div
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          perspective,
          perspectiveOrigin: "50% 88%",
        }}
      >
        <div
          key={landSeq}
          style={{
            width: size,
            height: size,
            borderRadius: r,
            transformStyle: "preserve-3d",
            willChange: rolling ? "transform, filter" : "transform",
            transform: rolling
              ? undefined
              : `translateY(${dieLift}px) rotateX(0deg)`,
            animation: rolling
              ? `${tumbleId} 1.05s cubic-bezier(0.45, 0.05, 0.2, 1) ${delay}ms infinite both`
              : `${landId} 0.48s cubic-bezier(0.34, 1.15, 0.64, 1) both`,
            boxShadow: rolling
              ? `
                0 ${Math.round(size * 0.2)}px ${Math.round(size * 0.45)}px rgba(0,0,0,0.55),
                0 ${Math.round(size * 0.06)}px ${Math.round(size * 0.14)}px rgba(245,200,90,0.12),
                inset 0 2px 0 rgba(255,255,255,0.22),
                inset 0 -3px 6px rgba(0,0,0,0.35)
              `
              : `
                0 ${Math.round(size * 0.14)}px ${Math.round(size * 0.28)}px rgba(0,0,0,0.6),
                0 ${Math.round(size * 0.04)}px ${Math.round(size * 0.1)}px rgba(245,200,90,0.14),
                inset 0 2px 0 rgba(255,255,255,0.25),
                inset 0 -4px 8px rgba(0,0,0,0.38)
              `,
            border: "1px solid rgba(0,0,0,0.35)",
            position: "relative",
            background: s.rim,
            padding: 1,
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: r - 1,
              background: s.face,
              position: "relative",
              overflow: "hidden",
              boxShadow: "inset 0 3px 10px rgba(255,255,255,0.18), inset 0 -6px 14px rgba(0,0,0,0.35)",
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(125deg, rgba(255,255,255,0.2) 0%, transparent 42%, transparent 58%, rgba(0,0,0,0.12) 100%)",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: pad,
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gridTemplateRows: "repeat(3,1fr)",
              }}
            >
              {[1, 2, 3].map((row) =>
                [1, 2, 3].map((col) => {
                  const has = pips.some(([r2, c]) => r2 === row && c === col);
                  return (
                    <div
                      key={`${row}-${col}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {has && (
                        <div
                          style={{
                            width: pipSize,
                            height: pipSize,
                            borderRadius: "50%",
                            background: `radial-gradient(circle at 32% 32%, ${s.dotGlow}, ${s.dot} 55%, ${s.dot} 100%)`,
                            boxShadow: `${s.pipShadow}, inset 0 -1px 1px rgba(0,0,0,0.35)`,
                          }}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
