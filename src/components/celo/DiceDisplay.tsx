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
  const faces: [number, number, number] =
    dice && dice.length === 3
      ? [dice[0] ?? 1, dice[1] ?? 1, dice[2] ?? 1]
      : [1, 1, 1];

  const delays = [0, 133, 266];

  return (
    <div className="flex w-full flex-1 items-center justify-center gap-1.5 px-1.5 sm:gap-3 sm:px-2">
      {[0, 1, 2].map((i) => (
        <DiceFace
          key={`${animKey}-${i}`}
          value={faces[i] ?? 1}
          rolling={rolling}
          diceType={diceType}
          size={size}
          delay={delays[i]}
        />
      ))}
    </div>
  );
}
