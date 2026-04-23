/** Public.users profile fields we may embed from Supabase joins. */
export type UserDisplayProfile = {
  display_name?: string | null;
  /** DB column on `users` (maps into display slot before username). */
  full_name?: string | null;
  username?: string | null;
  email?: string | null;
  avatar_url?: string | null;
};

/**
 * Human-readable label for chat / seat list / badges.
 * Order: display_name → full_name → username → email local-part → Player + last 4 of id.
 */
export function resolveDisplayName(
  profile: UserDisplayProfile | null | undefined,
  userId: string
): string {
  const id = String(userId ?? "").trim();
  const dn = String(profile?.display_name ?? "").trim();
  if (dn) return dn;
  const fn = String(profile?.full_name ?? "").trim();
  if (fn) return fn;
  const un = String(profile?.username ?? "").trim();
  if (un) return un;
  const em = String(profile?.email ?? "").trim();
  if (em && em.includes("@")) {
    const local = em.split("@")[0]?.trim();
    if (local) return local;
  }
  const tail = id.length >= 4 ? id.slice(-4) : id || "????";
  return `Player ${tail}`;
}
