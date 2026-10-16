import { useId } from "react";

/** Gold crown with blue gemstones, drawn to match the lion's crown. Not a font icon. */
export function BrandCrown() {
  const id = useId().replace(/:/g, "");
  const gold = `gp-crown-gold-${id}`;
  const gem = `gp-crown-gem-${id}`;
  const shine = `gp-crown-shine-${id}`;
  return (
    <svg viewBox="0 0 64 52" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gold} x1="8" y1="4" x2="56" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff6d4" />
          <stop offset=".42" stopColor="#e4c16a" />
          <stop offset="1" stopColor="#8d5e22" />
        </linearGradient>
        <linearGradient id={gem} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e0f7ff" />
          <stop offset=".45" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
        <radialGradient id={shine} cx="35%" cy="30%" r="65%">
          <stop offset="0" stopColor="#fffaf0" stopOpacity=".95" />
          <stop offset="1" stopColor="#e4c16a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path fill={`url(#${gold})`} d="M6 40 14 18l8 12 8-16 2-8 2 8 8 16 8-12 8 22-6 6H12Z" />
      <path fill={`url(#${shine})`} d="M14 18 22 30l8-16 2-6v22H16Z" opacity=".55" />
      <path fill="none" stroke="#fff1c4" strokeWidth="1.1" d="M16 34c4-6 8-6 12 0s8 6 12 0 8-6 12 0" />
      <path fill="#f6e2a8" d="M30 6h4l1 6h-6Zm-1 5h6l-1 4h-4Z" />
      <circle cx="32" cy="5" r="1.6" fill="#fff6d4" />
      <path fill={`url(#${gem})`} d="M32 14 35.2 18 32 22 28.8 18Z" />
      <path fill={`url(#${gem})`} d="M18 24 20.4 27 18 30 15.6 27Z" />
      <path fill={`url(#${gem})`} d="M46 24 48.4 27 46 30 43.6 27Z" />
      <path fill={`url(#${gold})`} d="M8 40h48l-2 8H10Z" />
      <path fill="#fff1c4" d="M10 41.2h44v1.2H10Z" opacity=".8" />
      <ellipse cx="32" cy="44.5" rx="4.2" ry="2.6" fill={`url(#${gem})`} />
      <circle cx="16" cy="44.5" r="1.5" fill={`url(#${gem})`} />
      <circle cx="48" cy="44.5" r="1.5" fill={`url(#${gem})`} />
      <circle cx="22.5" cy="44.5" r="1" fill="#9adfff" />
      <circle cx="41.5" cy="44.5" r="1" fill="#9adfff" />
    </svg>
  );
}
