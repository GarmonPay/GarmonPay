"use client";

import { useEffect } from "react";
import styles from "./DiceDisplay.module.css";

const DOT = "#1A1008";

function Pip() {
  return (
    <span
      className="rounded-full shrink-0 block"
      style={{
        width: 14,
        height: 14,
        backgroundColor: DOT,
      }}
    />
  );
}

/** Pip pattern for one face (value 1–6). */
function PipGrid({ value }: { value: number }) {
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
    <div className="flex items-center justify-center w-full h-full p-1">
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

/**
 * One physical die as a CSS 3D cube (six faces). Opposite faces sum to 7 like real dice.
 * When `rolling`, the outer wrapper tumbles; the cube then settles showing `value` toward camera.
 */
function DieCube({
  value,
  rolling,
  rollClass,
}: {
  value: number;
  rolling: boolean;
  rollClass: string;
}) {
  const v = Math.min(6, Math.max(1, Math.round(value)));
  const showClasses = [
    styles.cubeShow1,
    styles.cubeShow2,
    styles.cubeShow3,
    styles.cubeShow4,
    styles.cubeShow5,
    styles.cubeShow6,
  ] as const;

  return (
    <div className={styles.perspective}>
      <div className={`${styles.dieAnimWrap} ${rolling ? rollClass : ""}`}>
        <div className={`${styles.cube} ${showClasses[v - 1]}`}>
          <div className={`${styles.face} ${styles.faceFront}`}>
            <div className={styles.faceInner}>
              <PipGrid value={1} />
            </div>
          </div>
          <div className={`${styles.face} ${styles.faceBack}`}>
            <div className={styles.faceInner}>
              <PipGrid value={6} />
            </div>
          </div>
          <div className={`${styles.face} ${styles.faceRight}`}>
            <div className={styles.faceInner}>
              <PipGrid value={3} />
            </div>
          </div>
          <div className={`${styles.face} ${styles.faceLeft}`}>
            <div className={styles.faceInner}>
              <PipGrid value={4} />
            </div>
          </div>
          <div className={`${styles.face} ${styles.faceTop}`}>
            <div className={styles.faceInner}>
              <PipGrid value={2} />
            </div>
          </div>
          <div className={`${styles.face} ${styles.faceBottom}`}>
            <div className={styles.faceInner}>
              <PipGrid value={5} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const rollClass = [styles.dieRolling1, styles.dieRolling2, styles.dieRolling3] as const;

export type DiceDisplayProps = {
  values: readonly [number, number, number];
  rolling: boolean;
  animEpoch?: number;
  /** Set env NEXT_PUBLIC_CELO_DEBUG_DICE=1 to show raw pip values under dice (dev only). */
  debugShowValues?: boolean;
};

export default function DiceDisplay({
  values,
  rolling,
  animEpoch = 0,
  debugShowValues = false,
}: DiceDisplayProps) {
  const a = values[0] ?? 1;
  const b = values[1] ?? 1;
  const c = values[2] ?? 1;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    console.log("[DiceDisplay] values from server/state:", a, b, c);
  }, [a, b, c]);

  return (
    <div className={`${styles.diceRow} flex flex-col items-center justify-center gap-2`}>
      <div className="flex flex-row items-center justify-center" style={{ gap: 16 }}>
        {[a, b, c].map((val, i) => (
          <DieCube
            key={`${animEpoch}-${i}`}
            value={val}
            rolling={rolling}
            rollClass={rollClass[i] ?? styles.dieRolling2}
          />
        ))}
      </div>
      {debugShowValues ? (
        <p className="text-gray-500 text-[11px] font-mono">
          Rolled: {a}-{b}-{c}
        </p>
      ) : null}
    </div>
  );
}
