"use client";

import { useEffect, useState } from "react";

interface Props {
  rollName: string | null;
  point?: number | null;
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
  DICE: {
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
  if (upper.includes("NO POINT")) {
    return {
      color: "#9CA3AF",
      size: 28,
      mobileSize: 22,
    };
  }
  for (const [key, val] of Object.entries(STYLES)) {
    if (upper.includes(key)) {
      if (upper.includes("AUTOMATIC LOSS") || upper.includes("AUTOMATIC WIN")) {
        return {
          ...val,
          size: Math.min(val.size, 52),
          mobileSize: Math.min(val.mobileSize, 34),
        };
      }
      return val;
    }
  }
  return {
    color: "#9CA3AF",
    size: 28,
    mobileSize: 22,
  };
}

export default function RollNameDisplay({ rollName, point, onComplete }: Props) {
  const [visible, setVisible] = useState(false);
  const [opacity, setOpacity] = useState(0);
  const [scale, setScale] = useState(0.9);
  const [isMobile, setIsMobile] = useState(false);
  const [showPointLine, setShowPointLine] = useState(false);

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
    setScale(0.9);
    setShowPointLine(false);

    const isNoCount =
      rollName.toLowerCase().includes("no count") ||
      rollName.toLowerCase().includes("no point");
    const holdMs = isNoCount ? 1200 : 2600;
    const showPointTimerMs = 1000;

    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setOpacity(1);
        setScale(1.05);
        setTimeout(() => setScale(1), 220);
      });
    });
    const phaseTimer = setTimeout(() => {
      if (typeof point === "number" && Number.isFinite(point)) {
        setShowPointLine(true);
      }
    }, showPointTimerMs);

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
      clearTimeout(phaseTimer);
      clearTimeout(timer);
    };
  }, [rollName, point, onComplete]);

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
          transition: "opacity 0.35s ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "-10%",
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.56) 65%, rgba(0,0,0,0) 100%)",
            filter: "blur(2px)",
            opacity: 0.85,
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: isMobile ? 4 : 6,
            fontFamily: "var(--font-cinzel-decorative), 'Cinzel Decorative', ui-serif, serif",
            fontSize: isMobile ? style.mobileSize : style.size,
            fontWeight: 900,
            textAlign: "center",
            transform: `scale(${scale})`,
            transition: "transform 0.28s ease",
            animation: style.shake ? "screenShake 0.5s ease-in-out" : "none",
            padding: "0 12px",
            lineHeight: 1.1,
            letterSpacing: "0.02em",
          }}
        >
          <div
            style={{
              background: "linear-gradient(180deg, #FFE8A3 0%, #F5C842 52%, #B8860B 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: style.color,
              textShadow: style.glow
                ? `0 0 14px ${style.glow}AA, 0 0 30px ${style.glow}66`
                : "0 0 12px rgba(245,200,66,0.4)",
            }}
          >
            {rollName}
          </div>
          <div
            style={{
              fontFamily: "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif",
              fontSize: isMobile ? 16 : 19,
              fontWeight: 700,
              color: "#F6E7B0",
              opacity: showPointLine ? 0.96 : 0,
              transform: showPointLine ? "translateY(0)" : "translateY(6px)",
              transition: "opacity 0.28s ease, transform 0.28s ease",
              letterSpacing: "0.06em",
            }}
          >
            {rollName}
            {typeof point === "number" &&
            Number.isFinite(point) &&
            !/\bPOINT\s*\d+/i.test(rollName)
              ? ` • POINT ${point}`
              : ""}
          </div>
          <div
            style={{
              fontFamily: "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif",
              fontSize: isMobile ? 10 : 11,
              fontWeight: 500,
              letterSpacing: "0.03em",
              color: "#F8EFD0",
              opacity: showPointLine ? 0.55 : 0,
              transform: showPointLine ? "translateY(0)" : "translateY(4px)",
              transition: "opacity 0.28s ease, transform 0.28s ease",
            }}
          >
            Roll higher to win • Match to push • Lower to lose
          </div>
        </div>
      </div>
    </>
  );
}
