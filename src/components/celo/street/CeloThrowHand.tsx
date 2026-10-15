"use client";

import { HAND_TONES, handAsset, visualTumbleFace, type HandTone } from "./celo-throw";

/**
 * Presentation-only hand. The tone is assigned once per shooter id.
 * Hold, shake, and release are separate frames. The sprite sheet is never shown.
 * Palm pips match the first tumble frame so they are not the settled result.
 */
const PALM_FACES = [0, 1, 2].map(
  (lane) => `/images/celo/dice/face-${visualTumbleFace(lane, 0)}.png`
);

export function CeloThrowHand({
  phase,
  tone,
  reduced = false,
}: {
  phase: "off" | "shake" | "release";
  tone: HandTone;
  reduced?: boolean;
}) {
  const hold = handAsset("hold", tone);
  const shake = handAsset("shake", tone);
  return (
    <>
      <div className="celo-hand-preload" aria-hidden>
        {HAND_TONES.flatMap((name) =>
          (["hold", "shake", "release"] as const).map((kind) => (
            <img key={`${kind}-${name}`} src={handAsset(kind, name)} alt="" />
          ))
        )}
      </div>
      {phase !== "off" ? (
        <div
          className={`celo-throw-hand is-${phase}${reduced ? " is-reduced" : ""}`}
          data-hand-tone={tone}
          data-celo-hand-phase={phase}
          aria-hidden
        >
          <img className="celo-hand-hold celo-hand-layer-back" src={hold} alt="" draggable={false} />
          <img className="celo-hand-shake celo-hand-layer-back" src={shake} alt="" draggable={false} />
          <span className="celo-palm-dice">
            {PALM_FACES.map((src, lane) => (
              <img key={`${lane}-${src}`} src={src} alt="" draggable={false} />
            ))}
          </span>
          <img className="celo-hand-hold celo-hand-layer-front" src={hold} alt="" draggable={false} />
          <img className="celo-hand-shake celo-hand-layer-front" src={shake} alt="" draggable={false} />
          <img className="celo-hand-release" src={handAsset("release", tone)} alt="" draggable={false} />
        </div>
      ) : null}
    </>
  );
}
