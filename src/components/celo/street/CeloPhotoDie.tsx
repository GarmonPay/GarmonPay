"use client";

import { useEffect, useState } from "react";
import { displayedDieFace } from "./celo-throw";

/**
 * Presentation-only die. The settled face is the value passed in.
 * This component never rolls or chooses a result.
 */
const FACE_SRC: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "/images/celo/dice/face-1.png",
  2: "/images/celo/dice/face-2.png",
  3: "/images/celo/dice/face-3.png",
  4: "/images/celo/dice/face-4.png",
  5: "/images/celo/dice/face-5.png",
  6: "/images/celo/dice/face-6.png",
};

function isFace(value: number | null | undefined): value is 1 | 2 | 3 | 4 | 5 | 6 {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6;
}

export function CeloPhotoDie({
  value,
  throwing = false,
  tilt = 0,
  lane = 0,
  variant = 0,
}: {
  value?: number | null;
  throwing?: boolean;
  tilt?: number;
  lane?: 0 | 1 | 2;
  variant?: 0 | 1 | 2;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!throwing) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 80);
    return () => window.clearInterval(id);
  }, [throwing]);

  const shown = displayedDieFace(isFace(value) ? value : null, throwing, lane, tick);
  const face = isFace(shown) ? shown : null;
  const src = face ? FACE_SRC[face] : null;

  return (
    <div
      className={`celo-photo-die${throwing ? " is-live" : ""}`}
      data-lane={lane}
      data-variant={variant}
      style={{ ["--die-tilt" as string]: `${tilt}deg` }}
      aria-hidden
    >
      <span className="celo-die-shadow" />
      <span className="celo-die-body">
        {src ? (
          <>
            <img className="celo-photo-face" src={src} alt="" draggable={false} />
            <img className="celo-photo-reflect" src={src} alt="" draggable={false} />
            <span className="celo-die-flash" />
          </>
        ) : (
          <span className="celo-photo-blank" />
        )}
      </span>
    </div>
  );
}
