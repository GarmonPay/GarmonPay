"use client";

import { useEffect, useMemo, useState } from "react";

export type RollResultKind = string | null;

export type RollNameDisplayProps = {
  rollName: string | null;
  result: string | null;
  onComplete?: () => void;
};

function styleFor(name: string): { color: string; fontSize: number; extra?: Record<string, string | number> } {
  if (name.includes("C-LO")) return { color: "#F5C842", fontSize: 52, extra: { textShadow: "0 0 24px rgba(245,200,66,0.55)" } };
  if (name.includes("HAND CRACK")) return { color: "#F5C842", fontSize: 46 };
  if (name.includes("TRIP SIXES")) {
    return {
      color: "#F5C842",
      fontSize: 40,
      extra: {
        background: "linear-gradient(90deg,#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      },
    };
  }
  if (name.includes("ACE OUT")) return { color: "#F5C842", fontSize: 46 };
  if (name.includes("SHIT")) return { color: "#EF4444", fontSize: 52, extra: { animation: "rnShake 0.35s ease-in-out" } };
  if (name.includes("DICK")) return { color: "#EF4444", fontSize: 46 };
  if (name.includes("POUND") || name.includes("POLICE")) return { color: "#3B82F6", fontSize: 44 };
  if (name.includes("ZOE") || name.includes("HAITIAN")) return { color: "#10B981", fontSize: 44 };
  if (name.includes("GIRL") || name.includes("HOE")) return { color: "#EC4899", fontSize: 44 };
  if (name.includes("SHORTLY") || name.includes("JIT")) return { color: "#A855F7", fontSize: 44 };
  if (name.includes("No Count")) return { color: "#6B7280", fontSize: 28 };
  return { color: "#F5C842", fontSize: 44 };
}

export default function RollNameDisplay({ rollName, result: _result, onComplete }: RollNameDisplayProps) {
  const [phase, setPhase] = useState<"idle" | "in" | "hold" | "out">("idle");

  const holdMs = useMemo(() => {
    if (!rollName) return 2500;
    return rollName.includes("No Count") ? 1200 : 2500;
  }, [rollName]);

  useEffect(() => {
    if (!rollName) {
      setPhase("idle");
      return;
    }
    setPhase("in");
    const t1 = window.setTimeout(() => setPhase("hold"), 320);
    const t2 = window.setTimeout(() => setPhase("out"), 320 + holdMs);
    const t3 = window.setTimeout(() => {
      onComplete?.();
    }, 320 + holdMs + 420);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [rollName, holdMs, onComplete]);

  if (!rollName || phase === "idle") return null;

  const st = styleFor(rollName);
  const opacity = phase === "in" ? 1 : phase === "hold" ? 1 : 0;
  const scale = phase === "in" ? 1 : phase === "hold" ? 1 : 0.92;

  return (
    <div
      className="pointer-events-none relative z-[4] mt-2 flex w-full max-w-[min(100%,280px)] shrink-0 items-center justify-center px-2 text-center"
      style={{
        opacity,
        transform: `scale(${phase === "in" ? 1 : 0.5})`,
        transition: "opacity 0.35s ease, transform 0.35s ease",
        minHeight: "2.25rem",
      }}
    >
      <style>{`
        @keyframes rnShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
      `}</style>
      <p
        className="font-bold leading-tight px-2"
        style={{
          color: st.color,
          fontSize: Math.min(st.fontSize, 44),
          ...st.extra,
          transform: `scale(${scale})`,
          transition: "transform 0.25s ease-out",
        }}
      >
        {rollName}
      </p>
    </div>
  );
}
