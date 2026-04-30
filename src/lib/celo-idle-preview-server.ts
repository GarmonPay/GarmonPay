import { randomInt } from "node:crypto";

/** One server roll of three fair dice 1–6 for shared idle felt (not the real banker roll). */
export function generateCeloIdlePreviewDiceTriplet(): [number, number, number] {
  return [randomInt(1, 7), randomInt(1, 7), randomInt(1, 7)];
}
