import type { CeloRollStartedPayload } from "@/lib/celo-roll-broadcast";

export type CeloRollSequenceCallbacks = {
  onRollingStart: () => void;
  onRevealStart: (dice: [number, number, number]) => void;
  onRollFinished: () => void;
};

/**
 * Schedules rolling → reveal → finished using server timestamps (not local-only guesses).
 * Returns a cancel function that clears all timers.
 */
export function scheduleCeloRollSequence(
  payload: CeloRollStartedPayload,
  cb: CeloRollSequenceCallbacks
): () => void {
  const startMs = Date.parse(payload.serverStartTime);
  const revealMs = Date.parse(payload.revealAt);
  const endMs = Date.parse(payload.sequenceEndAt);
  const now = Date.now();

  const timers: ReturnType<typeof setTimeout>[] = [];

  const safe = (fn: () => void, delay: number) => {
    if (delay <= 0) {
      fn();
      return;
    }
    timers.push(setTimeout(fn, delay));
  };

  if (now >= endMs) {
    cb.onRollingStart();
    cb.onRevealStart(payload.finalDice);
    cb.onRollFinished();
    return () => {};
  }

  if (now >= revealMs) {
    cb.onRollingStart();
    safe(() => cb.onRevealStart(payload.finalDice), 0);
    safe(() => cb.onRollFinished(), Math.max(0, endMs - now));
    return () => timers.forEach(clearTimeout);
  }

  safe(() => cb.onRollingStart(), Math.max(0, startMs - now));
  safe(() => cb.onRevealStart(payload.finalDice), Math.max(0, revealMs - now));
  safe(() => cb.onRollFinished(), Math.max(0, endMs - now));

  return () => timers.forEach(clearTimeout);
}
