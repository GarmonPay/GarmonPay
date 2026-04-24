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

/** +Z = toward viewer; pips: front=1, back=6, right=2, left=5, top=3, bottom=4. */
const FINAL: Record<1 | 2 | 3 | 4 | 5 | 6, { rx: number; ry: number }> = {
  1: { rx: 0, ry: 0 },
  2: { rx: 0, ry: -90 },
  3: { rx: -90, ry: 0 },
  4: { rx: 90, ry: 0 },
  5: { rx: 0, ry: 90 },
  6: { rx: 0, ry: 180 },
};

type FaceId = "front" | "back" | "right" | "left" | "top" | "bottom";
const FACE_PIP: Record<FaceId, 1 | 2 | 3 | 4 | 5 | 6> = {
  front: 1,
  back: 6,
  right: 2,
  left: 5,
  top: 3,
  bottom: 4,
};

function PipsOnFace({
  v,
  st,
  pipSize,
  pad,
}: {
  v: 1 | 2 | 3 | 4 | 5 | 6;
  st: (typeof STYLES)[DiceType];
  pipSize: number;
  pad: number;
}) {
  const pips = PIPS[v] ?? PIPS[1];
  return (
    <div
      className="absolute"
      style={{
        inset: pad,
        top: 1,
        left: 1,
        right: 1,
        bottom: 1,
        display: "grid",
        gridTemplateColumns: "repeat(3,1fr)",
        gridTemplateRows: "repeat(3,1fr)",
      }}
    >
      {[1, 2, 3].map((row) =>
        [1, 2, 3].map((col) => {
          const has = pips.some(([r, c]) => r === row && c === col);
          return (
            <div
              key={`${row}-${col}`}
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {has && (
                <div
                  style={{
                    width: pipSize,
                    height: pipSize,
                    borderRadius: "50%",
                    background: `radial-gradient(circle at 32% 32%, ${st.dotGlow}, ${st.dot} 55%, ${st.dot} 100%)`,
                    boxShadow: `${st.pipShadow}, inset 0 -1px 1px rgba(0,0,0,0.35)`,
                  }}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export default function DiceFace({
  value,
  diceType = "standard",
  size = 64,
  rolling = false,
  delay = 0,
}: Props) {
  const id = useId().replace(/:/g, "");
  const slug = `d3d-${id}`;
  const s = STYLES[diceType];
  const r = Math.round(size * 0.1);
  const pipSize = Math.round(size * 0.16);
  const pad = Math.round(size * 0.11);
  const hz = size / 2;
  const fin = FINAL[value] ?? { rx: 0, ry: 0 };
  const settledT = `rotateX(${fin.rx}deg) rotateY(${fin.ry}deg)`;
  const [bump, setBump] = useState(0);
  const wasRolling = useRef(rolling);

  useEffect(() => {
    if (wasRolling.current && !rolling) {
      setBump((b) => b + 1);
    }
    wasRolling.current = rolling;
  }, [rolling]);

  return (
    <>
      <style>{`
        @keyframes ${slug}-tumble {
          0%   { transform: translateZ(${Math.round(hz * 0.1)}px) rotateX(12deg) rotateY(0deg); }
          20%  { transform: translateZ(${Math.round(hz * 0.22)}px) rotateX(-32deg) rotateY(200deg); }
          40%  { transform: translateZ(0) rotateX(28deg) rotateY(400deg); }
          60%  { transform: translateZ(${Math.round(hz * 0.15)}px) rotateX(-20deg) rotateY(600deg); }
          80%  { transform: translateZ(0) rotateX(8deg) rotateY(800deg); }
          100% { transform: translateZ(0) rotateX(0deg) rotateY(900deg); }
        }
        @keyframes ${slug}-bounce {
          0% { transform: translateY(0) scale(1.1); }
          40% { transform: translateY(${Math.max(2, size * 0.07)}px) scale(0.94); }
          70% { transform: translateY(-${Math.max(1, size * 0.04)}px) scale(1.04); }
          100% { transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        className="relative"
        style={{
          width: size * 1.1,
          height: size * 1.1,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 2px",
        }}
      >
        <div
          key={bump}
          style={{
            position: "relative" as const,
            width: size * 1.1,
            height: size * 1.1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: !rolling
              ? `${slug}-bounce 0.4s cubic-bezier(0.36, 1, 0.4, 1) both`
              : undefined,
            transformStyle: "preserve-3d" as const,
            WebkitTransformStyle: "preserve-3d",
            perspective: Math.max(500, size * 9),
            WebkitPerspective: Math.max(500, size * 9),
            perspectiveOrigin: "50% 55%",
            overflow: "visible",
          }}
        >
          <div
            style={
              {
                position: "relative" as const,
                width: size,
                height: size,
                transformStyle: "preserve-3d" as const,
                WebkitTransformStyle: "preserve-3d" as const,
                transform: rolling ? undefined : settledT,
                WebkitTransform: rolling ? undefined : settledT,
                transition: rolling
                  ? undefined
                  : "transform 0.18s ease-out, -webkit-transform 0.18s ease-out",
                willChange: rolling ? "transform" : undefined,
                WebkitBackfaceVisibility: "hidden",
                backfaceVisibility: "hidden",
                animation: rolling
                  ? `${slug}-tumble 1.7s ease-out infinite`
                  : undefined,
                WebkitAnimation: rolling
                  ? `${slug}-tumble 1.7s ease-out infinite`
                  : undefined,
                animationDelay: `${delay}ms`,
                WebkitAnimationDelay: `${delay}ms`,
              } as React.CSSProperties
            }
          >
            {(Object.keys(FACE_PIP) as FaceId[]).map((k) => {
              const pval = FACE_PIP[k];
              let t = "";
              if (k === "front") t = `translateZ(${hz}px)`;
              if (k === "back") t = `translateZ(-${hz}px) rotateY(180deg)`;
              if (k === "right") t = `translateX(${hz}px) rotateY(90deg)`;
              if (k === "left") t = `translateX(-${hz}px) rotateY(-90deg)`;
              if (k === "top") t = `translateY(-${hz}px) rotateX(90deg)`;
              if (k === "bottom") t = `translateY(${hz}px) rotateX(-90deg)`;
              return (
                <div
                  key={k}
                  style={
                    {
                      position: "absolute" as const,
                      left: 0,
                      top: 0,
                      width: size,
                      height: size,
                      transform: t,
                      WebkitTransform: t,
                      transformStyle: "preserve-3d",
                      WebkitBackfaceVisibility: "hidden",
                      backfaceVisibility: "hidden",
                      background: s.rim,
                      border: "1px solid rgba(0,0,0,0.38)",
                      borderRadius: r,
                      boxShadow: "0 0 0 0.5px rgba(0,0,0,0.2)",
                    } as React.CSSProperties
                  }
                >
                  <div
                    className="absolute"
                    style={{
                      inset: 0,
                      borderRadius: r,
                      background: s.face,
                    }}
                  />
                  <PipsOnFace v={pval} st={s} pipSize={pipSize} pad={pad} />
                  <div
                    className="pointer-events-none absolute rounded-[inherit]"
                    style={{
                      inset: 0,
                      background:
                        "linear-gradient(125deg, rgba(255,255,255,0.18) 0%, transparent 40%, rgba(0,0,0,0.1) 100%)",
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
