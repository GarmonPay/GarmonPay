/**
 * GarmonPay Pinball — physics constants and collision helpers.
 * All units in pixels/frame; canvas coordinate system.
 */

export const GRAVITY = 0.4;
export const BALL_RADIUS = 10;
export const VELOCITY_CAP = 18;
export const BOUNCE_COEF = 0.75;
export const FRICTION = 0.995;
export const FLIPPER_LENGTH = 70;
export const FLIPPER_REST_ANGLE = (-30 * Math.PI) / 180;
export const FLIPPER_ACTIVE_ANGLE = (30 * Math.PI) / 180;
export const FLIPPER_SPEED = (8 * Math.PI) / 180;
export const BUMPER_RADIUS = 20;
export const BUMPER_BOOST = 1.3;
export const BUMPER_MIN_SPEED = 6;
export const WALL_ANGLE_VARIATION = (2 * Math.PI) / 180;
export const RAMP_MIN_SPEED = 10;
export const DRAIN_GRACE_MS = 500;

export const BUMPER_POINTS: Record<string, number> = {
  "📱": 100,
  "🪙": 200,
  "💰": 300,
  "🥊": 500,
  "🏆": 750,
  "💎": 1000,
};

export const GARMON_BONUS = 5000;
export const JACKPOT_BONUS_POINTS = 10000;
export const MULTIBALL_DURATION_MS = 30000;
export const RAMP_MULTIPLIER_DURATION_MS = 10000;
export const MULTIBALL_POINT_MULT = 1.5;

export function clampSpeed(vx: number, vy: number): { vx: number; vy: number } {
  const s = Math.sqrt(vx * vx + vy * vy);
  if (s <= VELOCITY_CAP) return { vx, vy };
  const f = VELOCITY_CAP / s;
  return { vx: vx * f, vy: vy * f };
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function circleCircle(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): boolean {
  return distance(ax, ay, bx, by) <= ar + br;
}

/** Reflect velocity off a surface with normal (nx, ny), bounce coef, optional speed boost */
export function reflect(
  vx: number,
  vy: number,
  nx: number,
  ny: number,
  coef: number = BOUNCE_COEF,
  boost: number = 1
): { vx: number; vy: number } {
  const dot = vx * nx + vy * ny;
  if (dot >= 0) return { vx, vy };
  let vx2 = (vx - 2 * dot * nx) * coef * boost;
  let vy2 = (vy - 2 * dot * ny) * coef * boost;
  const s = Math.sqrt(vx2 * vx2 + vy2 * vy2);
  if (s > 0 && s < BUMPER_MIN_SPEED && boost > 1) {
    const f = BUMPER_MIN_SPEED / s;
    vx2 *= f;
    vy2 *= f;
  }
  return clampSpeed(vx2, vy2);
}

/** Flipper segment: line from (x1,y1) to (x2,y2), angle in radians */
export function flipperEndpoints(
  cx: number,
  cy: number,
  angle: number,
  length: number
): { x1: number; y1: number; x2: number; y2: number } {
  const half = length / 2;
  const x1 = cx - half * Math.cos(angle);
  const y1 = cy - half * Math.sin(angle);
  const x2 = cx + half * Math.cos(angle);
  const y2 = cy + half * Math.sin(angle);
  return { x1, y1, x2, y2 };
}

/** Point-to-segment distance (squared) and closest point */
export function pointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { distSq: number; closestX: number; closestY: number; t: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1e-10;
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const distSq = (px - closestX) ** 2 + (py - closestY) ** 2;
  return { distSq, closestX, closestY, t };
}
