"use client";

import { useEffect, useState } from "react";

const COLORS = ["#22C55E", "#3B82F6", "#EAB308", "#F97316", "#EC4899", "#8B5CF6"];

export function Confetti() {
  const [pieces, setPieces] = useState<Array<{ id: number; left: number; delay: number; color: string; rotation: number }>>([]);

  useEffect(() => {
    const count = 24;
    const next = Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 200,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      rotation: Math.random() * 360,
    }));
    setPieces(next);
    const t = setTimeout(() => setPieces([]), 2500);
    return () => clearTimeout(t);
  }, []);

  if (pieces.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="absolute w-2 h-2 rounded-sm"
          style={{
            left: `${p.left}%`,
            top: "-10px",
            backgroundColor: p.color,
            transform: `rotate(${p.rotation}deg)`,
            animation: "confettiFall 2s ease-out forwards",
            animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}
