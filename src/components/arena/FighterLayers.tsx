"use client";

function normalizeGearKeys(fighter?: Record<string, unknown> | null) {
  if (!fighter || typeof fighter !== "object") return {};
  const f = fighter as Record<string, unknown>;
  return {
    ...f,
    equipped_gloves: f.equipped_gloves_key ?? f.equipped_gloves,
    equipped_shorts: f.equipped_shorts_key ?? f.equipped_shorts,
    equipped_shoes: f.equipped_shoes_key ?? f.equipped_shoes,
    equipped_headgear: f.equipped_headgear_key ?? f.equipped_headgear,
  };
}

function gloveColorFromFighter(fighter?: Record<string, unknown> | null): string {
  const g = String(fighter?.equipped_gloves ?? "").toLowerCase();
  if (g.includes("championship")) return "#f0c040";
  if (g.includes("titanium")) return "#c0c0c0";
  if (g.includes("pro_gloves") || (g.includes("pro") && g.includes("glove"))) return "#1a3a8f";
  if (g.includes("street")) return "#cc2222";
  if (g === "wraps" || g === "default") return "#e2e8f0";
  return "#cc2222";
}

function shortsColorFromFighter(fighter?: Record<string, unknown> | null): string {
  const s = String(fighter?.equipped_shorts ?? "").toLowerCase();
  if (s.includes("gold")) return "#c8960c";
  if (s.includes("street")) return "#cc2222";
  if (s.includes("champion")) return "#f5f5f5";
  if (s.includes("diamond")) return "#1f2937";
  return "#1a1a2e";
}

function skinColorFromFighter(fighter?: Record<string, unknown> | null): string {
  const t = String(fighter?.skin_tone ?? "tone3");
  if (t === "tone1") return "#f5d5b8";
  if (t === "tone2") return "#e8b89a";
  if (t === "tone4") return "#b8723d";
  if (t === "tone5") return "#8d4a1f";
  if (t === "tone6") return "#5c2e0e";
  return "#d4956a";
}

export interface FighterLayersProps {
  fighter?: Record<string, unknown> | null;
  size?: "small" | "medium" | "large";
  facingRight?: boolean;
  className?: string;
}

export default function FighterLayers({
  fighter: fighterProp,
  size = "medium",
  facingRight = false,
  className = "",
}: FighterLayersProps) {
  const fighter = normalizeGearKeys(fighterProp) as Record<string, unknown> | undefined;
  const heights = { small: 200, medium: 380, large: 520 };

  const gloveColor = gloveColorFromFighter(fighter);
  const shortsColor = shortsColorFromFighter(fighter);
  const skinColor = skinColorFromFighter(fighter);
  const fighterColor = String(fighter?.fighter_color ?? "#f0a500");

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: heights[size],
        background: "#000000",
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "60%",
          height: "100%",
          background: "radial-gradient(ellipse at 50% 0%, rgba(255,245,224,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <svg
        width={size === "small" ? 120 : size === "large" ? 240 : 180}
        height={size === "small" ? 180 : size === "large" ? 360 : 280}
        viewBox="0 0 180 280"
        style={{ transform: facingRight ? "scaleX(-1)" : "none" }}
      >
        <ellipse cx="90" cy="272" rx="45" ry="6" fill="rgba(0,0,0,0.5)" />

        <rect x="58" y="245" width="22" height="24" rx="4" fill="#111111" />
        <rect x="55" y="260" width="28" height="9" rx="3" fill="#0a0a0a" />

        <rect x="100" y="248" width="22" height="22" rx="4" fill="#111111" />
        <rect x="97" y="261" width="28" height="9" rx="3" fill="#0a0a0a" />

        <rect x="62" y="190" width="20" height="58" rx="8" fill={skinColor} />

        <rect x="100" y="195" width="20" height="56" rx="8" fill={skinColor} />

        <rect x="56" y="178" width="68" height="42" rx="6" fill={shortsColor} />
        <rect x="56" y="178" width="68" height="10" rx="4" fill="rgba(0,0,0,0.3)" />
        <rect x="60" y="188" width="6" height="28" fill="rgba(255,255,255,0.15)" />
        <rect x="114" y="188" width="6" height="28" fill="rgba(255,255,255,0.15)" />

        <rect x="60" y="105" width="60" height="78" rx="10" fill={skinColor} />
        <path d="M 68 118 Q 85 110 90 118 Q 90 128 68 128 Z" fill="rgba(0,0,0,0.08)" />
        <path d="M 112 118 Q 95 110 90 118 Q 90 128 112 128 Z" fill="rgba(0,0,0,0.08)" />
        <rect x="78" y="138" width="12" height="8" rx="3" fill="rgba(0,0,0,0.07)" />
        <rect x="92" y="138" width="12" height="8" rx="3" fill="rgba(0,0,0,0.07)" />
        <rect x="78" y="150" width="12" height="8" rx="3" fill="rgba(0,0,0,0.07)" />
        <rect x="92" y="150" width="12" height="8" rx="3" fill="rgba(0,0,0,0.07)" />

        <rect x="82" y="88" width="16" height="20" rx="5" fill={skinColor} />

        <ellipse cx="90" cy="72" rx="24" ry="28" fill={skinColor} />
        <ellipse cx="90" cy="88" rx="18" ry="10" fill={skinColor} />
        <ellipse cx="80" cy="65" rx="5" ry="4" fill="#1a1a1a" />
        <ellipse cx="100" cy="65" rx="5" ry="4" fill="#1a1a1a" />
        <ellipse cx="82" cy="64" rx="2" ry="1.5" fill="white" opacity={0.6} />
        <ellipse cx="102" cy="64" rx="2" ry="1.5" fill="white" opacity={0.6} />
        <path d="M 74 58 L 87 61" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />
        <path d="M 93 61 L 106 58" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="90" cy="74" rx="3" ry="4" fill="rgba(0,0,0,0.1)" />
        <path
          d="M 84 82 Q 90 85 96 82"
          stroke="#8b4513"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <ellipse cx="66" cy="72" rx="5" ry="7" fill={skinColor} />
        <ellipse cx="114" cy="72" rx="5" ry="7" fill={skinColor} />

        <rect
          x="36"
          y="108"
          width="18"
          height="38"
          rx="8"
          fill={skinColor}
          transform="rotate(-35, 45, 127)"
        />
        <rect
          x="22"
          y="105"
          width="16"
          height="34"
          rx="7"
          fill={skinColor}
          transform="rotate(-10, 30, 122)"
        />
        <ellipse cx="28" cy="98" rx="18" ry="14" fill={gloveColor} />
        <ellipse cx="28" cy="90" rx="14" ry="8" fill={gloveColor} />
        <ellipse cx="14" cy="95" rx="7" ry="5" fill={gloveColor} transform="rotate(-20, 14, 95)" />
        <ellipse cx="22" cy="88" rx="6" ry="4" fill="rgba(255,255,255,0.2)" />
        <rect x="18" y="108" width="20" height="10" rx="3" fill="#1a1a1a" />

        <rect
          x="122"
          y="108"
          width="18"
          height="36"
          rx="8"
          fill={skinColor}
          transform="rotate(20, 131, 126)"
        />
        <rect
          x="126"
          y="100"
          width="16"
          height="30"
          rx="7"
          fill={skinColor}
          transform="rotate(5, 134, 115)"
        />
        <ellipse cx="138" cy="95" rx="16" ry="13" fill={gloveColor} />
        <ellipse cx="138" cy="88" rx="12" ry="7" fill={gloveColor} />
        <ellipse cx="152" cy="93" rx="6" ry="5" fill={gloveColor} transform="rotate(15, 152, 93)" />
        <ellipse cx="132" cy="86" rx="5" ry="3.5" fill="rgba(255,255,255,0.2)" />
        <rect x="128" y="105" width="18" height="10" rx="3" fill="#1a1a1a" />

        <ellipse cx="90" cy="140" rx="50" ry="30" fill={fighterColor} opacity={0.04} />
      </svg>

      {fighter?.name != null && String(fighter.name).length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            color: fighterColor,
            fontFamily: "Bebas Neue, sans-serif",
            fontSize: 16,
            letterSpacing: 3,
            whiteSpace: "nowrap",
          }}
        >
          {String(fighter.name)}
        </div>
      )}
    </div>
  );
}

/** Same visual as FighterLayers — used by BoxingRing and arena pages. */
export function FighterDisplay({
  fighter,
  size = "medium",
  animation: _animation,
  showGear: _showGear,
  mirrored = false,
  className = "",
}: {
  fighter: Record<string, unknown> | null | undefined;
  size?: "small" | "medium" | "large";
  animation?: string;
  showGear?: boolean;
  mirrored?: boolean;
  className?: string;
}) {
  return (
    <FighterLayers fighter={fighter} size={size} facingRight={mirrored} className={className} />
  );
}

