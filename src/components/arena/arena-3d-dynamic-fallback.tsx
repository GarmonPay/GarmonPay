"use client";

/**
 * Placeholder while Three.js / R3F chunks load (avoids SSR/hydration pulling 3D into server bundle).
 */
export function Arena3dDynamicFallback() {
  return (
    <div
      style={{
        width: "100%",
        height: 380,
        background: "#000",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span style={{ fontSize: 48 }}>🥊</span>
    </div>
  );
}
