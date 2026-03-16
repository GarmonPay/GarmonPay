"use client";

import React, { useMemo } from "react";
import type { FighterData, FighterDisplaySize, FighterAnimation } from "@/lib/arena-fighter-types";
import { DEFAULT_FIGHTER_VISUAL } from "@/lib/arena-fighter-types";
import {
  LayerBody,
  LayerShorts,
  LayerShoes,
  LayerGloves,
  LayerHeadgear,
  LayerFace,
  LayerHair,
  LayerEffects,
} from "./FighterLayers";
import "./fighter-animations.css";

const VIEWBOX = "0 0 100 150";
const SIZES: Record<FighterDisplaySize, { w: number; h: number }> = {
  small: { w: 80, h: 120 },
  medium: { w: 160, h: 240 },
  large: { w: 240, h: 360 },
  full: { w: 320, h: 480 },
};

export interface FighterDisplayProps {
  fighter: FighterData;
  size?: FighterDisplaySize;
  animation?: FighterAnimation;
  action?: string;
  showStats?: boolean;
  showGear?: boolean;
  mirrored?: boolean;
  className?: string;
}

export function FighterDisplay({
  fighter,
  size = "medium",
  animation = "idle",
  action,
  showStats = false, // unused: stats only in stats panel, never on fighter graphic
  showGear = true,
  mirrored = false,
  className = "",
}: FighterDisplayProps) {
  const { w, h } = SIZES[size];
  const scale = useMemo(() => (size === "small" ? 0.8 : size === "medium" ? 1 : size === "large" ? 1.5 : 2), [size]);

  const bodyType = (fighter.body_type as "lightweight" | "middleweight" | "heavyweight") ?? DEFAULT_FIGHTER_VISUAL.body_type ?? "middleweight";
  const skinTone = (fighter.skin_tone as string) ?? DEFAULT_FIGHTER_VISUAL.skin_tone ?? "tone3";
  const faceStyle = (fighter.face_style as string) ?? DEFAULT_FIGHTER_VISUAL.face_style ?? "determined";
  const hairStyle = (fighter.hair_style as string) ?? DEFAULT_FIGHTER_VISUAL.hair_style ?? "short_fade";
  const gear = showGear ? {
    gloves: (fighter.equipped_gloves_key ?? fighter.equipped_gloves) as string | undefined,
    shoes: (fighter.equipped_shoes_key ?? fighter.equipped_shoes) as string | undefined,
    shorts: (fighter.equipped_shorts_key ?? fighter.equipped_shorts) as string | undefined,
    headgear: (fighter.equipped_headgear_key ?? fighter.equipped_headgear) as string | undefined,
  } : { gloves: undefined, shoes: undefined, shorts: undefined, headgear: undefined };
  const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const glovesKey = gear.gloves && !isUuid(gear.gloves) ? gear.gloves : "default";
  const shoesKey = gear.shoes && !isUuid(gear.shoes) ? gear.shoes : "default";
  const shortsKey = gear.shorts && !isUuid(gear.shorts) ? gear.shorts : "default";
  const headgearKey = gear.headgear && !isUuid(gear.headgear) ? gear.headgear : "none";

  const showVictoryEffect = animation === "victory";

  const fightingActionClass =
    action === "JAB"
      ? "arena-fighter-action-jab"
      : action === "RIGHT_HAND" || action === "HOOK" || action === "BODY_SHOT" || action === "SPECIAL"
        ? "arena-fighter-action-punch"
        : action === "BLOCK"
          ? "arena-fighter-action-block"
          : "";
  const animationClass =
    animation === "idle"
      ? "arena-fighter-idle"
      : animation === "training"
        ? "arena-fighter-training arena-fighter-anim-punch"
        : animation === "victory"
          ? "arena-fighter-victory"
          : animation === "defeat"
            ? "arena-fighter-defeat"
            : animation === "fighting" && action
              ? `arena-fighter-fighting ${fightingActionClass || "arena-fighter-action-jab"}`
              : animation === "hit"
                ? "arena-fighter-hit"
                : animation === "ko"
                  ? "arena-fighter-ko"
                  : "arena-fighter-idle";

  return (
    <div
      className={`arena-fighter-wrap relative ${animationClass} ${className}`}
      style={{
        width: w,
        height: h,
        transform: mirrored ? "scaleX(-1)" : undefined,
      }}
    >
      <svg
        viewBox={VIEWBOX}
        preserveAspectRatio="xMidYMax meet"
        className="arena-fighter-svg w-full h-full"
        style={{ display: "block" }}
      >
        <g
          className="arena-fighter-root"
          transform={`translate(0,0) scale(${scale})`}
          style={{ transformOrigin: "50px 150px" }}
        >
          <LayerEffects show={showVictoryEffect} className="arena-fighter-effects" />
          <LayerBody bodyType={bodyType} skinTone={skinTone} />
          <LayerShorts
        gearKey={shortsKey}
        bodyType={bodyType}
        className={shortsKey === "gold_trunks" ? "arena-gear-shimmer" : shortsKey === "diamond_shorts" ? "arena-gear-sparkle" : shortsKey === "champion_trunks" ? "arena-gear-fire" : ""}
      />
          <LayerShoes gearKey={shoesKey} />
          <LayerGloves
            gearKey={glovesKey}
            bodyType={bodyType}
            className={`arena-fighter-gloves ${glovesKey === "championship_gloves" ? "arena-gear-shimmer" : glovesKey === "titanium_gloves" ? "arena-gear-sparkle" : ""}`}
          />
          <LayerHeadgear
            gearKey={headgearKey}
            className={headgearKey === "iron_skull" ? "arena-gear-sparkle" : ""}
          />
          <LayerFace faceStyle={faceStyle} skinTone={skinTone} animation={animation} />
          <LayerHair hairStyle={hairStyle} skinTone={skinTone} />
        </g>
      </svg>
    </div>
  );
}
