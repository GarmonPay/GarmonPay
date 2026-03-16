"use client";

import React from "react";
import type { BodyType, FaceStyle, HairStyle, GearGlovesKey, GearShoesKey, GearShortsKey, GearHeadgearKey } from "@/lib/arena-fighter-types";
import { getSkinHex } from "@/lib/arena-fighter-types";

const VIEWBOX = "0 0 100 150";

/** Body silhouette — side profile, guard stance. Different proportions per body type. */
export function LayerBody({
  bodyType,
  skinTone,
  className = "",
}: {
  bodyType: BodyType | string;
  skinTone: string;
  className?: string;
}) {
  const hex = getSkinHex(skinTone);
  const isLight = bodyType === "lightweight";
  const isHeavy = bodyType === "heavyweight";
  const headY = 12;
  const headR = isLight ? 8 : isHeavy ? 10 : 9;
  const shoulderW = isLight ? 22 : isHeavy ? 28 : 25;
  const chestY = 35;
  const waistY = 75;
  const hipW = isLight ? 18 : isHeavy ? 24 : 21;
  const legLen = 55;
  const armLen = 28;
  return (
    <g className={className}>
      {/* Legs (back then front) */}
      <path
        fill={hex}
        d={`M ${50 - hipW / 2} ${waistY} L ${48 - 6} ${150} L ${52 - 6} ${150} Z`}
      />
      <path
        fill={hex}
        d={`M ${50 + hipW / 2 - 4} ${waistY} L ${50 + 8} ${150} L ${50 + 16} ${150} Z`}
      />
      {/* Torso */}
      <path
        fill={hex}
        d={`M ${50 - shoulderW / 2} ${chestY} L ${50 - hipW / 2} ${waistY} L ${50 + hipW / 2} ${waistY} L ${50 + shoulderW / 2 - 4} ${chestY} Z`}
      />
      {/* Arms (guard) */}
      <path
        fill={hex}
        d={`M ${50 - shoulderW / 2} ${chestY + 5} L ${50 - shoulderW / 2 - armLen} ${chestY + 25} L ${50 - shoulderW / 2 - armLen + 8} ${chestY + 28} L ${50 - shoulderW / 2 + 4} ${chestY + 8} Z`}
      />
      <path
        fill={hex}
        d={`M ${50 + shoulderW / 2 - 4} ${chestY + 8} L ${50 + shoulderW / 2 + armLen - 8} ${chestY + 22} L ${50 + shoulderW / 2 + armLen} ${chestY + 18} L ${50 + shoulderW / 2} ${chestY + 5} Z`}
      />
      {/* Head */}
      <ellipse cx={50} cy={headY + headR} rx={headR} ry={headR + 2} fill={hex} />
    </g>
  );
}

/** Shorts/trunks layer */
export function LayerShorts({
  gearKey,
  bodyType,
  className = "",
}: {
  gearKey: GearShortsKey | string;
  bodyType: BodyType | string;
  className?: string;
}) {
  const isHeavy = bodyType === "heavyweight";
  const hipW = isHeavy ? 24 : bodyType === "lightweight" ? 18 : 21;
  const waistY = 75;
  const colors: Record<string, string> = {
    default: "#4b5563",
    street_shorts: "#dc2626",
    gold_trunks: "#eab308",
    diamond_shorts: "#1f2937",
    champion_trunks: "#f8fafc",
  };
  const fill = colors[gearKey] ?? colors.default;
  return (
    <g className={className}>
      <path
        fill={fill}
        d={`M ${50 - hipW / 2} ${waistY - 2} L ${50 - hipW / 2 - 2} ${waistY + 28} L ${50 + 2} ${waistY + 30} L ${50 + hipW / 2} ${waistY + 26} L ${50 + hipW / 2} ${waistY - 2} Z`}
      />
    </g>
  );
}

/** Shoes layer */
export function LayerShoes({
  gearKey,
  className = "",
}: {
  gearKey: GearShoesKey | string;
  className?: string;
}) {
  const colors: Record<string, string> = {
    default: "#0f172a",
    bare_feet: "transparent",
    ring_boots: "#0f172a",
    speed_boots: "#f8fafc",
    power_stompers: "#1f2937",
    legendary_kicks: "#eab308",
  };
  const fill = colors[gearKey] ?? colors.default;
  if (gearKey === "bare_feet") return null;
  return (
    <g className={className}>
      <path fill={fill} d="M 42 148 L 48 150 L 54 148 L 54 144 L 48 146 Z" />
      <path fill={fill} d="M 58 148 L 66 150 L 72 146 L 72 142 L 66 144 Z" />
    </g>
  );
}

/** Torso/chest overlay (optional) — same as body, can add detail later */ 
export function LayerTorso({ skinTone, className = "" }: { skinTone: string; className?: string }) {
  const hex = getSkinHex(skinTone);
  return (
    <g className={className}>
      <path
        fill={hex}
        fillOpacity={0.3}
        d="M 28 38 L 72 38 L 68 72 L 32 72 Z"
      />
    </g>
  );
}

/** Gloves — guard position */
export function LayerGloves({
  gearKey,
  bodyType,
  className = "",
}: {
  gearKey: GearGlovesKey | string;
  bodyType: BodyType | string;
  className?: string;
}) {
  const colors: Record<string, string> = {
    default: "#1e293b",
    wraps: "#f1f5f9",
    street_gloves: "#dc2626",
    pro_gloves: "#2563eb",
    titanium_gloves: "#94a3b8",
    championship_gloves: "#eab308",
  };
  const fill = colors[gearKey] ?? colors.default;
  const shoulderW = bodyType === "heavyweight" ? 28 : bodyType === "lightweight" ? 22 : 25;
  const armLen = 28;
  return (
    <g className={className}>
      <ellipse
        cx={50 - shoulderW / 2 - armLen + 10}
        cy={42}
        rx={10}
        ry={12}
        fill={fill}
      />
      <ellipse
        cx={50 + shoulderW / 2 + armLen - 10}
        cy={38}
        rx={10}
        ry={12}
        fill={fill}
      />
    </g>
  );
}

/** Headgear */
export function LayerHeadgear({
  gearKey,
  className = "",
}: {
  gearKey: GearHeadgearKey | string;
  className?: string;
}) {
  if (gearKey === "none" || !gearKey) return null;
  const colors: Record<string, string> = {
    basic: "#1f2937",
    pro: "#dc2626",
    iron_skull: "#64748b",
  };
  const fill = colors[gearKey] ?? colors.basic;
  return (
    <g className={className}>
      <path
        fill={fill}
        d="M 38 8 Q 50 2 62 8 Q 65 18 62 22 Q 50 26 38 22 Q 35 18 38 8 Z"
      />
    </g>
  );
}

/** Face expression — simple eyes/mouth overlay */
export function LayerFace({
  faceStyle,
  animation,
  skinTone,
  className = "",
}: {
  faceStyle: FaceStyle | string;
  skinTone: string;
  animation?: string;
  className?: string;
}) {
  const hex = getSkinHex(skinTone);
  const eyeY = 18;
  const mouthY = 24;
  const isMasked = faceStyle === "masked";
  if (isMasked) {
    return (
      <g className={className}>
        <path fill="#374151" d="M 42 10 L 58 10 L 56 22 L 44 22 Z" />
      </g>
    );
  }
  const fierce = faceStyle === "fierce" || faceStyle === "angry";
  const calm = faceStyle === "calm";
  const eyeOffset = fierce ? -1 : calm ? 0 : 0;
  return (
    <g className={className}>
      <ellipse cx={44} cy={eyeY + eyeOffset} rx={2} ry={2.5} fill="#1f2937" />
      <ellipse cx={56} cy={eyeY + eyeOffset} rx={2} ry={2.5} fill="#1f2937" />
      <path
        stroke="#1f2937"
        strokeWidth={1.2}
        fill="none"
        d={
          fierce
            ? `M ${44} ${mouthY} L 56 ${mouthY}`
            : calm
              ? `M 44 ${mouthY} Q 50 ${mouthY + 2} 56 ${mouthY}`
              : `M 44 ${mouthY + 1} Q 50 ${mouthY - 1} 56 ${mouthY + 1}`
        }
      />
    </g>
  );
}

/** Hair layer */
export function LayerHair({
  hairStyle,
  skinTone,
  className = "",
}: {
  hairStyle: HairStyle | string;
  skinTone: string;
  className?: string;
}) {
  const hairColors = ["#1f2937", "#44403c", "#1c1917", "#292524"];
  const fill = hairColors[1];
  if (hairStyle === "bald" || !hairStyle) return null;
  const headY = 12;
  const headR = 9;
  if (hairStyle === "short_fade" || hairStyle === "buzz_cut") {
    return (
      <g className={className}>
        <path
          fill={fill}
          d={`M ${50 - headR} ${headY} Q 50 ${headY - 4} ${50 + headR} ${headY} L ${50 + headR} ${headY + headR} Q 50 ${headY + headR + 2} ${50 - headR} ${headY + headR} Z`}
        />
      </g>
    );
  }
  if (hairStyle === "mohawk") {
    return (
      <g className={className}>
        <path fill={fill} d="M 44 4 L 56 4 L 54 20 L 46 20 Z" />
      </g>
    );
  }
  if (hairStyle === "afro") {
    return (
      <g className={className}>
        <ellipse cx={50} cy={headY + 2} rx={12} ry={14} fill={fill} />
      </g>
    );
  }
  return (
    <g className={className}>
      <path
        fill={fill}
        d={`M ${50 - headR} ${headY} Q 50 ${headY - 2} ${50 + headR} ${headY} L ${50 + headR - 2} ${headY + headR + 4} L ${50 - headR + 2} ${headY + headR + 4} Z`}
      />
    </g>
  );
}

/** Special effects (glow / particles) — used for victory, special move */
export function LayerEffects({ show, className = "" }: { show: boolean; className?: string }) {
  if (!show) return null;
  return (
    <g className={className}>
      <ellipse cx={50} cy={75} rx={45} ry={70} fill="#eab308" fillOpacity={0.15} />
    </g>
  );
}
