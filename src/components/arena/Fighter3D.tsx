"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { getFighterModelUrl } from "@/lib/meshy-assets";
import { isArenaDebugEnabled } from "@/lib/arena-debug";
import { safeFighterColor } from "@/lib/arena-safe-fighter";
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
        <FighterCard2D
          name={typeof fighter?.name === "string" ? fighter.name : undefined}
          style={typeof fighter?.style === "string" ? fighter.style : undefined}
          avatar={typeof fighter?.avatar === "string" ? fighter.avatar : undefined}
          accentColor={color}
          size={size}
        />
      )}
    </div>
  );
}
