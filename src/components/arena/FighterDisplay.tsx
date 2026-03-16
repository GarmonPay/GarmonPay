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
  showStats = false,
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
  const glovesKey = (showGear && fighter.equipped_gloves) ? String(fighter.equipped_gloves) : "default";
  const shoesKey = (showGear && fighter.equipped_shoes) ? String(fighter.equipped_shoes) : "default";
  const shortsKey = (showGear && fighter.equipped_shorts) ? String(fighter.equipped_shorts) : "default";
  const headgearKey = (showGear && fighter.equipped_headgear) ? String(fighter.equipped_headgear) : "none";

  const showVictoryEffect = animation === "victory";

  const animationClass =
    animation === "idle"
      ? "arena-fighter-idle"
      : animation === "training"
        ? "arena-fighter-training arena-fighter-anim-punch"
        : animation === "victory"
          ? "arena-fighter-victory"
          : animation === "defeat"
            ? "arena-fighter-defeat"
            : animation === "fighting" && action === "JAB"
              ? "arena-fighter-fighting arena-fighter-action-jab"
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
          <LayerShorts gearKey={shortsKey} bodyType={bodyType} />
          <LayerShoes gearKey={shoesKey} />
          <LayerGloves gearKey={glovesKey} bodyType={bodyType} className="arena-fighter-gloves" />
          <LayerHeadgear gearKey={headgearKey} />
          <LayerFace faceStyle={faceStyle} skinTone={skinTone} animation={animation} />
          <LayerHair hairStyle={hairStyle} skinTone={skinTone} />
        </g>
      </svg>
      {showStats && fighter.strength != null && (
        <div className="absolute bottom-0 left-0 right-0 p-1 bg-black/60 rounded text-[10px] text-white text-center">
          <span>S{fighter.strength}</span> <span>Sp{fighter.speed}</span> <span>St{fighter.stamina}</span>
          <span>D{fighter.defense}</span> <span>C{fighter.chin}</span> <span>X{fighter.special}</span>
        </div>
      )}
    </div>
  );
}
