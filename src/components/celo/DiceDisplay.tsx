"use client";

import DiceFace from "@/components/celo/DiceFace";
import type { DiceFaceType } from "@/components/celo/DiceFace";

export interface DiceDisplayProps {
  dice: [number, number, number] | null;
  rolling: boolean;
  animKey: number;
  diceColor?: string;
  size?: number;
}

function clampDie(n: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (!Number.isFinite(n)) return 1;
  const x = Math.min(6, Math.max(1, Math.round(n)));
  return x as 1 | 2 | 3 | 4 | 5 | 6;
}

const COLOR_TO_TYPE: Record<string, DiceFaceType> = {
  red: "standard",
  gold: "gold",
  green: "street",
  black: "midnight",
  street: "street",
  standard: "standard",
  diamond: "diamond",
  blood: "blood",
  fire: "fire",
};

/**
 * Three dice faces; `animKey` bumps so animations restart when a new roll starts.
 */
export function DiceDisplay({
  dice,
  rolling,
  animKey,
  diceColor = "green",
  size = 52,
}: DiceDisplayProps) {
  const diceType = COLOR_TO_TYPE[diceColor.toLowerCase()] ?? "street";
  const delays = [0, 133, 266];

  if (rolling) {
    return (
      <div className="flex w-full flex-1 items-center justify-center gap-1.5 px-1.5 sm:gap-3 sm:px-2">
        {[0, 1, 2].map((i) => (
          <DiceFace
            key={`${animKey}-roll-${i}`}
            value={1}
            rolling
            diceType={diceType}
            size={size}
            delay={delays[i]}
          />
        ))}
      </div>
    );
  }

  if (!dice || dice.length !== 3) {
    return (
      <div className="flex w-full flex-1 flex-col items-center justify-center px-2 text-center text-xs text-zinc-500">
        Waiting for roll…
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 items-center justify-center gap-1.5 px-1.5 sm:gap-3 sm:px-2">
      {[0, 1, 2].map((i) => (
        <DiceFace
          key={`${animKey}-${i}`}
          value={clampDie(dice[i] ?? 1)}
          rolling={false}
          diceType={diceType}
          size={size}
          delay={delays[i]}
        />
      ))}
    </div>
  );
}
