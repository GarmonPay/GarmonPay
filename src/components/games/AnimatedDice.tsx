"use client";

import { useEffect, useRef, useState } from "react";

export type AnimatedDiceProps = {
  isRolling: boolean;
  result: number | null;
  size?: number;
};

/**
 * Premium black/gold dice faces from `/public/images/dice-1.png` … `dice-6.png`.
 */
export function AnimatedDice({ isRolling, result, size = 80 }: AnimatedDiceProps) {
  const [face, setFace] = useState(1);
  const fastRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slowRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const landRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRollingRef = useRef(isRolling);

  useEffect(() => {
    if (fastRef.current) {
      clearInterval(fastRef.current);
      fastRef.current = null;
    }
    if (slowRef.current) {
      clearInterval(slowRef.current);
      slowRef.current = null;
    }
    if (landRef.current) {
      clearTimeout(landRef.current);
      landRef.current = null;
    }

    const r = result != null && result >= 1 && result <= 6 ? Math.floor(result) : null;
    const rollJustEnded = prevRollingRef.current && !isRolling;
    prevRollingRef.current = isRolling;

    if (isRolling) {
      fastRef.current = setInterval(() => {
        setFace((f) => (f % 6) + 1);
      }, 80);
      return () => {
        if (fastRef.current) clearInterval(fastRef.current);
      };
    }

    if (r != null && rollJustEnded) {
      let ticks = 0;
      slowRef.current = setInterval(() => {
        setFace((f) => (f % 6) + 1);
        ticks += 1;
        if (ticks >= 4) {
          if (slowRef.current) clearInterval(slowRef.current);
          slowRef.current = null;
          landRef.current = setTimeout(() => {
            setFace(r);
            landRef.current = null;
          }, 100);
        }
      }, 120);
      return () => {
        if (slowRef.current) clearInterval(slowRef.current);
        if (landRef.current) clearTimeout(landRef.current);
      };
    }

    if (r != null) {
      setFace(r);
      return undefined;
    }

    setFace(1);
    return undefined;
  }, [isRolling, result]);

  const px = Math.max(32, size);
  const idleFloat = !isRolling && result == null;

  return (
    <div
      style={{
        width: px,
        height: px,
        position: "relative",
        flexShrink: 0,
        filter: "drop-shadow(0 0 12px rgba(245,200,66,0.6))",
      }}
    >
      <div className={idleFloat ? "dice-float-inner" : undefined} style={{ width: "100%", height: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local static assets */}
        <img
          src={`/images/dice-${face}.png`}
          alt=""
          width={px}
          height={px}
          draggable={false}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      </div>
      <style>{`
        @keyframes dice-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }
        .dice-float-inner {
          animation: dice-float 2.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
