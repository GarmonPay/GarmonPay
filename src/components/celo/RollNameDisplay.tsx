"use client";

import { useEffect, useState } from "react";

export type RollResultKind =
  | "instant_win"
  | "instant_loss"
  | "point"
  | "no_count"
  | null;

interface RollNameDisplayProps {
  rollName: string | null;
  result: RollResultKind;
  onComplete?: () => void;
}

const ROLL_STYLES: Record<
  string,
  {
    color: string;
    fontSize: number;
    mobileFontSize: number;
    glow?: string;
    shake?: boolean;
  }
> = {
  "C-LO! 🎲": {
    color: "#F5C842",
    fontSize: 72,
    mobileFontSize: 48,
    glow: "#F5C842",
  },
  "HAND CRACK! 💥": {
    color: "#F5C842",
    fontSize: 64,
    mobileFontSize: 42,
    glow: "#F5C842",
  },
  "TRIP SIXES - THE BOSS! 👑": {
    color: "#F5C842",
    fontSize: 52,
    mobileFontSize: 36,
    glow: "#F5C842",
  },
  "ACE OUT! 🎲": {
    color: "#F5C842",
    fontSize: 64,
    mobileFontSize: 42,
    glow: "#F5C842",
  },
  "TRIP FIVES! 🎲": {
    color: "#F5C842",
    fontSize: 56,
    mobileFontSize: 38,
  },
  "TRIP FOURS! 🎲": {
    color: "#F5C842",
    fontSize: 56,
    mobileFontSize: 38,
  },
  "TRIP THREES! 🎲": {
    color: "#F5C842",
    fontSize: 56,
    mobileFontSize: 38,
  },
  "TRIP DEUCES! 🎲": {
    color: "#F5C842",
    fontSize: 56,
    mobileFontSize: 38,
  },
  "SHIT! 💩": {
    color: "#EF4444",
    fontSize: 72,
    mobileFontSize: 48,
    glow: "#EF4444",
    shake: true,
  },
  "DICK! 😂": {
    color: "#EF4444",
    fontSize: 64,
    mobileFontSize: 42,
    glow: "#EF4444",
  },
  "POUND! 🔵": {
    color: "#3B82F6",
    fontSize: 64,
    mobileFontSize: 42,
  },
  "POLICE! 🚔": {
    color: "#3B82F6",
    fontSize: 64,
    mobileFontSize: 42,
  },
  "ZOE! 🇭🇹": {
    color: "#10B981",
    fontSize: 64,
    mobileFontSize: 42,
  },
  "HAITIAN! 🇭🇹": {
    color: "#10B981",
    fontSize: 64,
    mobileFontSize: 42,
  },
  "GIRL! 👧": {
    color: "#EC4899",
    fontSize: 64,
    mobileFontSize: 42,
  },
  "HOE! 😅": {
    color: "#EC4899",
    fontSize: 64,
    mobileFontSize: 42,
  },
  "SHORTLY! 👶": {
    color: "#A855F7",
    fontSize: 64,
    mobileFontSize: 42,
  },
  "JIT! 👶": {
    color: "#A855F7",
    fontSize: 64,
    mobileFontSize: 42,
  },
};

export default function RollNameDisplay({
  rollName,
  result,
  onComplete,
}: RollNameDisplayProps) {
  const [visible, setVisible] = useState(false);
  const [opacity, setOpacity] = useState(0);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    if (!rollName) {
      setVisible(false);
      setOpacity(0);
      setScale(0.5);
      return;
    }

    setVisible(true);
    setOpacity(0);
    setScale(0.5);

    const isNoCount = rollName.includes("No Count");
    const holdTime = isNoCount ? 1200 : 2500;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setOpacity(1);
        setScale(1.1);
        setTimeout(() => setScale(1), 200);
      });
    });

    const timer = setTimeout(() => {
      setOpacity(0);
      setScale(0.8);
      setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 300);
    }, holdTime);

    return () => clearTimeout(timer);
  }, [rollName, onComplete]);

  if (!visible || !rollName) return null;

  const rollStyle = ROLL_STYLES[rollName] || {
    color: rollName.includes("No Count")
      ? "#6B7280"
      : result === "instant_win"
        ? "#F5C842"
        : "#EF4444",
    fontSize: rollName.includes("No Count") ? 28 : 56,
    mobileFontSize: rollName.includes("No Count") ? 22 : 38,
  };

  const isMobile =
    typeof window !== "undefined" && window.innerWidth < 640;

  return (
    <>
      <style>{`
        @keyframes rollNameShake {
          0%, 100% { transform: translateX(0) scale(${scale}) }
          20% { transform: translateX(-8px) scale(${scale}) }
          40% { transform: translateX(8px) scale(${scale}) }
          60% { transform: translateX(-4px) scale(${scale}) }
          80% { transform: translateX(4px) scale(${scale}) }
        }
      `}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 20,
          pointerEvents: "none",
          opacity,
          transition: "opacity 0.3s ease",
        }}
      >
        <div
          style={{
            fontFamily: '"Cinzel Decorative", serif',
            fontSize: isMobile ? `clamp(24px, 8vw, 52px)` : rollStyle.fontSize,
            fontWeight: 900,
            color: rollStyle.color,
            textAlign: "center",
            textShadow: rollStyle.glow
              ? `0 0 20px ${rollStyle.glow},
               0 0 40px ${rollStyle.glow}80,
               0 0 60px ${rollStyle.glow}40`
              : "none",
            transform: `scale(${scale})`,
            transition: "transform 0.2s ease",
            animation: rollStyle.shake
              ? "rollNameShake 0.5s ease-in-out"
              : "none",
            padding: "0 16px",
            lineHeight: 1.2,
            letterSpacing: "0.02em",
          }}
        >
          {rollName}
        </div>
      </div>
    </>
  );
}
