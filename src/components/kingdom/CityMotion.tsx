import { useId } from "react";

/**
 * One opaque screen inside the painted billboard frame.
 * The lion, cars, aircraft, and waterfalls stay in the source painting.
 * Extra vehicles or water strokes are not drawn over those painted objects.
 */
const SCREEN = "796,146 992,132 1000,328 786,338";

export function CityMotion() {
  const prefix = `gp-city-${useId().replace(/:/g, "")}`;
  return (
    <svg className="gp-city-motion" viewBox="0 0 1030 497" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`${prefix}-screen`}>
          <polygon points={SCREEN} />
        </clipPath>
        <linearGradient id={`${prefix}-glass`} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor="#16344a" />
          <stop offset="0.42" stopColor="#07141e" />
          <stop offset="1" stopColor="#040b12" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${prefix}-screen)`}>
        <polygon points={SCREEN} fill={`url(#${prefix}-glass)`} />
        <rect className="gp-screen-sheen" x="760" y="110" width="36" height="250" fill="#b7f6ff" opacity="0.16" />
        <g className="gp-ad-slide gp-ad-slide-one">
          <text x="892" y="214" textAnchor="middle">GARMONPAY</text>
          <text className="gp-ad-caption" x="892" y="236" textAnchor="middle">GET SEEN. GET KNOWN.</text>
          <path d="M820 252h144" stroke="#46d9ff" strokeWidth="1.5" />
        </g>
        <g className="gp-ad-slide gp-ad-slide-two">
          <text x="892" y="214" textAnchor="middle">DISCOVER</text>
          <text className="gp-ad-caption" x="892" y="236" textAnchor="middle">EXPLORE THE KINGDOM</text>
          <circle cx="892" cy="258" r="8" fill="none" stroke="#46d9ff" strokeWidth="1.5" />
        </g>
        <g className="gp-ad-slide gp-ad-slide-three">
          <text x="892" y="214" textAnchor="middle">COMMUNITY</text>
          <text className="gp-ad-caption" x="892" y="236" textAnchor="middle">CONNECT. CREATE. BELONG.</text>
          <path d="M868 266 892 252 916 266" fill="none" stroke="#46d9ff" strokeWidth="1.5" />
        </g>
      </g>
    </svg>
  );
}
