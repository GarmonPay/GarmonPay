"use client";

/**
 * Legacy 2D fighter panel when no Meshy GLB URL exists — stats card + emoji avatar (not a sprite sheet).
 */
export function FighterCard2D({
  name,
  style,
  avatar,
  accentColor = "#f0a500",
  size = "medium",
}: {
  name?: string | null;
  style?: string | null;
  avatar?: string | null;
  accentColor?: string;
  size?: "small" | "medium" | "large";
}) {
  const heights = { small: 220, medium: 380, large: 560 };
  const h = heights[size];
  const displayAvatar = typeof avatar === "string" && avatar.trim() ? avatar : "🥊";

  return (
    <div
      style={{
        width: "100%",
        height: h,
        borderRadius: 8,
        overflow: "hidden",
        background: "linear-gradient(180deg, #12151c 0%, #0a0a0f 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 20,
      }}
    >
      <div
        style={{
          fontSize: size === "small" ? 56 : size === "large" ? 96 : 72,
          lineHeight: 1,
          filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))",
        }}
        aria-hidden
      >
        {displayAvatar}
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: accentColor }}>{name ?? "Fighter"}</div>
        <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>{style ?? "Boxer"}</div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 10 }}>3D model not linked — train or generate Meshy asset</div>
      </div>
    </div>
  );
}
