"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { getFighterModelUrl } from "@/lib/meshy-assets";
import { isArenaDebugEnabled } from "@/lib/arena-debug";
import { safeFighterColor } from "@/lib/arena-safe-fighter";

const Fighter3D = dynamic(() => import("@/components/arena/Fighter3D"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: 380,
        background: "#0a0a0f",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          border: "2px solid rgba(240,165,0,0.35)",
          borderTopColor: "#f0a500",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <div
        style={{
          color: "#94a3b8",
          fontSize: 11,
          letterSpacing: "0.2em",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        LOADING FIGHTER…
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  ),
});

interface BoxerDisplayProps {
  fighter?: {
    name?: string | null;
    style?: string | null;
    avatar?: string | null;
    fighter_color?: string | null;
    model_3d_url?: string | null;
    model_url?: string | null;
    glb_url?: string | null;
    meshy_glb_url?: string | null;
    stats?: Record<string, number>;
  } | null;
  facingRight?: boolean;
  size?: "small" | "medium" | "large";
}

export default function BoxerDisplay({ fighter, facingRight = false, size = "medium" }: BoxerDisplayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const heights = { small: 220, medium: 380, large: 560 };

  if (fighter == null) {
    return (
      <div
        style={{
          width: "100%",
          height: heights[size],
          background: "#0a0a0f",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ color: "#64748b", fontSize: 12, letterSpacing: "0.15em" }}>NO FIGHTER DATA</div>
      </div>
    );
  }

  const color = safeFighterColor(fighter as Record<string, unknown>, "#f0a500");

  if (!mounted) {
    return (
      <div
        style={{
          width: "100%",
          height: heights[size],
          background: "#0a0a0f",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.2em" }}>INITIALIZING…</div>
      </div>
    );
  }

  if (isArenaDebugEnabled()) {
    console.log(
      "RENDER PATH:",
      getFighterModelUrl(fighter as Record<string, unknown>) ? "Fighter3D" : "FighterCard2D"
    );
  }

  return (
    <Fighter3D
      fighter={fighter as Record<string, unknown>}
      position={facingRight ? "right" : "left"}
      facingRight={facingRight}
      size={size}
      fighterColor={color}
    />
  );
}
