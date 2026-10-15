/** Optional presentation hooks. No audio is loaded or autoplayed. */

export type CeloDiceImpact = "felt" | "rail" | "settle";

export type CeloDiceImpactListener = (
  impact: CeloDiceImpact,
  dieIndex: 0 | 1 | 2
) => void;

export const CELO_DICE_IMPACT_MARKS: readonly {
  die: 0 | 1 | 2;
  at: number;
  kind: CeloDiceImpact;
}[] = [
  { die: 0, at: 0.16, kind: "felt" },
  { die: 0, at: 0.44, kind: "rail" },
  { die: 0, at: 0.76, kind: "felt" },
  { die: 0, at: 0.98, kind: "settle" },
  { die: 1, at: 0.18, kind: "felt" },
  { die: 1, at: 0.28, kind: "rail" },
  { die: 1, at: 0.62, kind: "felt" },
  { die: 1, at: 0.99, kind: "settle" },
  { die: 2, at: 0.22, kind: "felt" },
  { die: 2, at: 0.34, kind: "rail" },
  { die: 2, at: 0.62, kind: "felt" },
  { die: 2, at: 1, kind: "settle" },
];

const listeners = new Set<CeloDiceImpactListener>();

export function subscribeCeloDiceImpact(listener: CeloDiceImpactListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitCeloDiceImpact(impact: CeloDiceImpact, dieIndex: 0 | 1 | 2) {
  listeners.forEach((listener) => listener(impact, dieIndex));
}

export function scheduleCeloDiceImpacts(durationMs: number): number[] {
  return CELO_DICE_IMPACT_MARKS.map((hit) =>
    window.setTimeout(
      () => emitCeloDiceImpact(hit.kind, hit.die),
      Math.round(durationMs * hit.at)
    )
  );
}
