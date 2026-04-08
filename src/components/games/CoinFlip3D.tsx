'use client'

import { useCallback, useEffect, useRef, useState } from "react";

const COIN_HEADS = "/images/coin-heads.png";
const GOLD = "#f5c842";

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
  const lastAnimatedGenRef = useRef(0);
  const reportedGenRef = useRef(0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const runFlipRotation = useCallback(() => {
    if (result == null) return;
    setRotateY((current) => {
      const mod = ((current % 360) + 360) % 360;
      const want = result === "heads" ? 0 : 180;
      let delta = want - mod;
      if (delta <= 0) delta += 360;
      const spins = 4 * 360;
      return current + spins + delta;
    });
  }, [result]);

  useEffect(() => {
    if (!isFlipping || result == null) return;
    if (flipGeneration <= lastAnimatedGenRef.current) return;
    lastAnimatedGenRef.current = flipGeneration;
    reportedGenRef.current = 0;
    requestAnimationFrame(() => runFlipRotation());
  }, [isFlipping, result, flipGeneration, runFlipRotation]);

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
      style={
        showWinGlow
          ? {
              boxShadow: "0 0 40px rgba(245, 200, 66, 0.6)",
            }
          : undefined
      }
    >
      <style>{`
        @keyframes coinflip-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        .coinflip-float-idle {
          animation: coinflip-float 3s ease-in-out infinite;
        }
      `}</style>

      <div
        className={`flex items-center justify-center ${!isFlipping ? "coinflip-float-idle" : ""}`}
        style={{ perspective: "1000px" }}
      >
        <div
          className="relative [transform-style:preserve-3d]"
          style={{
            width: 200,
            height: 200,
            transform: `rotateY(${rotateY}deg)`,
            transition: isFlipping
              ? "transform 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
              : "none",
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          {/* Front — heads */}
          <div
            className="absolute inset-0 rounded-full overflow-hidden [backface-visibility:hidden] [transform:rotateY(0deg)] border border-[#f5c842]/30"
            style={{ width: 200, height: 200 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- promotional asset, user-provided PNG */}
            <img
              src={COIN_HEADS}
              alt=""
              width={200}
              height={200}
              className="h-[200px] w-[200px] rounded-full object-cover"
              draggable={false}
            />
          </div>

          {/* Back — tails */}
          <div
            className="absolute inset-0 flex items-center justify-center rounded-full overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)] border border-[#f5c842]/25"
            style={{ width: 200, height: 200 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- promotional asset, user-provided PNG */}
            <img
              src={COIN_HEADS}
              alt=""
              width={200}
              height={200}
              className="absolute inset-0 h-[200px] w-[200px] rounded-full object-cover"
              style={{ filter: "brightness(0.85)" }}
              draggable={false}
            />
            <div
              className="relative z-10 px-4 text-center font-semibold leading-tight tracking-wide"
              style={{
                color: GOLD,
                fontSize: "13px",
                textShadow: "0 1px 2px rgba(0,0,0,0.8)",
              }}
            >
              BUILD YOUR WEALTH
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
