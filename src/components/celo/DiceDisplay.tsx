"use client";

import Dice3D from "@/components/celo/Dice3D";

export interface DiceDisplayProps {
  dice: [number, number, number] | null;
  rolling: boolean;
  animKey: number;
  diceColor?: string;
  size?: number;
}

const COLOR_TO_TYPE: Record<
  string,
  "standard" | "gold" | "street" | "midnight" | "diamond" | "blood" | "fire"
> = {
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
 * Three 3D dice; `animKey` bumps so spin keyframes restart when a new roll starts.
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

  return (
    <div className="flex flex-1 w-full items-center justify-center gap-1.5 px-1.5 sm:gap-3 sm:px-2">
      {[0, 1, 2].map((i) => (
        <Dice3D
          key={`${animKey}-${i}`}
          value={faces[i] ?? 1}
          rolling={rolling}
          diceType={diceType}
          size={size}
          dieIndex={i as 0 | 1 | 2}
        />
      ))}
    </div>
  );
}
