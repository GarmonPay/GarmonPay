/**
 * IP-based rate limiting for API routes.
 * 10 requests per minute per IP per route key.
 * Uses in-memory store; for multi-instance deployment consider Redis (e.g. @upstash/ratelimit).
 */

const DEFAULT_LIMIT = 10;
const WINDOW_MS = 60 * 1000; // 1 minute

type Entry = { count: number; windowEnd: number };

const store = new Map<string, Entry>();

/** Get client IP from request (x-forwarded-for, x-real-ip, or fallback). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Check rate limit for a key (e.g. "withdraw", "admin").
 * Returns allowed=false and retryAfterSec when over limit.
 */
export function checkRateLimit(
  ip: string,
  routeKey: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = WINDOW_MS
): RateLimitResult {
  const now = Date.now();
  const key = `rl:${ip}:${routeKey}`;
  let entry = store.get(key);

  if (!entry || now >= entry.windowEnd) {
    entry = { count: 0, windowEnd: now + windowMs };
    store.set(key, entry);
  }

  entry.count += 1;
  const remaining = Math.max(0, limit - entry.count);
  const retryAfterSec = Math.ceil((entry.windowEnd - now) / 1000);

  if (entry.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSec };
  }
  return { allowed: true, remaining, retryAfterSec };
}

/**
 * Apply rate limit: if over limit, return 429 Response; otherwise return null (caller continues).
 * Use at the start of an API route.
 */
export function rateLimitOr429(
  request: Request,
  routeKey: string,
  limit: number = DEFAULT_LIMIT
): Response | null {
  const ip = getClientIp(request);
  const result = checkRateLimit(ip, routeKey, limit);
  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        message: "Too Many Requests",
        retryAfter: result.retryAfterSec,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(result.retryAfterSec),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }
  return null;
}
