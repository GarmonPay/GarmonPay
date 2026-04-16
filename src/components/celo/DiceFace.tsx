"use client";

import { useEffect, useRef, useState } from "react";

export type DiceFaceType =
  | "standard"
  | "gold"
  | "street"
  | "midnight"
  | "blood"
  | "fire"
  | "diamond";

/** @deprecated Use DiceFaceType — kept for existing imports */
export type Dice3DType = DiceFaceType;

const STYLES: Record<
  DiceFaceType,
  { background: string; dot: string; border: string }
> = {
  standard: {
    background: "linear-gradient(135deg, #DC2626, #991B1B)",
    dot: "#FFFFFF",
    border: "1px solid rgba(255,255,255,0.2)",
  },
  gold: {
    background: "linear-gradient(135deg, #F5C842, #D4A017)",
    dot: "#1A0A00",
    border: "1px solid rgba(255,255,255,0.3)",
  },
  street: {
    background: "linear-gradient(135deg, #166534, #14532D)",
    dot: "#FFFFFF",
    border: "1px solid rgba(255,255,255,0.15)",
  },
  midnight: {
    background: "linear-gradient(135deg, #1E1B4B, #0F0A2E)",
    dot: "#A855F7",
    border: "1px solid rgba(168,85,247,0.4)",
  },
  blood: {
    background: "linear-gradient(135deg, #7F1D1D, #450A0A)",
    dot: "#F5C842",
    border: "1px solid rgba(245,200,66,0.3)",
  },
  fire: {
    background: "linear-gradient(135deg, #EA580C, #9A3412)",
    dot: "#FEF08A",
    border: "1px solid rgba(254,240,138,0.3)",
  },
  diamond: {
    background: "linear-gradient(135deg, #BFDBFE, #93C5FD)",
    dot: "#1E3A8A",
    border: "1px solid rgba(255,255,255,0.5)",
  },
};

type Props = {
  value: number;
  diceType: DiceFaceType;
  size?: number;
  rolling: boolean;
  delay?: number;
};

function clampFace(v: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (!Number.isFinite(v)) return 1;
  const n = Math.min(6, Math.max(1, Math.round(v)));
  return n as 1 | 2 | 3 | 4 | 5 | 6;
}

/** 3×3 grid: which cells show a pip (row-major) */
function pipMask(face: 1 | 2 | 3 | 4 | 5 | 6): boolean[] {
  const g = Array(9).fill(false);
  const set = (i: number) => {
    g[i] = true;
  };
  switch (face) {
    case 1:
      set(4);
      break;
    case 2:
      set(2);
      set(6);
      break;
    case 3:
      set(2);
      set(4);
      set(6);
      break;
    case 4:
      set(0);
      set(2);
      set(6);
      set(8);
      break;
    case 5:
      set(0);
      set(2);
      set(4);
      set(6);
      set(8);
      break;
    case 6:
      set(0);
      set(3);
      set(6);
      set(2);
      set(5);
      set(8);
      break;
    default:
      set(4);
  }
  return g;
}

export default function DiceFace({
  value,
  diceType,
  size = 72,
  rolling,
  delay = 0,
}: Props) {
  const face = clampFace(value);
  const style = STYLES[diceType] ?? STYLES.standard;
  const pipSize = size * 0.18;
  const radius = size * 0.18;
  const mask = pipMask(face);
  const [landSeq, setLandSeq] = useState(0);
  const prevRolling = useRef(rolling);

  useEffect(() => {
    if (prevRolling.current && !rolling) setLandSeq((s) => s + 1);
    prevRolling.current = rolling;
  }, [rolling]);

  const shake = rolling
    ? `diceShake 0.4s ease-in-out infinite`
    : `diceLand 0.3s ease-out ${landSeq > 0 ? "forwards" : "none"}`;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: style.background,
        border: style.border,
        boxShadow: "2px 2px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        padding: size * 0.12,
        boxSizing: "border-box",
        animation: shake,
        animationDelay: rolling ? `${delay}ms` : "0ms",
        filter: rolling ? "blur(0.5px)" : "none",
      }}
    >
      <style>{`
        @keyframes diceShake {
          0%   { transform: rotate(0deg) scale(1); }
          10%  { transform: rotate(-15deg) scale(0.95); }
          20%  { transform: rotate(15deg) scale(1.05); }
          30%  { transform: rotate(-10deg) scale(0.98); }
          40%  { transform: rotate(10deg) scale(1.02); }
          50%  { transform: rotate(-8deg) scale(0.99); }
          60%  { transform: rotate(8deg) scale(1.01); }
          70%  { transform: rotate(-5deg) scale(1); }
          80%  { transform: rotate(5deg) scale(1); }
          90%  { transform: rotate(-2deg) scale(1); }
          100% { transform: rotate(0deg) scale(1); }
        }
        @keyframes diceLand {
          0%   { transform: scale(1.1); }
          60%  { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
      `}</style>
      {mask.map((on, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {on ? (
            <div
              style={{
                width: pipSize,
                height: pipSize,
                borderRadius: "50%",
                background: style.dot,
                boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
