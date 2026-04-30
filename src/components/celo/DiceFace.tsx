"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";

export type DiceType =
  | "standard"
  | "gold"
  | "street"
  | "midnight"
  | "blood"
  | "fire"
  | "diamond";

export type TumbleVariant = "a" | "b" | "c";

interface Props {
  /** Settled pip face; invalid/null shows a non-black shimmer (unless `blank`). */
  value?: 1 | 2 | 3 | 4 | 5 | 6 | null;
  diceType?: DiceType;
  size?: number;
  rolling?: boolean;
  /**
   * Neutral “no result yet” cube — tumbling works; no pip faces (avoids fake 1–6 reads).
   */
  blank?: boolean;
  /** Stagger (ms) — start the tumble a bit after siblings. */
  delay?: number;
  /** three sets of waypoints for unsynchronized motion */
  variant?: TumbleVariant;
  /** Tumble leg duration; vary per die (~1.65 / 1.8 / 1.95) */
  durationSec?: number;
}

const TUMBLE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

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

/** +Z = toward viewer. */
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

function tumbleVariantCss(id: string, variant: TumbleVariant): string {
  const jA = `
        @keyframes ${id}-jitter {
          0%, 100% { transform: translate3d(0,0,0); }
          25%  { transform: translate3d(3px, -2px, 0); }
          50%  { transform: translate3d(-2px, 3px, 0); }
          75%  { transform: translate3d(-1px, -1px, 0); }
        }
        @-webkit-keyframes ${id}-jitter {
          0%, 100% { -webkit-transform: translate3d(0,0,0); }
          25%  { -webkit-transform: translate3d(3px, -2px, 0); }
          50%  { -webkit-transform: translate3d(-2px, 3px, 0); }
          75%  { -webkit-transform: translate3d(-1px, -1px, 0); }
        }`;
  const jB = `
        @keyframes ${id}-jitter {
          0%, 100% { transform: translate3d(0,0,0); }
          33%  { transform: translate3d(-3px, 1px, 0); }
          66%  { transform: translate3d(2px, 2px, 0); }
        }
        @-webkit-keyframes ${id}-jitter {
          0%, 100% { -webkit-transform: translate3d(0,0,0); }
          33%  { -webkit-transform: translate3d(-3px, 1px, 0); }
          66%  { -webkit-transform: translate3d(2px, 2px, 0); }
        }`;
  const jC = `
        @keyframes ${id}-jitter {
          0%, 100% { transform: translate3d(0,0,0); }
          20%  { transform: translate3d(1px, -3px, 0); }
          45%  { transform: translate3d(-2px, 1px, 0); }
          80%  { transform: translate3d(1px, 1px, 0); }
        }
        @-webkit-keyframes ${id}-jitter {
          0%, 100% { -webkit-transform: translate3d(0,0,0); }
          20%  { -webkit-transform: translate3d(1px, -3px, 0); }
          45%  { -webkit-transform: translate3d(-2px, 1px, 0); }
          80%  { -webkit-transform: translate3d(1px, 1px, 0); }
        }`;
  if (variant === "a") {
    return `
        @keyframes ${id}-tumble {
          0%   { transform: translate3d(0,0,0) rotateX(0deg)   rotateY(0deg)    rotateZ(0deg); }
          15%  { transform: translate3d(2px,-3px,0) rotateX(247deg)  rotateY(134deg)  rotateZ(89deg); }
          30%  { transform: translate3d(-1px,2px,0)  rotateX(534deg) rotateY(289deg) rotateZ(178deg); }
          50%  { transform: translate3d(1px,1px,0)  rotateX(892deg) rotateY(521deg) rotateZ(334deg); }
          70%  { transform: translate3d(-2px,0,0)   rotateX(1247deg) rotateY(778deg) rotateZ(512deg); }
          85%  { transform: translate3d(0,-2px,0)  rotateX(1534deg) rotateY(967deg) rotateZ(678deg); }
          100% { transform: translate3d(0,0,0)   rotateX(1800deg) rotateY(1080deg) rotateZ(720deg); }
        }
        @-webkit-keyframes ${id}-tumble {
          0%   { -webkit-transform: translate3d(0,0,0) rotateX(0deg)   rotateY(0deg)    rotateZ(0deg); }
          15%  { -webkit-transform: translate3d(2px,-3px,0) rotateX(247deg)  rotateY(134deg)  rotateZ(89deg); }
          30%  { -webkit-transform: translate3d(-1px,2px,0)  rotateX(534deg) rotateY(289deg) rotateZ(178deg); }
          50%  { -webkit-transform: translate3d(1px,1px,0)  rotateX(892deg) rotateY(521deg) rotateZ(334deg); }
          70%  { -webkit-transform: translate3d(-2px,0,0)   rotateX(1247deg) rotateY(778deg) rotateZ(512deg); }
          85%  { -webkit-transform: translate3d(0,-2px,0)  rotateX(1534deg) rotateY(967deg) rotateZ(678deg); }
          100% { -webkit-transform: translate3d(0,0,0)   rotateX(1800deg) rotateY(1080deg) rotateZ(720deg); }
        }
        ${jA}`;
  }
  if (variant === "b") {
    return `
        @keyframes ${id}-tumble {
          0%   { transform: translate3d(0,0,0) rotateX(0deg)   rotateY(0deg)    rotateZ(0deg); }
          15%  { transform: translate3d(-2px,2px,0)  rotateX(198deg)  rotateY(211deg)  rotateZ(143deg); }
          30%  { transform: translate3d(2px,-1px,0)   rotateX(401deg) rotateY(512deg) rotateZ(256deg); }
          50%  { transform: translate3d(-1px,3px,0)  rotateX(678deg) rotateY(789deg) rotateZ(401deg); }
          70%  { transform: translate3d(0,-1px,0)   rotateX(1056deg) rotateY(1003deg) rotateZ(567deg); }
          85%  { transform: translate3d(1px,2px,0)  rotateX(1289deg) rotateY(1198deg) rotateZ(721deg); }
          100% { transform: translate3d(0,0,0)   rotateX(1560deg) rotateY(1320deg) rotateZ(800deg); }
        }
        @-webkit-keyframes ${id}-tumble {
          0%   { -webkit-transform: translate3d(0,0,0) rotateX(0deg)   rotateY(0deg)    rotateZ(0deg); }
          15%  { -webkit-transform: translate3d(-2px,2px,0)  rotateX(198deg)  rotateY(211deg)  rotateZ(143deg); }
          30%  { -webkit-transform: translate3d(2px,-1px,0)   rotateX(401deg) rotateY(512deg) rotateZ(256deg); }
          50%  { -webkit-transform: translate3d(-1px,3px,0)  rotateX(678deg) rotateY(789deg) rotateZ(401deg); }
          70%  { -webkit-transform: translate3d(0,-1px,0)   rotateX(1056deg) rotateY(1003deg) rotateZ(567deg); }
          85%  { -webkit-transform: translate3d(1px,2px,0)  rotateX(1289deg) rotateY(1198deg) rotateZ(721deg); }
          100% { -webkit-transform: translate3d(0,0,0)   rotateX(1560deg) rotateY(1320deg) rotateZ(800deg); }
        }
        ${jB}`;
  }
  return `
        @keyframes ${id}-tumble {
          0%   { transform: translate3d(0,0,0) rotateX(0deg)   rotateY(0deg)   rotateZ(0deg); }
          15%  { transform: translate3d(1px,3px,0)  rotateX(189deg)  rotateY(267deg) rotateZ(201deg); }
          30%  { transform: translate3d(-1px,-2px,0) rotateX(456deg) rotateY(512deg) rotateZ(333deg); }
          50%  { transform: translate3d(2px,0,0)    rotateX(723deg) rotateY(678deg) rotateZ(512deg); }
          70%  { transform: translate3d(-1px,2px,0)  rotateX(1001deg) rotateY(911deg) rotateZ(666deg); }
          85%  { transform: translate3d(0,-1px,0)   rotateX(1334deg) rotateY(1045deg) rotateZ(789deg); }
          100% { transform: translate3d(0,0,0)   rotateX(1600deg) rotateY(1240deg) rotateZ(880deg); }
        }
        @-webkit-keyframes ${id}-tumble {
          0%   { -webkit-transform: translate3d(0,0,0) rotateX(0deg)   rotateY(0deg)   rotateZ(0deg); }
          15%  { -webkit-transform: translate3d(1px,3px,0)  rotateX(189deg)  rotateY(267deg) rotateZ(201deg); }
          30%  { -webkit-transform: translate3d(-1px,-2px,0) rotateX(456deg) rotateY(512deg) rotateZ(333deg); }
          50%  { -webkit-transform: translate3d(2px,0,0)    rotateX(723deg) rotateY(678deg) rotateZ(512deg); }
          70%  { -webkit-transform: translate3d(-1px,2px,0)  rotateX(1001deg) rotateY(911deg) rotateZ(666deg); }
          85%  { -webkit-transform: translate3d(0,-1px,0)   rotateX(1334deg) rotateY(1045deg) rotateZ(789deg); }
          100% { -webkit-transform: translate3d(0,0,0)   rotateX(1600deg) rotateY(1240deg) rotateZ(880deg); }
        }
        ${jC}`;
}

/** Rolling “neutral” cube — purple/gold brand feel, never flat black. */
const BLANK_FACE =
  "linear-gradient(145deg, #8B5CF6 0%, #6D28D9 38%, #5B21B6 68%, #4C1D95 100%)";
const BLANK_RIM =
  "linear-gradient(180deg, rgba(253,224,71,0.42) 0%, rgba(91,33,182,0.55) 55%, rgba(49,46,129,0.65) 100%)";

const SHIMMER_STYLE = `
@keyframes celo-dice-slot-shimmer {
  0%, 100% { opacity: 0.72; filter: brightness(1); }
  50% { opacity: 1; filter: brightness(1.12); }
}
`;

function DiceValueShimmer({ size }: { size: number }) {
  const r = Math.round(size * 0.1);
  return (
    <div
      className="relative flex flex-shrink-0 items-center justify-center"
      style={{
        width: size * 1.1,
        height: size * 1.1,
        margin: "0 2px",
      }}
      aria-hidden
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: r,
          background:
            "linear-gradient(145deg, rgba(139,92,246,0.58) 0%, rgba(88,28,135,0.52) 45%, rgba(245,200,66,0.32) 100%)",
          border: "1px solid rgba(253,224,71,0.28)",
          boxShadow:
            "0 0 18px rgba(167,139,250,0.5), 0 0 28px rgba(245,200,66,0.15), inset 0 1px 0 rgba(253,224,71,0.22)",
          animation: "celo-dice-slot-shimmer 1.35s ease-in-out infinite",
        }}
      />
    </div>
  );
}

function isValidDie(v: unknown): v is 1 | 2 | 3 | 4 | 5 | 6 {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= 1 &&
    v <= 6
  );
}

export default function DiceFace({
  value,
  diceType = "standard",
  size = 64,
  rolling = false,
  blank = false,
  delay = 0,
  variant = "a",
  durationSec = 1.8,
}: Props) {
  const dieOk = blank || isValidDie(value);
  const resolvedPip: 1 | 2 | 3 | 4 | 5 | 6 = blank
    ? 1
    : isValidDie(value)
      ? value
      : 1;

  const id = useId().replace(/:/g, "");
  const slug = `d3d-${id}`;
  const s = blank
    ? {
        face: BLANK_FACE,
        rim: BLANK_RIM,
        dot: "#E9D5FF",
        dotGlow: "rgba(233,213,255,0.35)",
        pipShadow: "none",
      }
    : STYLES[diceType];
  const r = Math.round(size * 0.1);
  const pipSize = Math.round(size * 0.16);
  const pad = Math.round(size * 0.11);
  const hz = size / 2;
  const fin = FINAL[resolvedPip] ?? { rx: 0, ry: 0 };
  const settledT = `translate3d(0,0,0) rotateX(${fin.rx}deg) rotateY(${fin.ry}deg) rotateZ(0deg)`;
  const wobble0 = `translate3d(0,0,0) rotateX(${fin.rx + 5}deg) rotateY(${fin.ry}deg) rotateZ(0deg)`;
  const wobble1 = `translate3d(0,0,0) rotateX(${fin.rx}deg) rotateY(${fin.ry + 4}deg) rotateZ(0deg)`;
  const [outerBounceKey, setOuterBounceKey] = useState(0);
  const [settleId, setSettleId] = useState(0);
  const wasRolling = useRef(rolling);
  const variantCss = useMemo(() => tumbleVariantCss(slug, variant), [slug, variant]);

  useEffect(() => {
    if (wasRolling.current && !rolling) {
      setOuterBounceKey((b) => b + 1);
      setSettleId((s) => s + 1);
    }
    wasRolling.current = rolling;
  }, [rolling]);

  if (!blank && !dieOk) {
    return (
      <>
        <style>{`${SHIMMER_STYLE}`}</style>
        <DiceValueShimmer size={size} />
      </>
    );
  }

  return (
    <>
      <style>{`
        ${SHIMMER_STYLE}
        ${variantCss}
        @keyframes ${slug}-nudge {
          0%   { transform: ${wobble0}; }
          50%  { transform: ${wobble1}; }
          100% { transform: ${settledT}; }
        }
        @-webkit-keyframes ${slug}-nudge {
          0%   { -webkit-transform: ${wobble0}; }
          50%  { -webkit-transform: ${wobble1}; }
          100% { -webkit-transform: ${settledT}; }
        }
        @keyframes ${slug}-bounce {
          0% { transform: translate3d(0,0,0) scale(1.1); }
          40% { transform: translate3d(0,${Math.max(2, size * 0.07)}px,0) scale(0.95); }
          70% { transform: translate3d(0,-${Math.max(1, size * 0.04)}px,0) scale(1.03); }
          100% { transform: translate3d(0,0,0) scale(1); }
        }
        @-webkit-keyframes ${slug}-bounce {
          0% { -webkit-transform: translate3d(0,0,0) scale(1.1); }
          40% { -webkit-transform: translate3d(0,${Math.max(2, size * 0.07)}px,0) scale(0.95); }
          70% { -webkit-transform: translate3d(0,-${Math.max(1, size * 0.04)}px,0) scale(1.03); }
          100% { -webkit-transform: translate3d(0,0,0) scale(1); }
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
          isolation: "isolate",
        }}
      >
        <div
          key={outerBounceKey}
          style={{
            position: "relative" as const,
            width: size * 1.1,
            height: size * 1.1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: !rolling
              ? `${slug}-bounce 0.4s cubic-bezier(0.4,0,0.2,1) both`
              : undefined,
            WebkitAnimation: !rolling
              ? `${slug}-bounce 0.4s cubic-bezier(0.4,0,0.2,1) both`
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
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative" as const,
              willChange: rolling ? "transform" : undefined,
              animation: rolling
                ? `${slug}-jitter 0.38s ease-in-out infinite`
                : undefined,
              WebkitAnimation: rolling
                ? `${slug}-jitter 0.38s ease-in-out infinite`
                : undefined,
            }}
          >
            <div
              key={settleId}
              style={
                {
                  position: "relative" as const,
                  width: size,
                  height: size,
                  transformStyle: "preserve-3d" as const,
                  WebkitTransformStyle: "preserve-3d" as const,
                  transform:
                    rolling || (!rolling && settleId > 0)
                      ? undefined
                      : settledT,
                  WebkitTransform:
                    rolling || (!rolling && settleId > 0)
                      ? undefined
                      : settledT,
                  WebkitBackfaceVisibility: "hidden",
                  backfaceVisibility: "hidden",
                  willChange: rolling || (!rolling && settleId > 0) ? "transform" : undefined,
                  animation: rolling
                    ? `${slug}-tumble ${durationSec}s ${TUMBLE_EASING} infinite`
                    : !rolling && settleId > 0
                      ? `${slug}-nudge 0.12s cubic-bezier(0.2,0.6,0.2,1) forwards`
                    : undefined,
                  WebkitAnimation: rolling
                    ? `${slug}-tumble ${durationSec}s ${TUMBLE_EASING} infinite`
                    : !rolling && settleId > 0
                      ? `${slug}-nudge 0.12s cubic-bezier(0.2,0.6,0.2,1) forwards`
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
                        border: blank
                          ? "1px solid rgba(253,224,71,0.32)"
                          : "1px solid rgba(0,0,0,0.38)",
                        borderRadius: r,
                        boxShadow: blank
                          ? "0 0 10px rgba(167,139,250,0.35), 0 0 0 0.5px rgba(245,200,66,0.12)"
                          : "0 0 0 0.5px rgba(0,0,0,0.2)",
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
                    {!blank && (
                      <PipsOnFace v={pval} st={s} pipSize={pipSize} pad={pad} />
                    )}
                    <div
                      className="pointer-events-none absolute rounded-[inherit]"
                      style={{
                        inset: 0,
                        background: blank
                          ? "linear-gradient(125deg, rgba(255,255,255,0.22) 0%, transparent 38%, rgba(245,200,66,0.12) 55%, rgba(76,29,149,0.2) 100%)"
                          : "linear-gradient(125deg, rgba(255,255,255,0.18) 0%, transparent 40%, rgba(0,0,0,0.1) 100%)",
                        boxShadow: blank
                          ? "inset 0 0 12px rgba(167,139,250,0.25)"
                          : undefined,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
