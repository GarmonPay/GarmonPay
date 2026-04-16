"use client";

import { RealisticDice } from "@/components/celo/RealisticDice";
import { CeloHandThrow } from "@/components/celo/CeloHandThrow";

export type DiceUiPhase = "idle" | "rolling" | "revealing" | "completed";

export function CeloDiceStage({
  dice,
  rolling,
  phase,
  statusLine,
  showHand,
}: {
  dice: number[] | null;
  rolling: boolean;
  phase: DiceUiPhase;
  statusLine: string;
  showHand: boolean;
}) {
  const showHandUi = Boolean(showHand);
  return (
    <div className="relative min-h-[200px]">
      {showHandUi ? <CeloHandThrow active={phase === "rolling" || phase === "revealing"} /> : null}
      <RealisticDice dice={dice} rolling={rolling} />
      {statusLine ? (
        <p
          className="text-center text-xs font-semibold tracking-wide text-[#F5C842]/95 mt-2 px-2"
          role="status"
          aria-live="polite"
        >
          {statusLine}
        </p>
      ) : null}
    </div>
  );
}
