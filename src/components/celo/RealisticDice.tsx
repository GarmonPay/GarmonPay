"use client";

const DOT: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 22],
    [72, 22],
    [28, 50],
    [72, 50],
    [28, 78],
    [72, 78],
  ],
};

function DieFace({
  value,
  rolling,
  index,
}: {
  value: number;
  rolling: boolean;
  index: number;
}) {
  const isRolling = Boolean(rolling);
  const v = value >= 1 && value <= 6 ? value : 1;
  const dots = DOT[v] ?? DOT[1];
  const tumbleDur = `${1.1 + index * 0.12}s`;
  const spinDur = `${0.85 + index * 0.15}s`;

  return (
    <div
      className={isRolling ? "celo-die-tumble" : ""}
      style={{
        width: 76,
        height: 76,
        ["--celo-tumble-dur" as string]: tumbleDur,
        background: "linear-gradient(145deg, #faf8f2 0%, #e8e4dc 45%, #d4cfc4 100%)",
        boxShadow: rolling
          ? "0 12px 28px rgba(0,0,0,0.45), 0 0 2px rgba(255,255,255,0.5) inset"
          : "0 10px 22px rgba(0,0,0,0.5), 0 0 1px rgba(0,0,0,0.4) inset, 0 1px 0 rgba(255,255,255,0.65) inset",
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 16,
        position: "relative",
        flexShrink: 0,
        filter: isRolling ? "blur(0.3px)" : undefined,
      }}
    >
      {!isRolling &&
        dots.map(([cx, cy], di) => (
          <div
            key={di}
            className="absolute rounded-full"
            style={{
              width: 13,
              height: 13,
              background: "radial-gradient(circle at 35% 35%, #1a1a1a, #000)",
              left: `${cx}%`,
              top: `${cy}%`,
              transform: "translate(-50%, -50%)",
              boxShadow: "0 1px 2px rgba(255,255,255,0.25) inset",
            }}
          />
        ))}
      {isRolling ? (
        <div
          className="celo-spin-blur absolute inset-0 flex items-center justify-center text-[28px] opacity-90"
          style={{ ["--celo-spin-dur" as string]: spinDur }}
        >
          ✦
        </div>
      ) : null}
    </div>
  );
}

/**
 * Premium table dice — ivory faces, inset highlight, tumble + motion during roll.
 */
export function RealisticDice({
  dice,
  rolling,
}: {
  dice: number[] | null;
  rolling: boolean;
}) {
  const isRolling = Boolean(rolling);
  const display: [number, number, number] =
    dice && dice.length >= 3
      ? [dice[0] || 1, dice[1] || 1, dice[2] || 1]
      : [1, 1, 1];

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 px-2 py-4">
      {[0, 1, 2].map((i) => (
        <DieFace key={i} index={i} value={display[i]} rolling={isRolling} />
      ))}
    </div>
  );
}
