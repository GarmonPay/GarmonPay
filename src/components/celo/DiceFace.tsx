"use client";

import React from "react";

type DiceType =
  | "standard"
  | "gold"
  | "street"
  | "midnight"
  | "blood"
  | "fire"
  | "diamond";

export type DiceFaceType = DiceType;
/** @deprecated Use DiceFaceType */
export type Dice3DType = DiceFaceType;

interface DiceFaceProps {
  value: 1 | 2 | 3 | 4 | 5 | 6;
  diceType?: DiceType;
  size?: number;
  rolling?: boolean;
  delay?: number;
}

const DICE_STYLES: Record<
  DiceType,
  {
    bg: string;
    dot: string;
    border: string;
  }
> = {
  standard: {
    bg: "linear-gradient(135deg, #DC2626, #991B1B)",
    dot: "#FFFFFF",
    border: "rgba(255,255,255,0.2)",
  },
  gold: {
    bg: "linear-gradient(135deg, #F5C842, #D4A017)",
    dot: "#1A0A00",
    border: "rgba(255,255,255,0.3)",
  },
  street: {
    bg: "linear-gradient(135deg, #166534, #14532D)",
    dot: "#FFFFFF",
    border: "rgba(255,255,255,0.15)",
  },
  midnight: {
    bg: "linear-gradient(135deg, #1E1B4B, #0F0A2E)",
    dot: "#A855F7",
    border: "rgba(168,85,247,0.4)",
  },
  blood: {
    bg: "linear-gradient(135deg, #7F1D1D, #450A0A)",
    dot: "#F5C842",
    border: "rgba(245,200,66,0.3)",
  },
  fire: {
    bg: "linear-gradient(135deg, #EA580C, #9A3412)",
    dot: "#FEF08A",
    border: "rgba(254,240,138,0.3)",
  },
  diamond: {
    bg: "linear-gradient(135deg, #BFDBFE, #93C5FD)",
    dot: "#1E3A8A",
    border: "rgba(255,255,255,0.5)",
  },
};

const PIP_POSITIONS: Record<number, [number, number][]> = {
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
  size = 72,
  rolling = false,
  delay = 0,
}: DiceFaceProps) {
  const style = DICE_STYLES[diceType];
  const pips = PIP_POSITIONS[value] || PIP_POSITIONS[1];
  const radius = Math.round(size * 0.18);
  const pipSize = Math.round(size * 0.18);
  const padding = Math.round(size * 0.12);

  return (
    <>
      <style>{`
        @keyframes diceShake {
          0%   { transform: rotate(0deg) scale(1) }
          10%  { transform: rotate(-15deg) scale(0.95) }
          20%  { transform: rotate(15deg) scale(1.05) }
          30%  { transform: rotate(-10deg) scale(0.98) }
          40%  { transform: rotate(10deg) scale(1.02) }
          50%  { transform: rotate(-8deg) scale(0.99) }
          60%  { transform: rotate(8deg) scale(1.01) }
          70%  { transform: rotate(-5deg) scale(1) }
          80%  { transform: rotate(5deg) scale(1) }
          90%  { transform: rotate(-2deg) scale(1) }
          100% { transform: rotate(0deg) scale(1) }
        }
        @keyframes diceLand {
          0%   { transform: scale(1.15) }
          60%  { transform: scale(0.95) }
          100% { transform: scale(1) }
        }
      `}</style>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: style.bg,
          border: `1.5px solid ${style.border}`,
          boxShadow: `2px 3px 8px rgba(0,0,0,0.6),
          inset 0 1px 0 rgba(255,255,255,0.15)`,
          position: "relative",
          flexShrink: 0,
          animation: rolling
            ? `diceShake 0.4s ease-in-out ${delay}ms infinite`
            : "diceLand 0.3s ease-out",
          filter: rolling ? "blur(0.5px)" : "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: padding,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gridTemplateRows: "repeat(3, 1fr)",
          }}
        >
          {[1, 2, 3].map((row) => (
            <React.Fragment key={row}>
              {[1, 2, 3].map((col) => {
                const hasPip = pips.some(([r, c]) => r === row && c === col);
                return (
                  <div
                    key={`${row}-${col}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {hasPip ? (
                      <div
                        style={{
                          width: pipSize,
                          height: pipSize,
                          borderRadius: "50%",
                          background: style.dot,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </>
  );
}
