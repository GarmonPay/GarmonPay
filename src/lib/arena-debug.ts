/**
 * Opt-in arena / Meshy debug (logs + on-screen badges).
 * Set `NEXT_PUBLIC_ARENA_DEBUG=1` in `.env.local` or Vercel.
 */
export function isArenaDebugEnabled(): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  const v = process.env.NEXT_PUBLIC_ARENA_DEBUG;
  return v === "1" || v === "true";
}
