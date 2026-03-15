/**
 * Arena anti-cheat: rate limit, activity log (IP, fingerprint), velocity checks.
 */

import { getClientIp, rateLimitOr429 } from "./rate-limit";

const ARENA_TRAIN_LIMIT = 30;
const ARENA_FIGHT_CREATE_LIMIT = 20;
const ARENA_SPIN_LIMIT = 10;

/** Returns 429 Response if over limit; otherwise null. */
export function arenaRateLimitTrain(req: Request): Response | null {
  return rateLimitOr429(req, "arena:train", ARENA_TRAIN_LIMIT);
}

export function arenaRateLimitFightCreate(req: Request): Response | null {
  return rateLimitOr429(req, "arena:fight_create", ARENA_FIGHT_CREATE_LIMIT);
}

export function arenaRateLimitSpin(req: Request): Response | null {
  return rateLimitOr429(req, "arena:spin", ARENA_SPIN_LIMIT);
}

export function getClientIpArena(req: Request): string {
  return getClientIp(req);
}
