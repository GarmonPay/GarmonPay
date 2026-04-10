/**
 * Prefer `.select(...).limit(1)` (or `.insert(...).select(...).limit(1)`) plus this helper
 * instead of `.single()` / `.maybeSingle()` when multiple matching rows would make PostgREST error.
 */
export function celoFirstRow<T>(rows: T[] | null | undefined): T | null {
  return rows?.[0] ?? null;
}
