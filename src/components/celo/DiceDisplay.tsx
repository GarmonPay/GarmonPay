"use client";

import styles from "./DiceDisplay.module.css";

const DOT = "#1A1008";
const FACE_BG = "#F5F0E8";
const BORDER = "#D4C5A0";

function Pip() {
  return (
    <span
      className="rounded-full shrink-0"
      style={{
        width: 14,
        height: 14,
        backgroundColor: DOT,
      }}
    />
  );
}

/** 3×3 grid of pips for one die face (value 1–6). */
function DieFace({ value }: { value: number }) {
  const v = Math.min(6, Math.max(1, Math.round(value)));
  const grid: (boolean | null)[][] = [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];
  const set = (r: number, c: number) => {
    grid[r]![c] = true;
  };
  if (v === 1) set(1, 1);
  else if (v === 2) {
    set(0, 0);
    set(2, 2);
  } else if (v === 3) {
    set(0, 0);
    set(1, 1);
    set(2, 2);
  } else if (v === 4) {
    set(0, 0);
    set(0, 2);
    set(2, 0);
    set(2, 2);
  } else if (v === 5) {
    set(0, 0);
    set(0, 2);
    set(1, 1);
    set(2, 0);
    set(2, 2);
  } else {
    set(0, 0);
    set(0, 2);
    set(1, 0);
    set(1, 2);
    set(2, 0);
    set(2, 2);
  }

  return (
    <div
      className="flex items-center justify-center rounded-lg sm:w-[80px] sm:h-[80px] w-[60px] h-[60px]"
      style={{
        backgroundColor: FACE_BG,
        border: `2px solid ${BORDER}`,
        boxShadow: "3px 3px 8px rgba(0,0,0,0.4)",
      }}
    >
      <div className="grid grid-cols-3 gap-0.5 w-[42px] h-[42px] sm:w-[50px] sm:h-[50px] place-items-center">
        {grid.flatMap((row, ri) =>
          row.map((cell, ci) => (
            <div key={`${ri}-${ci}`} className="w-[14px] h-[14px] flex items-center justify-center">
              {cell ? <Pip /> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const rollClass = [styles.dieRolling1, styles.dieRolling2, styles.dieRolling3] as const;

export type DiceDisplayProps = {
  /** Three die values 1–6; defaults to 1,1,1 when absent. */
  values: readonly [number, number, number];
  rolling: boolean;
};

export default function DiceDisplay({ values, rolling }: DiceDisplayProps) {
  const a = values[0] ?? 1;
  const b = values[1] ?? 1;
  const c = values[2] ?? 1;

  return (
    <div className="flex flex-row items-center justify-center gap-4">
      {[a, b, c].map((val, i) => (
        <div
          key={i}
          className={`${styles.dieWrap} ${rolling ? rollClass[i] ?? styles.dieRolling2 : ""}`}
          style={{ transformStyle: "preserve-3d" }}
        >
          <DieFace value={val} />
        </div>
      ))}
    </div>
  );
}
