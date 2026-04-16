"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Cinzel_Decorative } from "next/font/google";

const cinzel = Cinzel_Decorative({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });

export type RollResultKind = "instant_win" | "instant_loss" | "point" | "no_count" | null;

type Props = {
  rollName: string | null;
  result: RollResultKind;
};

function classify(name: string | null): {
  durationMs: number;
  key: string;
} {
  if (!name || !name.trim()) return { durationMs: 0, key: "none" };
  const u = name.toUpperCase();

  if (u.includes("NO POINT") || u.includes("RE-ROLL") || u.includes("NO COUNT") || u.includes("ROLL AGAIN")) {
    return { durationMs: 1500, key: "nocount" };
  }
  if (u.includes("C-LO") || u.includes("4-5-6")) return { durationMs: 3000, key: "clo" };
  if (u.includes("HAND CRACK") || u.includes("PAIR + 6")) return { durationMs: 3000, key: "crack" };
  if (u.includes("TRIP") && u.includes("SIX")) return { durationMs: 3000, key: "trip6" };
  if (u.includes("ACE OUT")) return { durationMs: 3000, key: "aceout" };
  if (u.includes("SHIT") || u.includes("ACE-DEUCE") || u.includes("1-2-3")) return { durationMs: 3000, key: "shit" };
  if (u.includes("DICK") || u.includes("PAIR + 1")) return { durationMs: 3000, key: "dick" };
  if (u.includes("POLICE") || u.includes("POUND") || u.includes("POINT 5")) return { durationMs: 2500, key: "police" };
  if (u.includes("ZOE") || u.includes("HAITIAN") || u.includes("POINT 4")) return { durationMs: 2500, key: "zoe" };
  if (u.includes("GIRL") || u.includes("HOE") || u.includes("POINT 3")) return { durationMs: 2500, key: "girl" };
  if (u.includes("SHORTLY") || u.includes("JIT") || u.includes("POINT 2")) return { durationMs: 2500, key: "short" };
  return { durationMs: 2500, key: "default" };
}

export default function RollNameDisplay({ rollName, result }: Props) {
  const [visible, setVisible] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!rollName) {
      setVisible(false);
      return;
    }
    const { durationMs, key } = classify(rollName);
    if (durationMs <= 0) return;

    setVisible(true);
    if (key === "clo") setFlash("gold");
    else if (key === "shit" || key === "dick") setFlash("red");
    else if (key === "police") setFlash("blue");
    else if (key === "zoe") setFlash("green");
    const tFlash = window.setTimeout(() => setFlash(null), key === "clo" ? 280 : 220);
    const tHide = window.setTimeout(() => setVisible(false), durationMs);
    return () => {
      window.clearTimeout(tFlash);
      window.clearTimeout(tHide);
    };
  }, [rollName, result]);

  if (!rollName || !visible) return null;

  const { key } = classify(rollName);

  const base: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "42%",
    transform: "translate(-50%, -50%)",
    zIndex: 20,
    textAlign: "center",
    pointerEvents: "none",
    maxWidth: "96vw",
    padding: "0 12px",
  };

  const textBase: CSSProperties = {
    fontFamily: cinzel.style.fontFamily,
    fontWeight: 700,
    textShadow: "0 4px 24px rgba(0,0,0,0.85)",
    lineHeight: 1.1,
  };

  const overlayFlash =
    flash === "gold" ? (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          background: "radial-gradient(circle at 50% 40%, rgba(245,200,66,0.35), transparent 55%)",
          pointerEvents: "none",
          animation: "flashGold 0.35s ease-out",
        }}
      />
    ) : flash === "red" ? (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          background: "rgba(239,68,68,0.12)",
          pointerEvents: "none",
          animation: "shakeFlash 0.5s ease-out",
        }}
      />
    ) : flash === "blue" ? (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          background: "rgba(59,130,246,0.12)",
          pointerEvents: "none",
        }}
      />
    ) : flash === "green" ? (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          background: "rgba(16,185,129,0.1)",
          pointerEvents: "none",
        }}
      />
    ) : null;

  const particles =
    key === "clo" ? (
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: -40,
          background:
            "radial-gradient(circle, rgba(245,200,66,0.45) 0%, transparent 45%), radial-gradient(circle at 80% 20%, rgba(245,200,66,0.3), transparent 40%)",
          filter: "blur(8px)",
          opacity: 0.9,
          animation: "particlePop 0.8s ease-out forwards",
        }}
      />
    ) : null;

  const crackLines =
    key === "crack" ? (
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: -30,
          opacity: 0.5,
          background:
            "repeating-conic-gradient(from 0deg, transparent 0 8deg, rgba(245,200,66,0.4) 8deg 9deg)",
          animation: "spinSlow 4s linear infinite",
        }}
      />
    ) : null;

  const crown =
    key === "trip6" ? (
      <div style={{ fontSize: 36, marginBottom: 4, animation: "dropCrown 0.6s ease-out forwards" }}>👑</div>
    ) : null;

  let fontSize = 52;
  let color = "#F5C842";
  let anim = "popIn 0.5s ease-out forwards";

  if (key === "clo") fontSize = 72;
  else if (key === "crack" || key === "shit" || key === "dick") fontSize = key === "shit" ? 72 : 64;
  else if (key === "trip6") fontSize = 56;
  else if (key === "aceout") fontSize = 64;
  else if (key === "nocount") {
    fontSize = 36;
    color = "#6B7280";
    anim = "fadeIn 0.4s ease-out forwards";
  }
  if (key === "shit" || key === "dick") color = "#EF4444";
  if (key === "police") color = "#3B82F6";
  if (key === "zoe") color = "#10B981";
  if (key === "girl") color = "#EC4899";
  if (key === "short") color = "#A855F7";

  const rainbow = key === "trip6" ? { backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent", backgroundImage: "linear-gradient(90deg,#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7)" } : {};

  return (
    <>
      <style>{`
        @keyframes popIn {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes flashGold {
          from { opacity: 0.9; }
          to { opacity: 0; }
        }
        @keyframes shakeFlash {
          0%, 100% { transform: translate(0,0); }
          25% { transform: translate(-3px, 2px); }
          50% { transform: translate(3px, -2px); }
          75% { transform: translate(-2px, -1px); }
        }
        @keyframes particlePop {
          from { transform: scale(0.6); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes spinSlow {
          to { transform: rotate(360deg); }
        }
        @keyframes dropCrown {
          from { transform: translateY(-40px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes laugh {
          0%, 100% { transform: rotate(-2deg); }
          50% { transform: rotate(2deg) scale(1.02); }
        }
      `}</style>
      {overlayFlash}
      <div style={base} className={cinzel.className}>
        {particles}
        {crackLines}
        <div style={{ position: "relative", display: "inline-block" }}>
          {crown}
          <div
            style={{
              ...textBase,
              fontSize,
              color: key === "trip6" ? undefined : color,
              ...rainbow,
              animation: key === "dick" ? "laugh 0.4s ease-in-out infinite" : anim,
            }}
          >
            {rollName}
          </div>
        </div>
      </div>
    </>
  );
}
