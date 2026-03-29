"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { getFighterModelUrl } from "@/lib/meshy-assets";
import { isArenaDebugEnabled } from "@/lib/arena-debug";
import { safeDisplayName, safeFighterColor } from "@/lib/arena-safe-fighter";
import type { FightAnim } from "@/components/arena/meshy/ProceduralFallbackBoxer";

const BoxerCanvas = dynamic(() => import("@/components/arena/BoxerCanvas"), { ssr: false });
const Boxer2D = dynamic(() => import("@/components/arena/Boxer2D"), { ssr: false });

type Boxer2DSkinTone = "light" | "medium" | "tan" | "dark" | "deep";
type Boxer2DHairStyle = "bald" | "fade" | "dreads" | "cornrows" | "afro" | "mohawk" | "buzz" | "long" | "ponytail";
type Boxer2DGender = "male" | "female";
type Boxer2DBodyType = "lightweight" | "middleweight" | "heavyweight";

function mapSkinTone(input: unknown): Boxer2DSkinTone {
  if (typeof input !== "string") return "medium";
  const tone = input.toLowerCase();
  if (tone === "light" || tone === "medium" || tone === "tan" || tone === "dark" || tone === "deep") return tone;
  if (tone === "tone1" || tone === "tone2") return "light";
  if (tone === "tone3") return "medium";
  if (tone === "tone4") return "tan";
  if (tone === "tone5") return "dark";
  if (tone === "tone6") return "deep";
  return "medium";
}

function mapHairStyle(input: unknown): Boxer2DHairStyle {
  if (typeof input !== "string") return "fade";
  const hair = input.toLowerCase();
  if (
    hair === "bald" ||
    hair === "fade" ||
    hair === "dreads" ||
    hair === "cornrows" ||
    hair === "afro" ||
    hair === "mohawk" ||
    hair === "buzz" ||
    hair === "long" ||
    hair === "ponytail"
  ) {
    return hair;
  }
  if (hair === "short_fade") return "fade";
  if (hair === "buzz_cut") return "buzz";
  if (hair === "long_tied") return "long";
  return "fade";
}

function mapBodyType(input: unknown): Boxer2DBodyType {
  if (input === "lightweight" || input === "middleweight" || input === "heavyweight") return input;
  return "middleweight";
}

function mapGender(input: unknown): Boxer2DGender {
  return input === "female" ? "female" : "male";
}

export type Fighter3DProps = {
  /** Raw fighter row / API object — reads `model_3d_url`, `model_url`, `glb_url`, `meshy_glb_url`. */
  fighter: (Record<string, unknown> & {
    model_3d_url?: string | null;
    model_url?: string | null;
    glb_url?: string | null;
    meshy_glb_url?: string | null;
    fighter_color?: string | null;
    name?: string | null;
    style?: string | null;
    avatar?: string | null;
    skin_tone?: string | null;
    hair_style?: string | null;
    body_type?: string | null;
    gender?: string | null;
  }) | null | undefined;
  /** Reserved for future clip-driven animation (dashboard uses idle). */
  animationState?: FightAnim | string;
  position?: "left" | "right";
  facingRight?: boolean;
  size?: "small" | "medium" | "large";
  /** Optional accent for rim light (hex). */
  fighterColor?: string;
};

const heights = { small: 220, medium: 380, large: 560 };
const fallbackCanvasSize = {
  small: { width: 142, height: 220 },
  medium: { width: 220, height: 340 },
  large: { width: 305, height: 472 },
};

function isValidFighterRecord(f: Fighter3DProps["fighter"]): f is Record<string, unknown> {
  return f != null && typeof f === "object" && !Array.isArray(f);
}

/**
 * Meshy / GLB viewer entry: loads Three.js (R3F) when a model URL exists; otherwise shows 2D card fallback.
 * R3F uses an internal `requestAnimationFrame` render loop; GLTFLoader disposes via drei cache on unmount.
 */
export default function Fighter3D({
  fighter,
  animationState: _animationState,
  position = "left",
  facingRight,
  size = "medium",
  fighterColor,
}: Fighter3DProps) {
  void _animationState;

  const fighterOk = isValidFighterRecord(fighter);
  const url = fighterOk ? getFighterModelUrl(fighter) : null;
  const color = fighterColor ?? safeFighterColor(fighter, "#f0a500");
  const faceRight = facingRight ?? position === "right";
  const h = heights[size];
  const skinTone = mapSkinTone(fighter?.skin_tone);
  const hairStyle = mapHairStyle(fighter?.hair_style);
  const bodyType = mapBodyType(fighter?.body_type);
  const gender = mapGender(fighter?.gender);
  const displayName = safeDisplayName(fighter?.name, "Boxer");
  const { width: canvasWidth, height: canvasHeight } = fallbackCanvasSize[size];

  useEffect(() => {
    if (!fighterOk) {
      console.warn("[Fighter3D] Fighter is undefined or invalid — showing empty panel");
    }
  }, [fighterOk]);

  useEffect(() => {
    if (!isArenaDebugEnabled() || !fighterOk) return;
    console.log("FIGHTER DATA:", fighter);
    console.log("MODEL URL:", fighter?.model_3d_url);
    console.log("ALL MODEL FIELDS:", {
      model_3d_url: fighter?.model_3d_url,
      model_url: fighter?.model_url,
      glb_url: fighter?.glb_url,
      meshy_glb_url: fighter?.meshy_glb_url,
    });
  }, [fighter, fighterOk]);

  useEffect(() => {
    if (url) {
      console.log("LOADING MODEL:", url);
    }
  }, [url]);

  useEffect(() => {
    if (!url || typeof window === "undefined") return;
    const draco = process.env.NEXT_PUBLIC_MESHY_DRACO === "1";
    void import("@react-three/drei").then(({ useGLTF }) => {
      try {
        useGLTF.preload(url, draco);
      } catch (e) {
        console.warn("[Fighter3D] preload skipped:", e);
      }
    });
  }, [url]);

  const showDebug = isArenaDebugEnabled();
  const badgeLabel = url ? "3D URL FOUND" : "NO 3D URL";
  const badgeBg = url ? "rgba(34, 197, 94, 0.92)" : "rgba(239, 68, 68, 0.92)";

  if (!fighterOk) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          minHeight: h,
          background: "#0a0a0f",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#64748b",
          fontSize: 12,
        }}
      >
        No fighter data
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", minHeight: h }}>
      {showDebug && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 20,
            padding: "4px 8px",
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "#fff",
            background: badgeBg,
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            pointerEvents: "none",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {badgeLabel}
        </div>
      )}
      {url ? (
        <BoxerCanvas modelUrl={url} facingRight={faceRight} fighterColor={color} size={size} />
      ) : (
        <div
          style={{
            width: "100%",
            minHeight: h,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "radial-gradient(120% 100% at 50% 10%, rgba(45,55,72,0.55) 0%, rgba(8,10,15,0.98) 62%)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Boxer2D
            skinTone={skinTone}
            trunksColor={color}
            hairStyle={hairStyle}
            bodyType={bodyType}
            gender={gender}
            name={displayName}
            animate
            width={canvasWidth}
            height={canvasHeight}
          />
        </div>
      )}
    </div>
  );
}
