"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useGLTF } from "@react-three/drei";
import { getFighterModelUrl } from "@/lib/meshy-assets";
import { isArenaDebugEnabled } from "@/lib/arena-debug";
import type { FightAnim } from "@/components/arena/meshy/ProceduralFallbackBoxer";
import { FighterCard2D } from "@/components/arena/FighterCard2D";

const BoxerCanvas = dynamic(() => import("@/components/arena/BoxerCanvas"), { ssr: false });

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
  const url = getFighterModelUrl(fighter);
  const color =
    fighterColor ??
    (typeof fighter?.fighter_color === "string" && fighter.fighter_color ? fighter.fighter_color : "#f0a500");
  const faceRight = facingRight ?? position === "right";
  const h = heights[size];

  useEffect(() => {
    if (!isArenaDebugEnabled()) return;
    console.log("FIGHTER DATA:", fighter);
    console.log("MODEL URL:", fighter?.model_3d_url);
    console.log("ALL MODEL FIELDS:", {
      model_3d_url: fighter?.model_3d_url,
      model_url: fighter?.model_url,
      glb_url: fighter?.glb_url,
      meshy_glb_url: fighter?.meshy_glb_url,
    });
  }, [fighter]);

  useEffect(() => {
    if (!url || typeof window === "undefined") return;
    try {
      const draco = process.env.NEXT_PUBLIC_MESHY_DRACO === "1";
      useGLTF.preload(url, draco);
    } catch (e) {
      console.warn("[Fighter3D] preload skipped:", e);
    }
  }, [url]);

  const showDebug = isArenaDebugEnabled();
  const badgeLabel = url ? "3D URL FOUND" : "NO 3D URL";
  const badgeBg = url ? "rgba(34, 197, 94, 0.92)" : "rgba(239, 68, 68, 0.92)";

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
        <FighterCard2D
          name={fighter?.name ?? undefined}
          style={fighter?.style ?? undefined}
          avatar={fighter?.avatar ?? undefined}
          accentColor={color}
          size={size}
        />
      )}
    </div>
  );
}
