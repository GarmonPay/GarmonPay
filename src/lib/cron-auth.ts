/** Missing or blank configuration never authorizes a cron job. */
export function isCronAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  const authorization = request.headers.get("authorization");
  const supplied = (request.headers.get("x-cron-secret") ??
    (authorization?.startsWith("Bearer ") ? authorization.slice(7) : "")).trim();
  return supplied.length > 0 && supplied === expected;
}
