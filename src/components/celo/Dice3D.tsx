"use client";

import { useMemo } from "react";

export interface Dice3DProps {
  value: number;
  rolling: boolean;
  diceType?:
    | "standard"
    | "gold"
    | "street"
    | "midnight"
    | "diamond"
    | "blood"
    | "fire";
  size?: number;
  spinDurationSec?: number;
}

const faceColors = {
  standard: { bg: "#DC2626", dot: "#fff" },
  gold: { bg: "#D97706", dot: "#000" },
  street: { bg: "#166534", dot: "#fff" },
  midnight: { bg: "#1E1B4B", dot: "#fff" },
  diamond: { bg: "#E8F4FD", dot: "#1a3a5c" },
  blood: { bg: "#8B0000", dot: "#F5C842" },
  fire: { bg: "#FF4500", dot: "#FFD700" },
} as const;

const FACE_TRANSFORM: Record<number, string> = {
  1: "rotateX(0deg) rotateY(0deg)",
  2: "rotateX(-90deg) rotateY(0deg)",
  3: "rotateX(0deg) rotateY(-90deg)",
  4: "rotateX(0deg) rotateY(90deg)",
  5: "rotateX(90deg) rotateY(0deg)",
  6: "rotateX(0deg) rotateY(180deg)",
};

/** 3×3 row-major, true = pip */
const FACE_PIPS: Record<1 | 2 | 3 | 4 | 5 | 6, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [false, false, true, false, false, false, true, false, false],
  3: [false, false, true, false, true, false, true, false, false],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
};

function FacePips({
  face,
  dot,
  bg,
  size,
}: {
  face: 1 | 2 | 3 | 4 | 5 | 6;
  dot: string;
  bg: string;
  size: number;
}) {
  const cells = FACE_PIPS[face];
  const pad = size * 0.1;
  const gap = size * 0.06;
  return (
    <div
      style={{
        width: size,
        height: size,
        background: bg,
        borderRadius: Math.max(3, size * 0.08),
        boxSizing: "border-box",
        padding: pad,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        gap,
      }}
    >
      {cells.map((on, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          {on ? (
            <span
              style={{
                width: size * 0.18,
                height: size * 0.18,
                borderRadius: "50%",
                background: dot,
                boxShadow: "inset 0 -1px 2px rgba(0,0,0,0.25)",
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function Dice3D({
  value,
  rolling,
  diceType = "standard",
  size = 65,
  spinDurationSec = 2.2,
}: Dice3DProps) {
  const v = value >= 1 && value <= 6 ? (Math.floor(value) as 1 | 2 | 3 | 4 | 5 | 6) : 1;
  const colors = faceColors[diceType] ?? faceColors.standard;
  const half = size / 2;
  const faceSize = size;

  const tf = useMemo(() => FACE_TRANSFORM[v] ?? FACE_TRANSFORM[1], [v]);

  return (
    <div
      style={{
        width: size,
        height: size,
        perspective: 300,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          transition: rolling ? "none" : "transform 0.5s ease-out",
          animation: rolling ? `celoDiceSpin ${spinDurationSec}s linear infinite` : "none",
          transform: rolling ? undefined : tf,
        }}
      >
        <div
          style={{
            position: "absolute",
            width: faceSize,
            height: faceSize,
            transform: `translateZ(${half}px)`,
            backfaceVisibility: "hidden",
          }}
        >
          <FacePips face={1} dot={colors.dot} bg={colors.bg} size={faceSize} />
        </div>
        <div
          style={{
            position: "absolute",
            width: faceSize,
            height: faceSize,
            transform: `rotateY(180deg) translateZ(${half}px)`,
            backfaceVisibility: "hidden",
          }}
        >
          <FacePips face={6} dot={colors.dot} bg={colors.bg} size={faceSize} />
        </div>
        <div
          style={{
            position: "absolute",
            width: faceSize,
            height: faceSize,
            transform: `rotateY(90deg) translateZ(${half}px)`,
            backfaceVisibility: "hidden",
          }}
        >
          <FacePips face={3} dot={colors.dot} bg={colors.bg} size={faceSize} />
        </div>
        <div
          style={{
            position: "absolute",
            width: faceSize,
            height: faceSize,
            transform: `rotateY(-90deg) translateZ(${half}px)`,
            backfaceVisibility: "hidden",
          }}
        >
          <FacePips face={4} dot={colors.dot} bg={colors.bg} size={faceSize} />
        </div>
        <div
          style={{
            position: "absolute",
            width: faceSize,
            height: faceSize,
            transform: `rotateX(90deg) translateZ(${half}px)`,
            backfaceVisibility: "hidden",
          }}
        >
          <FacePips face={2} dot={colors.dot} bg={colors.bg} size={faceSize} />
        </div>
        <div
          style={{
            position: "absolute",
            width: faceSize,
            height: faceSize,
            transform: `rotateX(-90deg) translateZ(${half}px)`,
            backfaceVisibility: "hidden",
          }}
        >
          <FacePips face={5} dot={colors.dot} bg={colors.bg} size={faceSize} />
        </div>
      </div>
    </div>
  );
}
