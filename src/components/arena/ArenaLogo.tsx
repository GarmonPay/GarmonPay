import type { CSSProperties } from "react";

function CrossedGloves() {
  return (
    <>
      <g transform="translate(10, 15) rotate(-30, 45, 45)">
        <ellipse cx="45" cy="50" rx="28" ry="35" fill="#c1272d" stroke="#8b0000" strokeWidth="2" />
        <ellipse
          cx="22"
          cy="35"
          rx="10"
          ry="14"
          fill="#c1272d"
          stroke="#8b0000"
          strokeWidth="1.5"
          transform="rotate(-20, 22, 35)"
        />
        <ellipse cx="52" cy="28" rx="18" ry="8" fill="#e63946" opacity="0.6" />
        <rect x="20" y="72" width="50" height="18" rx="4" fill="#1a1a2e" stroke="#333" strokeWidth="1" />
        <line x1="20" y1="79" x2="70" y2="79" stroke="#333" strokeWidth="1" />
        <line x1="20" y1="85" x2="70" y2="85" stroke="#333" strokeWidth="1" />
        <ellipse
          cx="35"
          cy="32"
          rx="8"
          ry="12"
          fill="white"
          opacity="0.15"
          transform="rotate(-15, 35, 32)"
        />
      </g>
      <g transform="translate(55, 15) rotate(30, 45, 45) scale(-1, 1) translate(-90, 0)">
        <ellipse cx="45" cy="50" rx="28" ry="35" fill="#c1272d" stroke="#8b0000" strokeWidth="2" />
        <ellipse
          cx="22"
          cy="35"
          rx="10"
          ry="14"
          fill="#c1272d"
          stroke="#8b0000"
          strokeWidth="1.5"
          transform="rotate(-20, 22, 35)"
        />
        <ellipse cx="52" cy="28" rx="18" ry="8" fill="#e63946" opacity="0.6" />
        <rect x="20" y="72" width="50" height="18" rx="4" fill="#1a1a2e" stroke="#333" strokeWidth="1" />
        <line x1="20" y1="79" x2="70" y2="79" stroke="#333" strokeWidth="1" />
        <line x1="20" y1="85" x2="70" y2="85" stroke="#333" strokeWidth="1" />
        <ellipse
          cx="35"
          cy="32"
          rx="8"
          ry="12"
          fill="white"
          opacity="0.15"
          transform="rotate(-15, 35, 32)"
        />
      </g>
    </>
  );
}

const FULL_SIZES = {
  small: { width: 120, height: 40 },
  medium: { width: 200, height: 65 },
  large: { width: 320, height: 105 },
} as const;

const ICON_SIZES = {
  small: { width: 44, height: 38 },
  medium: { width: 64, height: 55 },
  large: { width: 88, height: 76 },
} as const;

const HORIZONTAL_SIZES = {
  small: { width: 200, height: 44 },
  medium: { width: 300, height: 56 },
  large: { width: 400, height: 72 },
} as const;

export default function ArenaLogo({
  size = "medium",
  variant = "full",
  className,
  style,
  "aria-label": ariaLabel = "GarmonPay Arena",
}: {
  size?: "small" | "medium" | "large";
  variant?: "full" | "icon" | "horizontal";
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}) {
  if (variant === "icon") {
    const { width, height } = ICON_SIZES[size];
    return (
      <svg
        className={className}
        style={style}
        width={width}
        height={height}
        viewBox="5 12 115 88"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={ariaLabel}
      >
        <CrossedGloves />
      </svg>
    );
  }

  if (variant === "horizontal") {
    const { width, height } = HORIZONTAL_SIZES[size];
    const fs = size === "small" ? 22 : size === "large" ? 34 : 28;
    const fsArena = size === "small" ? 12 : size === "large" ? 20 : 16;
    const lx = size === "small" ? 115 : size === "large" ? 155 : 135;
    return (
      <svg
        className={className}
        style={style}
        width={width}
        height={height}
        viewBox="0 0 400 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={ariaLabel}
      >
        <g transform="translate(0, 2) scale(0.72)">
          <CrossedGloves />
        </g>
        <text
          x={lx}
          y={size === "small" ? 28 : size === "large" ? 38 : 32}
          fontFamily="system-ui, 'Bebas Neue', 'Arial Narrow', sans-serif"
          fontSize={fs}
          fontWeight="700"
          fill="#ffffff"
          letterSpacing="0.12em"
        >
          GARMONPAY
        </text>
        <text
          x={lx}
          y={size === "small" ? 44 : size === "large" ? 58 : 50}
          fontFamily="system-ui, 'Bebas Neue', 'Arial Narrow', sans-serif"
          fontSize={fsArena}
          fontWeight="600"
          fill="#f0a500"
          letterSpacing="0.35em"
        >
          ARENA
        </text>
        <line
          x1={lx}
          y1={size === "small" ? 48 : size === "large" ? 64 : 54}
          x2={lx + (size === "small" ? 100 : size === "large" ? 180 : 140)}
          y2={size === "small" ? 48 : size === "large" ? 64 : 54}
          stroke="#f0a500"
          strokeWidth="1.5"
          opacity="0.6"
        />
      </svg>
    );
  }

  const { width, height } = FULL_SIZES[size];
  return (
    <svg
      className={className}
      style={style}
      width={width}
      height={height}
      viewBox="0 0 320 105"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
    >
      <CrossedGloves />
      <text
        x="160"
        y="42"
        fontFamily="system-ui, 'Bebas Neue', 'Black Ops One', sans-serif"
        fontSize="38"
        fontWeight="700"
        fill="#ffffff"
        letterSpacing="4"
        textAnchor="middle"
      >
        GARMONPAY
      </text>
      <text
        x="160"
        y="68"
        fontFamily="system-ui, 'Bebas Neue', 'Black Ops One', sans-serif"
        fontSize="22"
        fontWeight="400"
        fill="#f0a500"
        letterSpacing="8"
        textAnchor="middle"
      >
        ARENA
      </text>
      <line x1="100" y1="74" x2="220" y2="74" stroke="#f0a500" strokeWidth="1.5" opacity="0.6" />
    </svg>
  );
}
