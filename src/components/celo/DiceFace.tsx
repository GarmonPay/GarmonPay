"use client";

import React from "react";

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
  delay?: number;
}

const STYLES: Record<
  DiceType,
  {
    bg: string;
    dot: string;
    border: string;
  }
> = {
  standard: {
    bg: "linear-gradient(135deg,#DC2626,#991B1B)",
    dot: "#FFFFFF",
    border: "rgba(255,255,255,0.2)",
  },
  gold: {
    bg: "linear-gradient(135deg,#F5C842,#D4A017)",
    dot: "#1A0A00",
    border: "rgba(255,255,255,0.3)",
  },
  street: {
    bg: "linear-gradient(135deg,#166534,#14532D)",
    dot: "#FFFFFF",
    border: "rgba(255,255,255,0.15)",
  },
  midnight: {
    bg: "linear-gradient(135deg,#1E1B4B,#0F0A2E)",
    dot: "#A855F7",
    border: "rgba(168,85,247,0.4)",
  },
  blood: {
    bg: "linear-gradient(135deg,#7F1D1D,#450A0A)",
    dot: "#F5C842",
    border: "rgba(245,200,66,0.3)",
  },
  fire: {
    bg: "linear-gradient(135deg,#EA580C,#9A3412)",
    dot: "#FEF08A",
    border: "rgba(254,240,138,0.3)",
  },
  diamond: {
    bg: "linear-gradient(135deg,#BFDBFE,#93C5FD)",
    dot: "#1E3A8A",
    border: "rgba(255,255,255,0.5)",
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
  const s = STYLES[diceType];
  const pips = PIPS[value] ?? PIPS[1];
  const r = Math.round(size * 0.16);
  const pipSize = Math.round(size * 0.17);
  const pad = Math.round(size * 0.1);

  return (
    <>
      <style>{`
        @keyframes celoDiceShake {
          0%   { transform: rotate(0deg) scale(1) translateY(0) }
          20%  { transform: rotate(-24deg) scale(0.92) translateY(1px) }
          40%  { transform: rotate(22deg) scale(1.08) translateY(-1px) }
          60%  { transform: rotate(-14deg) scale(0.98) translateY(0) }
          80%  { transform: rotate(10deg) scale(1.04) translateY(0) }
          100% { transform: rotate(0deg) scale(1) translateY(0) }
        }
        @keyframes celoDiceLand {
          0%   { transform: scale(1.18) translateY(-4px); opacity: 0.75 }
          50%  { transform: scale(0.95) translateY(2px); opacity: 1 }
          100% { transform: scale(1) translateY(0); opacity: 1 }
        }
      `}</style>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: r,
          background: s.bg,
          border: `1.5px solid ${s.border}`,
          boxShadow: `
          0 4px 12px rgba(0,0,0,0.6),
          inset 0 1px 0 rgba(255,255,255,0.15),
          inset 0 -1px 0 rgba(0,0,0,0.3)
        `,
          position: "relative",
          flexShrink: 0,
          willChange: rolling ? "transform" : "auto",
          animation: rolling
            ? `celoDiceShake 0.3s ease-in-out ${delay}ms infinite`
            : "celoDiceLand 0.4s cubic-bezier(0.34, 1.2, 0.64, 1)",
          filter: rolling ? "blur(0.4px)" : "none",
        }}
      >
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
              const has = pips.some(
                ([r2, c]) => r2 === row && c === col
              );
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
                        background: s.dot,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
                      }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
