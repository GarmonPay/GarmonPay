"use client";

import type { CSSProperties } from "react";
import { useId, useMemo } from "react";

export type Dice3DType = "standard" | "gold" | "diamond" | "blood" | "street" | "midnight" | "fire";

type Props = {
  value: number;
  rolling: boolean;
  diceType: Dice3DType;
  size?: number;
  delay?: number;
  dieIndex?: 0 | 1 | 2;
};

const TYPE_STYLES: Record<
  Dice3DType,
  { bg: string; dot: string; dotShadow: string }
> = {
  standard: { bg: "#DC2626", dot: "#FFFFFF", dotShadow: "0 1px 2px rgba(0,0,0,0.45)" },
  gold: { bg: "#F5C842", dot: "#0a0a0a", dotShadow: "0 1px 1px rgba(255,255,255,0.35)" },
  diamond: { bg: "#DBEAFE", dot: "#1E40AF", dotShadow: "0 1px 2px rgba(30,64,175,0.35)" },
  blood: { bg: "#7F1D1D", dot: "#F5C842", dotShadow: "0 1px 2px rgba(0,0,0,0.5)" },
  street: { bg: "#166534", dot: "#FFFFFF", dotShadow: "0 1px 2px rgba(0,0,0,0.4)" },
  midnight: { bg: "#0F172A", dot: "#FFFFFF", dotShadow: "0 1px 2px rgba(0,0,0,0.55)" },
  fire: { bg: "#EA580C", dot: "#FEF08A", dotShadow: "0 1px 2px rgba(0,0,0,0.4)" },
};

const ROLL_DURATIONS: [string, string, string] = ["2.3s", "2.5s", "2.1s"];

function clampFace(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(6, Math.max(1, Math.round(v)));
}

function faceRotation(value: number): string {
  const v = clampFace(value);
  switch (v) {
    case 1:
      return "rotateX(0deg) rotateY(0deg)";
    case 2:
      return "rotateX(0deg) rotateY(-90deg)";
    case 3:
      return "rotateX(-90deg) rotateY(0deg)";
    case 4:
      return "rotateX(90deg) rotateY(0deg)";
    case 5:
      return "rotateX(0deg) rotateY(90deg)";
    case 6:
      return "rotateX(0deg) rotateY(180deg)";
    default:
      return "rotateX(0deg) rotateY(0deg)";
  }
}

function FaceDots({
  n,
  size,
  colors,
}: {
  n: 1 | 2 | 3 | 4 | 5 | 6;
  size: number;
  colors: { bg: string; dot: string; dotShadow: string };
}) {
  const dotS = Math.max(6, Math.round(size * 0.14));
  const gap = "4px";
  const dot = (key: string) => (
    <span
      key={key}
      style={{
        width: dotS,
        height: dotS,
        borderRadius: "50%",
        background: colors.dot,
        boxShadow: colors.dotShadow,
        flexShrink: 0,
        /* iOS Safari: keep dots painted on 3D faces */
        transform: "translateZ(0.1px)",
        WebkitTransform: "translateZ(0.1px)",
        position: "relative",
        zIndex: 2,
      }}
    />
  );

  const gridStyle: CSSProperties = {
    display: "grid",
    width: "100%",
    height: "100%",
    placeItems: "center",
    padding: gap,
    boxSizing: "border-box",
  };

  if (n === 1) {
    return (
      <div style={gridStyle}>
        <div style={{ gridColumn: "1 / -1", gridRow: "1 / -1" }}>{dot("c")}</div>
      </div>
    );
  }
  if (n === 2) {
    return (
      <div
        style={{
          ...gridStyle,
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
        }}
      >
        <span style={{ gridColumn: 2, gridRow: 1 }}>{dot("tr")}</span>
        <span style={{ gridColumn: 1, gridRow: 2 }}>{dot("bl")}</span>
      </div>
    );
  }
  if (n === 3) {
    return (
      <div
        style={{
          ...gridStyle,
          gridTemplateColumns: "1fr 1fr 1fr",
          gridTemplateRows: "1fr 1fr 1fr",
        }}
      >
        <span style={{ gridColumn: 3, gridRow: 1 }}>{dot("tr")}</span>
        <span style={{ gridColumn: 2, gridRow: 2 }}>{dot("m")}</span>
        <span style={{ gridColumn: 1, gridRow: 3 }}>{dot("bl")}</span>
      </div>
    );
  }
  if (n === 4) {
    return (
      <div
        style={{
          ...gridStyle,
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap,
        }}
      >
        {dot("a")}
        {dot("b")}
        {dot("c")}
        {dot("d")}
      </div>
    );
  }
  if (n === 5) {
    return (
      <div
        style={{
          ...gridStyle,
          gridTemplateColumns: "1fr 1fr 1fr",
          gridTemplateRows: "1fr 1fr 1fr",
        }}
      >
        <span style={{ gridColumn: 1, gridRow: 1 }}>{dot("a")}</span>
        <span style={{ gridColumn: 3, gridRow: 1 }}>{dot("b")}</span>
        <span style={{ gridColumn: 2, gridRow: 2 }}>{dot("c")}</span>
        <span style={{ gridColumn: 1, gridRow: 3 }}>{dot("d")}</span>
        <span style={{ gridColumn: 3, gridRow: 3 }}>{dot("e")}</span>
      </div>
    );
  }
  return (
    <div
      style={{
        ...gridStyle,
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "repeat(3, 1fr)",
        gap: "2px 8px",
      }}
    >
      {[0, 1, 2].map((i) => (
        <span key={`L${i}`} style={{ gridColumn: 1, gridRow: i + 1 }}>
          {dot(`l${i}`)}
        </span>
      ))}
      {[0, 1, 2].map((i) => (
        <span key={`R${i}`} style={{ gridColumn: 2, gridRow: i + 1 }}>
          {dot(`r${i}`)}
        </span>
      ))}
    </div>
  );
}

export default function Dice3D({
  value,
  rolling,
  diceType,
  size = 80,
  delay = 0,
  dieIndex = 0,
}: Props) {
  const colors = TYPE_STYLES[diceType] ?? TYPE_STYLES.standard;
  const half = size / 2;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const rollDuration = ROLL_DURATIONS[dieIndex % 3];

  const faceStyle = (transform: string): CSSProperties => ({
    position: "absolute",
    width: size,
    height: size,
    background: colors.bg,
    borderRadius: 4,
    boxShadow: "inset 0 -4px 12px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.12)",
    transform,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    WebkitFontSmoothing: "antialiased",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  });

  const restTransform = useMemo(() => faceRotation(value), [value]);

  const keyStyle = useMemo(
    () => `
    @keyframes diceRoll_${uid} {
      0% { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
      20% { transform: rotateX(144deg) rotateY(120deg) rotateZ(72deg); }
      40% { transform: rotateX(288deg) rotateY(240deg) rotateZ(144deg); }
      60% { transform: rotateX(432deg) rotateY(360deg) rotateZ(216deg); }
      80% { transform: rotateX(576deg) rotateY(480deg) rotateZ(288deg); }
      100% { transform: rotateX(720deg) rotateY(600deg) rotateZ(360deg); }
    }
    .cube_${uid} {
      transform-style: preserve-3d;
      -webkit-transform-style: preserve-3d;
      width: ${size}px;
      height: ${size}px;
      position: relative;
      margin: 0 auto;
      transition: transform 0.45s ease-out;
    }
    .cube_${uid}.rolling {
      animation: diceRoll_${uid} ${rollDuration} ease-out ${delay}ms forwards;
    }
  `,
    [uid, size, rollDuration, delay],
  );

  return (
    <div
      style={{
        width: size,
        height: size,
        perspective: 900,
        perspectiveOrigin: "50% 50%",
        /* Do not use filter: here — breaks 3D + child paint on iOS Safari */
        boxShadow: "0 10px 18px rgba(0,0,0,0.45)",
        borderRadius: 6,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: keyStyle }} />
      <div
        className={`cube_${uid} ${rolling ? "rolling" : ""}`}
        style={{
          transformStyle: "preserve-3d",
          transform: rolling ? undefined : restTransform,
        }}
      >
        <div style={faceStyle(`translateZ(${half}px)`)}>
          <FaceDots n={1} size={size} colors={colors} />
        </div>
        <div style={faceStyle(`rotateY(180deg) translateZ(${half}px)`)}>
          <FaceDots n={6} size={size} colors={colors} />
        </div>
        <div style={faceStyle(`rotateY(90deg) translateZ(${half}px)`)}>
          <FaceDots n={2} size={size} colors={colors} />
        </div>
        <div style={faceStyle(`rotateY(-90deg) translateZ(${half}px)`)}>
          <FaceDots n={5} size={size} colors={colors} />
        </div>
        <div style={faceStyle(`rotateX(90deg) translateZ(${half}px)`)}>
          <FaceDots n={3} size={size} colors={colors} />
        </div>
        <div style={faceStyle(`rotateX(-90deg) translateZ(${half}px)`)}>
          <FaceDots n={4} size={size} colors={colors} />
        </div>
      </div>
    </div>
  );
}
