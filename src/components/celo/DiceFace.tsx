"use client";

export type DiceFaceType = "standard" | "gold" | "street" | "midnight" | "blood" | "fire" | "diamond";

const PALETTES: Record<
  DiceFaceType,
  { bg: string; dot: string }
> = {
  standard: { bg: "#DC2626", dot: "#FFFFFF" },
  gold: { bg: "#F5C842", dot: "#1A0A00" },
  street: { bg: "#166534", dot: "#FFFFFF" },
  midnight: { bg: "#1E1B4B", dot: "#A855F7" },
  blood: { bg: "#7F1D1D", dot: "#F5C842" },
  fire: { bg: "#EA580C", dot: "#FEF08A" },
  diamond: { bg: "#BFDBFE", dot: "#1E3A8A" },
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

export type DiceFaceProps = {
  value: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  diceType?: DiceFaceType;
  size?: number;
  rolling?: boolean;
  delay?: number;
};

export default function DiceFace({
  value,
  diceType = "standard",
  size = 68,
  rolling = false,
  delay = 0,
}: DiceFaceProps) {
  if (!value || value < 1 || value > 6) return null;

  const { bg, dot } = PALETTES[diceType];
  const pipList = PIPS[value];
  const cell = size / 3;

  return (
    <div
      className="relative shrink-0 rounded-lg overflow-hidden"
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        boxShadow: rolling ? "0 0 6px rgba(0,0,0,0.35)" : "0 2px 8px rgba(0,0,0,0.4)",
        filter: rolling ? "blur(0.5px)" : undefined,
        animation: rolling ? `diceShake 0.4s ease-in-out infinite` : undefined,
        animationDelay: `${delay}ms`,
      }}
    >
      <style>{`
        @keyframes diceShake {
          0%, 100% { transform: rotate(-8deg) scale(1); }
          50% { transform: rotate(8deg) scale(1.06); }
        }
        @keyframes diceLand {
          0% { transform: scale(1.15); }
          60% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
      `}</style>
      <div
        className="grid"
        style={{
          width: size,
          height: size,
          gridTemplateColumns: `repeat(3, ${cell}px)`,
          gridTemplateRows: `repeat(3, ${cell}px)`,
          animation: !rolling ? "diceLand 0.3s ease-out" : undefined,
        }}
      >
        {pipList.map(([cx, cy], i) => (
          <span
            key={i}
            className="rounded-full block"
            style={{
              gridColumn: cx,
              gridRow: cy,
              width: cell * 0.28,
              height: cell * 0.28,
              margin: "auto",
              backgroundColor: dot,
            }}
          />
        ))}
      </div>
    </div>
  );
}
