"use client";

import { useEffect, useState } from "react";

interface Props {
  rollName: string | null;
  onComplete?: () => void;
}

const STYLES: Record<
  string,
  {
    color: string;
    size: number;
    mobileSize: number;
    glow?: string;
    shake?: boolean;
  }
> = {
  "C-LO": {
    color: "#F5C842",
    size: 72,
    mobileSize: 48,
    glow: "#F5C842",
  },
  "HAND CRACK": {
    color: "#F5C842",
    size: 64,
    mobileSize: 42,
    glow: "#F5C842",
  },
  "TRIP SIXES": {
    color: "#F5C842",
    size: 56,
    mobileSize: 38,
  },
  "ACE OUT": {
    color: "#F5C842",
    size: 64,
    mobileSize: 42,
    glow: "#F5C842",
  },
  TRIP: {
    color: "#F5C842",
    size: 56,
    mobileSize: 38,
  },
  SHIT: {
    color: "#EF4444",
    size: 72,
    mobileSize: 48,
    glow: "#EF4444",
    shake: true,
  },
  DICK: {
    color: "#EF4444",
    size: 64,
    mobileSize: 42,
  },
  POUND: { color: "#3B82F6", size: 60, mobileSize: 40 },
  POLICE: { color: "#3B82F6", size: 60, mobileSize: 40 },
  ZOE: { color: "#10B981", size: 60, mobileSize: 40 },
  HAITIAN: { color: "#10B981", size: 60, mobileSize: 40 },
  GIRL: { color: "#EC4899", size: 60, mobileSize: 40 },
  HOE: { color: "#EC4899", size: 60, mobileSize: 40 },
  SHORTLY: { color: "#A855F7", size: 60, mobileSize: 40 },
  JIT: { color: "#A855F7", size: 60, mobileSize: 40 },
};

function getStyle(rollName: string) {
  const upper = rollName.toUpperCase();
  for (const [key, val] of Object.entries(STYLES)) {
    if (upper.includes(key)) return val;
  }
  return {
    color: "#9CA3AF",
    size: 28,
    mobileSize: 22,
  };
}

export default function RollNameDisplay({ rollName, onComplete }: Props) {
  const [visible, setVisible] = useState(false);
  const [opacity, setOpacity] = useState(0);
  const [scale, setScale] = useState(0.5);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const m = () =>
      setIsMobile(
        typeof window !== "undefined" && window.innerWidth < 640
      );
    m();
    window.addEventListener("resize", m);
    return () => window.removeEventListener("resize", m);
  }, []);

  useEffect(() => {
    if (!rollName) {
      setVisible(false);
      return;
    }

    setVisible(true);
    setOpacity(0);
    setScale(0.5);

    const isNoCount = rollName.toLowerCase().includes("no count");
    const holdMs = isNoCount ? 1000 : 2500;

    const raf1 = requestAnimationFrame(() => {
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
    }, holdMs);

    return () => {
      cancelAnimationFrame(raf1);
      clearTimeout(timer);
    };
  }, [rollName, onComplete]);

  if (!visible || !rollName) return null;

  const style = getStyle(rollName);

  return (
    <>
      <style>{`
        @keyframes screenShake {
          0%,100% { transform: translateX(0) scale(1) }
          20% { transform: translateX(-10px) scale(1) }
          40% { transform: translateX(10px) scale(1) }
          60% { transform: translateX(-5px) scale(1) }
          80% { transform: translateX(5px) scale(1) }
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
            fontFamily: "var(--font-cinzel-decorative), 'Cinzel Decorative', ui-serif, serif",
            fontSize: isMobile ? style.mobileSize : style.size,
            fontWeight: 900,
            color: style.color,
            textAlign: "center",
            textShadow: style.glow
              ? `0 0 20px ${style.glow},
               0 0 40px ${style.glow}80`
              : "none",
            transform: `scale(${scale})`,
            transition: "transform 0.2s ease",
            animation: style.shake ? "screenShake 0.5s ease-in-out" : "none",
            padding: "0 12px",
            lineHeight: 1.1,
            letterSpacing: "0.02em",
          }}
        >
          {rollName}
        </div>
      </div>
    </>
  );
}
