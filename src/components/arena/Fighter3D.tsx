"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useGLTF } from "@react-three/drei";
import { getFighterModelUrl } from "@/lib/meshy-assets";
import type { FightAnim } from "@/components/arena/meshy/ProceduralFallbackBoxer";

const BoxerCanvas = dynamic(() => import("@/components/arena/BoxerCanvas"), { ssr: false });

export type Fighter3DProps = {
  /** Raw fighter row / API object — reads `model_3d_url`, `model_url`, `glb_url`, `meshy_glb_url`. */
  fighter: (Record<string, unknown> & { model_3d_url?: string | null }) | null | undefined;
  /** Reserved for future clip-driven animation (dashboard uses idle). */
  animationState?: FightAnim | string;
  position?: "left" | "right";
  facingRight?: boolean;
  size?: "small" | "medium" | "large";
  /** Optional accent for rim light (hex). */
  fighterColor?: string;
};

/**
 * Meshy / GLB viewer entry: loads Three.js (R3F) only when a model URL exists.
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

  useEffect(() => {
    console.log("FIGHTER DATA:", fighter);
    console.log("MODEL URL:", fighter?.model_3d_url);
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

  if (!url) return null;

  return <BoxerCanvas modelUrl={url} facingRight={faceRight} fighterColor={color} size={size} />;
}
