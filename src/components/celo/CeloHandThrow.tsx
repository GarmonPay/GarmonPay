"use client";

/**
 * FALLBACK animated hand silhouette — swap for a rigged 3D/Lottie hand asset.
 * Replace the SVG group marked `SWAP_ASSET_HERE` or load from `/public/celo/hand-roll.webp`.
 */
export function CeloHandThrow({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div
      className="pointer-events-none absolute left-1/2 z-20 w-[min(100%,280px)] -translate-x-1/2"
      style={{ bottom: "8%", perspective: "800px" }}
      aria-hidden
    >
      <svg viewBox="0 0 320 120" className="w-full drop-shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
        <title>FALLBACK: animated hand — replace asset in CeloHandThrow.tsx</title>
        <defs>
          <linearGradient id="handGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fde7c8" />
            <stop offset="55%" stopColor="#e8c4a0" />
            <stop offset="100%" stopColor="#c49a74" />
          </linearGradient>
        </defs>
        <g className="celo-hand-sweep">
          {/* SWAP_ASSET_HERE — placeholder stylized palm + fingers */}
          <ellipse cx="160" cy="88" rx="72" ry="28" fill="url(#handGrad)" opacity={0.95} />
          <path
            d="M96 88 Q120 52 160 48 Q200 52 224 88 Q200 72 160 68 Q120 72 96 88Z"
            fill="url(#handGrad)"
            stroke="rgba(0,0,0,0.12)"
            strokeWidth={1}
          />
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={118 + i * 22}
              y={32}
              width={14}
              height={36}
              rx={6}
              fill="url(#handGrad)"
              stroke="rgba(0,0,0,0.1)"
              strokeWidth={0.5}
              className="celo-finger-wiggle"
              style={{
                animationDelay: `${i * 0.12}s`,
                transformOrigin: `${125 + i * 22}px 68px`,
              }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
