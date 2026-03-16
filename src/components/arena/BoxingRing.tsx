"use client";

import "./boxing-ring.css";
import type { FighterData } from "@/lib/arena-fighter-types";
import type { FighterAnimation } from "@/lib/arena-fighter-types";
import { FighterDisplay } from "@/components/arena/FighterDisplay";

export type BoxingRingMode = "fight" | "profile" | "setup" | "victory";
export type RingAnimationState =
  | "idle"
  | "big_hit"
  | "knockdown"
  | "round_start"
  | "round_end"
  | "ko"
  | "victory";

export interface BoxingRingProps {
  mode: BoxingRingMode;
  fighterA: FighterData;
  fighterB?: FighterData | null;
  winner?: "a" | "b" | null;
  currentRound?: number;
  animation?: RingAnimationState;
  /** Fighter A display animation (fight/victory mode) */
  fighterAAnimation?: FighterAnimation;
  /** Fighter B display animation (fight/victory mode) */
  fighterBAnimation?: FighterAnimation;
  /** Optional: health 0–100 for HP bars in fight mode */
  healthA?: number;
  healthB?: number;
  /** Optional: last action key for fighter A (e.g. JAB, HOOK) for punch animation */
  lastAction?: string | null;
  /** Optional: show action buttons (fight mode only) */
  children?: React.ReactNode;
}

const GOLD = "#f0a500";
const RED = "#c1272d";
const NAVY = "#0f172a";

export function BoxingRing({
  mode,
  fighterA,
  fighterB = null,
  winner = null,
  currentRound = 1,
  animation = "idle",
  fighterAAnimation,
  fighterBAnimation,
  healthA = 100,
  healthB = 100,
  lastAction,
  children,
}: BoxingRingProps) {
  const isVictory = mode === "victory" || winner != null;
  const iWon = winner === "a";
  const showVS = mode === "setup" && fighterB;
  const animA = fighterAAnimation ?? (mode === "victory" ? (iWon ? "victory" : "defeat") : animation === "ko" && !iWon ? "ko" : "idle");
  const animB = fighterBAnimation ?? (mode === "victory" ? (iWon ? "defeat" : "victory") : animation === "ko" && iWon ? "ko" : "idle");
  const ringClass = [
    "arena-boxing-ring",
    `arena-ring-mode-${mode}`,
    `arena-ring-anim-${animation}`,
    isVictory ? "arena-ring-victory" : "",
    winner === "a" ? "arena-ring-winner-a" : winner === "b" ? "arena-ring-winner-b" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={ringClass} data-mode={mode}>
      <div className="arena-ring-backdrop">
        {/* Crowd silhouettes */}
        <div className="arena-ring-crowd" aria-hidden />
        {/* God rays / spotlights */}
        <div className="arena-ring-spotlights" aria-hidden />
        {/* Vignette */}
        <div className="arena-ring-vignette" aria-hidden />
      </div>

      <div className="arena-ring-stage">
        {/* 3/4 view ring */}
        <div className="arena-ring-perspective">
          <div className="arena-ring-platform">
            {/* Apron (skirt) */}
            <div className="arena-ring-apron">
              <span className="arena-ring-apron-text">GARMONPAY ARENA</span>
            </div>

            {/* Canvas floor with corner squares */}
            <div className="arena-ring-canvas">
              <div className="arena-ring-corner arena-ring-corner-gold" data-corner="bl" />
              <div className="arena-ring-corner arena-ring-corner-red" data-corner="br" />
              <div className="arena-ring-corner arena-ring-corner-red" data-corner="tr" />
              <div className="arena-ring-corner arena-ring-corner-gold" data-corner="tl" />
              <div className="arena-ring-watermark" aria-hidden>
                GarmonPay
              </div>
            </div>

            {/* Ropes (4 ropes: gold, red, gold, red) */}
            <svg className="arena-ring-ropes" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="rope-gold" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#fcd34d" />
                  <stop offset="100%" stopColor="#b45309" />
                </linearGradient>
                <linearGradient id="rope-red" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#dc2626" />
                  <stop offset="100%" stopColor="#7f1d1d" />
                </linearGradient>
              </defs>
              {/* Rope 1 top */}
              <path fill="none" stroke="url(#rope-gold)" strokeWidth="1.8" strokeLinecap="round" d="M 8 18 Q 50 14 92 18" />
              {/* Rope 2 */}
              <path fill="none" stroke="url(#rope-red)" strokeWidth="1.8" strokeLinecap="round" d="M 8 28 Q 50 24 92 28" />
              {/* Rope 3 */}
              <path fill="none" stroke="url(#rope-gold)" strokeWidth="1.8" strokeLinecap="round" d="M 8 38 Q 50 34 92 38" />
              {/* Rope 4 bottom */}
              <path fill="none" stroke="url(#rope-red)" strokeWidth="1.8" strokeLinecap="round" d="M 8 48 Q 50 44 92 48" />
            </svg>

            {/* Corner posts (chrome) */}
            <div className="arena-ring-post arena-ring-post-tl" />
            <div className="arena-ring-post arena-ring-post-tr" />
            <div className="arena-ring-post arena-ring-post-bl arena-ring-pad-gold" />
            <div className="arena-ring-post arena-ring-post-br arena-ring-pad-red" />
          </div>
        </div>

        {/* Fighters on canvas */}
        <div className="arena-ring-fighters">
          {mode === "profile" && (
            <div className="arena-ring-fighter-single">
              <FighterDisplay fighter={fighterA} size="large" animation="idle" showStats showGear />
            </div>
          )}
          {(mode === "fight" || mode === "setup" || mode === "victory") && (
            <>
              <div className="arena-ring-fighter-a">
                <FighterDisplay
                  fighter={fighterA}
                  size="medium"
                  animation={animA}
                  action={lastAction ?? undefined}
                  showGear
                />
                {(mode === "fight" || mode === "victory") && (
                  <div className="arena-ring-hp arena-ring-hp-a">
                    <div className="arena-ring-hp-bar" style={{ width: `${healthA}%` }} />
                    <span className="arena-ring-hp-label">{fighterA.name}</span>
                  </div>
                )}
              </div>
              {fighterB && (
                <div className="arena-ring-fighter-b">
                  <FighterDisplay
                    fighter={fighterB}
                    size="medium"
                    animation={animB}
                    showGear
                    mirrored
                  />
                  {(mode === "fight" || mode === "victory") && (
                    <div className="arena-ring-hp arena-ring-hp-b">
                      <div className="arena-ring-hp-bar" style={{ width: `${healthB}%` }} />
                      <span className="arena-ring-hp-label">{fighterB.name}</span>
                    </div>
                  )}
                </div>
              )}
              {showVS && (
                <div className="arena-ring-vs" aria-hidden>
                  VS
                </div>
              )}
            </>
          )}
        </div>

        {/* Round badge (fight mode) */}
        {(mode === "fight" || mode === "setup") && (
          <div className="arena-ring-round">
            R{currentRound}
          </div>
        )}
      </div>

      {/* Controls / content slot below ring */}
      {children && <div className="arena-ring-controls">{children}</div>}
    </div>
  );
}
