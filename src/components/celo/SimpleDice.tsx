"use client";

const DOT_POSITIONS: Record<number, number[][]> = {
  1: [[50, 50]],
  2: [
    [25, 25],
    [75, 75],
  ],
  3: [
    [25, 25],
    [50, 50],
    [75, 75],
  ],
  4: [
    [25, 25],
    [75, 25],
    [25, 75],
    [75, 75],
  ],
  5: [
    [25, 25],
    [75, 25],
    [50, 50],
    [25, 75],
    [75, 75],
  ],
  6: [
    [25, 20],
    [75, 20],
    [25, 50],
    [75, 50],
    [25, 80],
    [75, 80],
  ],
};

export function SimpleDice({
  dice,
  rolling,
}: {
  dice: number[] | null;
  rolling: boolean;
}) {
  // Always show face values — fall back to [1,1,1] so dice are never blank/purple
  const displayDice: [number, number, number] =
    dice && dice.length >= 3
      ? [dice[0] || 1, dice[1] || 1, dice[2] || 1]
      : [1, 1, 1];

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
    >
      {([0, 1, 2] as const).map((i) => {
        const value = displayDice[i];
        const dots = DOT_POSITIONS[value] ?? DOT_POSITIONS[1];

        return (
          <div
            key={i}
            style={{
              width: 80,
              height: 80,
              background: "#DC2626",
              borderRadius: 14,
              border: "2px solid #991B1B",
              boxShadow: rolling
                ? "0 0 20px rgba(220,38,38,0.5)"
                : "3px 3px 8px rgba(0,0,0,0.5)",
              position: "relative",
              animation: rolling ? `celoSpin${i} ${1.5 + i * 0.3}s ease-in-out infinite` : "none",
              transition: "background 0.3s ease",
            }}
          >
            {!rolling && dots.map(([cx, cy], di) => (
              <div
                key={di}
                style={{
                  position: "absolute",
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "#ffffff",
                  left: `${cx}%`,
                  top: `${cy}%`,
                  transform: "translate(-50%, -50%)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
                }}
              />
            ))}

            {rolling && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: 24,
                  fontWeight: "bold",
                }}
              >
                🎲
              </div>
            )}
          </div>
        );
      })}

      <style>{`
        @keyframes celoSpin0 {
          0%, 100% { transform: rotate(0deg) scale(1); }
          25% { transform: rotate(180deg) scale(1.1); }
          50% { transform: rotate(360deg) scale(0.9); }
          75% { transform: rotate(540deg) scale(1.1); }
        }
        @keyframes celoSpin1 {
          0%, 100% { transform: rotate(0deg) scale(1); }
          25% { transform: rotate(-180deg) scale(0.9); }
          50% { transform: rotate(-360deg) scale(1.1); }
          75% { transform: rotate(-540deg) scale(0.9); }
        }
        @keyframes celoSpin2 {
          0%, 100% { transform: rotate(0deg) scale(1); }
          33% { transform: rotate(270deg) scale(1.1); }
          66% { transform: rotate(540deg) scale(0.9); }
        }
      `}</style>
    </div>
  );
}
