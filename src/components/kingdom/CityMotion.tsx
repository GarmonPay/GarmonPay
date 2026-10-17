import { useId } from "react";

/** Image-space vectors: the source painting and lion pixels never move. */
export function CityMotion() {
  const prefix = `gp-city-${useId().replace(/:/g, "")}`;
  return <svg className="gp-city-motion" viewBox="0 0 1030 497" aria-hidden="true" focusable="false">
    <defs>
      <mask id={`${prefix}-behind-lion`} maskUnits="userSpaceOnUse" x="0" y="0" width="1030" height="497">
        <rect width="1030" height="497" fill="white" />
        <path d="M355 0H510L540 70 550 150 540 200 570 260 590 320 650 370 678 435 705 470H155L175 420 190 340 210 275 235 200 265 145 290 78 325 40Z" fill="black" />
      </mask>
      <clipPath id={`${prefix}-water`}>
        <path d="m618 265 51-14-8 16-15 8-11 35-5 31 9 14-15 14-16-26-3-26 3-29Z" />
        <path d="m810 357 45-9-7 10-10 4-5 31 4 12-29 1-3-18Z" />
        <path d="m112 391 35 4 8 41-13 11-23-13Z" />
      </clipPath>
      <clipPath id={`${prefix}-screen`}><path d="m792 274 184-44 1 98-187 23Z" /></clipPath>
      <clipPath id={`${prefix}-road`}><path d="m709 410 161 3-12 33-130-10Z" /></clipPath>
    </defs>
    <g mask={`url(#${prefix}-behind-lion)`}>
      <g className="gp-flight gp-flight-one"><image href="/images/kingdom/motion/sky-cruiser.svg" width="68" height="25" /></g>
      <g className="gp-flight gp-flight-two"><image href="/images/kingdom/motion/sky-cruiser.svg" width="40" height="15" transform="translate(40 0) scale(-1 1)" /></g>
      <g clipPath={`url(#${prefix}-road)`}>
        <g className="gp-traffic gp-traffic-one"><image href="/images/kingdom/motion/street-coupe.svg" width="46" height="20" /></g>
        <g className="gp-traffic gp-traffic-two"><image href="/images/kingdom/motion/street-coupe.svg" width="30" height="13" /></g>
      </g>
      <g clipPath={`url(#${prefix}-water)`} className="gp-water-flow">
        {Array.from({ length: 38 }, (_, index) => {
          const x = 600 + index * 7;
          return <path key={x} className={`gp-water-thread gp-water-thread-${index % 3}`} d={`M${x} 246q-20 40-13 85t-4 86`} />;
        })}
        {Array.from({ length: 8 }, (_, index) => <path key={index} className={`gp-water-thread gp-water-thread-${index % 3}`} d={`M${108 + index * 6} 385q10 25 1 65`} />)}
      </g>
      <g clipPath={`url(#${prefix}-screen)`}>
        <g transform="matrix(1 -.23 0 1 790 274)">
          <rect width="200" height="120" fill="#021c30" />
          <g className="gp-ad-slide gp-ad-slide-one"><text x="94" y="39" textAnchor="middle">GARMONPAY</text><text className="gp-ad-caption" x="94" y="61" textAnchor="middle">GET SEEN. GET KNOWN.</text><path d="M20 81h150" stroke="#46d9ff" /></g>
          <g className="gp-ad-slide gp-ad-slide-two"><text x="94" y="39" textAnchor="middle">DISCOVER</text><text className="gp-ad-caption" x="94" y="61" textAnchor="middle">EXPLORE THE KINGDOM</text><circle cx="94" cy="86" r="9" fill="none" stroke="#46d9ff" /></g>
          <g className="gp-ad-slide gp-ad-slide-three"><text x="94" y="39" textAnchor="middle">COMMUNITY</text><text className="gp-ad-caption" x="94" y="61" textAnchor="middle">CONNECT. CREATE. BELONG.</text><path d="m70 90 24-15 24 15" fill="none" stroke="#46d9ff" /></g>
        </g>
      </g>
    </g>
  </svg>;
}
