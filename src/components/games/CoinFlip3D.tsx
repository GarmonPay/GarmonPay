'use client'

import { useCallback, useEffect, useRef, useState } from "react";

const COIN_HEADS = "/images/coin-heads.png";
const COIN_TAILS = "/images/coin-tails.png";

const LANDING_MS = 420;

export type CoinFlip3DProps = {
  isFlipping: boolean;
  result: "heads" | "tails" | null;
  playerWon: boolean | null;
  /** Increments each API flip so the animation always runs. */
  flipGeneration: number;
  onResult: (face: "heads" | "tails") => void;
  className?: string;
};

export function CoinFlip3D({
  isFlipping,
  result,
  playerWon,
  flipGeneration,
  onResult,
  className = "",
}: CoinFlip3DProps) {
  const [rotateY, setRotateY] = useState(0);
  const landingScheduledForGenRef = useRef<number | null>(null);
  const reportedGenRef = useRef(0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const spinPhase = Boolean(isFlipping && result == null);

  useEffect(() => {
    if (spinPhase) setRotateY(0);
  }, [spinPhase]);

  const runLandingRotation = useCallback(() => {
    if (result == null) return;
    setRotateY((current) => {
      const mod = ((current % 360) + 360) % 360;
      const want = result === "heads" ? 0 : 180;
      let delta = want - mod;
      if (delta <= 0) delta += 360;
      const spins = 2 * 360;
      return current + spins + delta;
    });
  }, [result]);

  useEffect(() => {
    if (spinPhase) {
      landingScheduledForGenRef.current = null;
      return;
    }
    if (!isFlipping || result == null) return;
    if (landingScheduledForGenRef.current === flipGeneration) return;
    landingScheduledForGenRef.current = flipGeneration;
    reportedGenRef.current = 0;
    requestAnimationFrame(() => runLandingRotation());
  }, [spinPhase, isFlipping, result, flipGeneration, runLandingRotation]);

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== "transform") return;
    if (!isFlipping || result == null) return;
    if (reportedGenRef.current === flipGeneration) return;
    reportedGenRef.current = flipGeneration;
    onResultRef.current(result);
  };

  const showWinGlow = playerWon === true && !isFlipping;

  return (
    <div
      className={`relative w-full min-h-[280px] md:min-h-[360px] rounded-xl overflow-hidden border border-white/10 bg-[#0e0118] flex items-center justify-center p-8 ${className}`}
      style={{
        backgroundColor: "#0e0118",
        ...(showWinGlow
          ? {
              boxShadow: "0 0 40px rgba(245, 200, 66, 0.6)",
            }
          : {}),
      }}
    >
      <style>{`
        @keyframes coinflip-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        .coinflip-float-idle {
          animation: coinflip-float 3s ease-in-out infinite;
        }
        @keyframes cfIndefiniteSpin {
          from { transform: rotateY(0deg); }
          to { transform: rotateY(360deg); }
        }
        .cf-spin-phase {
          animation: cfIndefiniteSpin 0.28s linear infinite;
        }
      `}</style>

      <div
        className={`flex items-center justify-center ${!isFlipping ? "coinflip-float-idle" : ""}`}
        style={{ perspective: "1000px", backgroundColor: "#0e0118" }}
      >
        {spinPhase ? (
          <div
            key={`spin-${flipGeneration}`}
            className="relative [transform-style:preserve-3d] cf-spin-phase"
            style={{ width: 200, height: 200 }}
          >
            <div
              className="absolute inset-0 rounded-full overflow-hidden [backface-visibility:hidden] [transform:rotateY(0deg)] border border-[#f5c842]/30"
              style={{ width: 200, height: 200, backgroundColor: "transparent" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- promotional asset */}
              <img
                src={COIN_HEADS}
                alt=""
                width={200}
                height={200}
                className="h-[200px] w-[200px] rounded-full object-cover"
                style={{ mixBlendMode: "multiply" }}
                draggable={false}
              />
            </div>
            <div
              className="absolute inset-0 rounded-full overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)] border border-[#f5c842]/25"
              style={{ width: 200, height: 200, backgroundColor: "transparent" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={COIN_TAILS}
                alt=""
                width={200}
                height={200}
                className="block h-[200px] w-[200px] rounded-full object-cover"
                style={{ objectFit: "cover", borderRadius: "50%", mixBlendMode: "multiply" }}
                draggable={false}
              />
            </div>
          </div>
        ) : (
          <div
            key={`land-${flipGeneration}-${result ?? "x"}`}
            className="relative [transform-style:preserve-3d]"
            style={{
              width: 200,
              height: 200,
              transform: `rotateY(${rotateY}deg)`,
              transition: isFlipping && result != null
                ? `transform ${LANDING_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
                : "none",
            }}
            onTransitionEnd={handleTransitionEnd}
          >
            <div
              className="absolute inset-0 rounded-full overflow-hidden [backface-visibility:hidden] [transform:rotateY(0deg)] border border-[#f5c842]/30"
              style={{ width: 200, height: 200, backgroundColor: "transparent" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={COIN_HEADS}
                alt=""
                width={200}
                height={200}
                className="h-[200px] w-[200px] rounded-full object-cover"
                style={{ mixBlendMode: "multiply" }}
                draggable={false}
              />
            </div>
            <div
              className="absolute inset-0 rounded-full overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)] border border-[#f5c842]/25"
              style={{ width: 200, height: 200, backgroundColor: "transparent" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={COIN_TAILS}
                alt=""
                width={200}
                height={200}
                className="block h-[200px] w-[200px] rounded-full object-cover"
                style={{
                  objectFit: "cover",
                  borderRadius: "50%",
                  mixBlendMode: "multiply",
                }}
                draggable={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
