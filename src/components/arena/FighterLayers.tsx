"use client";

import React from "react";
import type { BodyType, FaceStyle, HairStyle, GearGlovesKey, GearShoesKey, GearShortsKey, GearHeadgearKey } from "@/lib/arena-fighter-types";
import type { FighterData } from "@/lib/arena-fighter-types";
import { getSkinHex } from "@/lib/arena-fighter-types";
import { getFighterConfig } from "@/lib/arena/characterAssets";

const VIEWBOX = "0 0 100 150";

/** Crouched waist Y; rotation.y ≈ -0.3 rad as SVG rotate pivot at hip. */
export function fighterWaistY(): number {
  return 75 + Math.round(0.05 * 150);
}
export const FIGHTER_BODY_LEAN_DEG = (-0.3 * 180) / Math.PI;

/**
 * Side-view boxing stance: narrow shoulders (not T-pose). Left jab extended toward camera-left
 * in front of face; right hand tucked at chin. Body lean ~rotation.y -0.3 via skew; legs crouched.
 */
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
  const hipW = isLight ? 18 : isHeavy ? 24 : 21;
  const waistYAdj = fighterWaistY();
  const kneeY = waistYAdj + 36;
  const footY = 150;
  const shoulderY = 40;
  const lsX = 44;
  const rsX = 54;
  const chinY = 28;
  const faceX = 50;
  const leftGloveX = 28;
  const leftGloveY = 22;
  const leftElbowX = 34;
  const leftElbowY = 28;
  const rightGloveX = 52;
  const rightGloveY = chinY;
  const rightElbowX = 53;
  const rightElbowY = 34;
  return (
    <g className={className}>
      {/* Legs — bent knees, crouch */}
      <path
        fill={hex}
        d={`M ${50 - hipW / 2} ${waistYAdj} L ${46} ${kneeY} L ${48} ${footY} L ${54} ${footY} L ${52} ${kneeY} Z`}
      />
      <path
        fill={hex}
        d={`M ${50 + hipW / 2 - 3} ${waistYAdj} L ${56} ${kneeY} L ${58} ${footY} L ${68} ${footY} L ${64} ${kneeY} Z`}
      />
      {/* Torso: narrow shoulders 44–54 (not T-pose width) */}
      <path
        fill={hex}
        d={`M ${lsX} ${shoulderY - 5} L ${rsX} ${shoulderY - 5} L ${50 + hipW / 2} ${waistYAdj} L ${50 - hipW / 2} ${waistYAdj} Z`}
      />
      {/* Left: jab — glove in front of face */}
      <path
        fill={hex}
        d={`M ${lsX} ${shoulderY} L ${lsX - 2} ${shoulderY + 4} L ${leftElbowX} ${leftElbowY + 3} L ${leftElbowX + 4} ${leftElbowY - 2} L ${lsX + 3} ${shoulderY} Z`}
      />
      <path
        fill={hex}
        d={`M ${leftElbowX + 1} ${leftElbowY} L ${leftGloveX - 2} ${leftGloveY + 6} L ${leftGloveX + 5} ${leftGloveY + 4} L ${leftElbowX + 5} ${leftElbowY - 3} Z`}
      />
      {/* Right: guard at chin */}
      <path
        fill={hex}
        d={`M ${rsX} ${shoulderY} L ${rightElbowX + 2} ${rightElbowY - 2} L ${rightElbowX - 3} ${rightElbowY + 3} L ${rsX - 2} ${shoulderY + 3} Z`}
      />
      <path
        fill={hex}
        d={`M ${rightElbowX} ${rightElbowY} L ${rightGloveX + 5} ${rightGloveY - 4} L ${rightGloveX - 2} ${rightGloveY + 8} L ${rightElbowX - 2} ${rightElbowY + 2} Z`}
      />
      <ellipse cx={faceX} cy={headY + headR} rx={headR} ry={headR + 2} fill={hex} />
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
  const wY = fighterWaistY();
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
        d={`M ${50 - hipW / 2} ${wY - 2} L ${50 - hipW / 2 - 2} ${wY + 28} L ${50 + 2} ${wY + 30} L ${50 + hipW / 2} ${wY + 26} L ${50 + hipW / 2} ${wY - 2} Z`}
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

/** Narrow chest highlight only — must NOT span full shoulder width (avoids T-pose look). */
export function LayerTorso({ skinTone, className = "" }: { skinTone: string; className?: string }) {
  const hex = getSkinHex(skinTone);
  return (
    <g className={className}>
      <path fill={hex} fillOpacity={0.28} d="M 45 38 L 54 38 L 53 68 L 46 68 Z" />
    </g>
  );
}

/** Gloves — boxing stance: left jab (in front of face), right guard (near chin) */
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
  const leftGloveX = 28;
  const leftGloveY = 22;
  const rightGloveX = 52;
  const rightGloveY = 28;
  return (
    <g className={className}>
      <ellipse cx={leftGloveX} cy={leftGloveY} rx={10} ry={12} fill={fill} />
      <ellipse cx={rightGloveX} cy={rightGloveY} rx={10} ry={12} fill={fill} />
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

/** Full fighter SVG display using layers. Use when API returns equipped_gloves_key etc. */
export function FighterDisplay({
  fighter,
  size = "medium",
  animation = "idle",
  showGear = true,
  mirrored = false,
  className = "",
}: {
  fighter: FighterData;
  size?: "small" | "medium" | "large";
  animation?: string;
  showGear?: boolean;
  mirrored?: boolean;
  className?: string;
}) {
  const f = fighter as FighterData & { equipped_gloves_key?: string; equipped_shoes_key?: string; equipped_shorts_key?: string; equipped_headgear_key?: string };
  const normalized = {
    ...fighter,
    equipped_gloves: f?.equipped_gloves_key ?? f?.equipped_gloves ?? "default",
    equipped_shoes: f?.equipped_shoes_key ?? f?.equipped_shoes ?? "default",
    equipped_shorts: f?.equipped_shorts_key ?? f?.equipped_shorts ?? "default",
    equipped_headgear: f?.equipped_headgear_key ?? f?.equipped_headgear ?? "none",
  };
  getFighterConfig(normalized); // ensure defaults applied for display
  const bodyType = (fighter?.body_type ?? "middleweight") as string;
  const skinTone = (fighter?.skin_tone ?? "tone3") as string;
  const glovesKey = (normalized.equipped_gloves ?? "default") as string;
  const shortsKey = (normalized.equipped_shorts ?? "default") as string;
  const shoesKey = (normalized.equipped_shoes ?? "default") as string;
  const headgearKey = (normalized.equipped_headgear ?? "none") as string;
  const scale = size === "small" ? 0.5 : size === "large" ? 1.2 : 1;
  const [vb0, vb1, vb2, vb3] = VIEWBOX.split(" ");
  return (
    <svg
      viewBox={`${vb0} ${vb1} ${vb2} ${vb3}`}
      width={100 * scale}
      height={150 * scale}
      className={className}
      style={mirrored ? { transform: "scaleX(-1)" } : undefined}
    >
      <g transform={`scale(${scale})`}>
        <g transform={`rotate(${FIGHTER_BODY_LEAN_DEG.toFixed(2)} 50 88)`}>
          <LayerBody bodyType={bodyType} skinTone={skinTone} />
          {showGear && <LayerShorts gearKey={shortsKey} bodyType={bodyType} />}
          {showGear && <LayerShoes gearKey={shoesKey} />}
          {showGear && <LayerGloves gearKey={glovesKey} bodyType={bodyType} />}
          {showGear && headgearKey !== "none" && <LayerHeadgear gearKey={headgearKey as GearHeadgearKey} />}
          <LayerTorso skinTone={skinTone} />
          <LayerFace faceStyle={(fighter?.face_style ?? "determined") as FaceStyle} skinTone={skinTone} animation={animation} />
          <LayerHair hairStyle={(fighter?.hair_style ?? "short_fade") as HairStyle} skinTone={skinTone} />
          <LayerEffects show={false} />
        </g>
      </g>
    </svg>
  );
}
