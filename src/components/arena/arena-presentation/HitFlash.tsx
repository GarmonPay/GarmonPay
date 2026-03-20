"use client";

import { useEffect, useState } from "react";

export function HitFlash({
  hitKey,
  side,
}: {
  hitKey: number;
  side: "left" | "right" | null;
}) {
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (!hitKey) return;
    setOpacity(side ? 0.42 : 0.18);
    const t = window.setTimeout(() => setOpacity(0), 200);
    return () => window.clearTimeout(t);
  }, [hitKey, side]);

  const gradient =
    side === "left"
      ? "linear-gradient(90deg, rgba(220,60,60,0.55), transparent 55%)"
      : side === "right"
        ? "linear-gradient(270deg, rgba(220,60,60,0.55), transparent 55%)"
        : "radial-gradient(ellipse at center, rgba(255,255,255,0.12), transparent 70%)";

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[5] transition-opacity duration-150 ease-out"
      style={{
        opacity,
        background: gradient,
      }}
    />
  );
}
