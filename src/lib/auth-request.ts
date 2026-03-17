/**
 * Get authenticated user id from request (Bearer token or x-user-id).
 * Used by API routes that require auth.
 * When only X-User-Id is sent, validates user exists in public.users (service role) so add-funds works if token is missing.
 * Returns null if user is banned.
 */
import { findUserById } from "./auth-store";
import { createServerClient, createAdminClient } from "./supabase";

async function isUserBanned(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin.from("users").select("banned").eq("id", userId).maybeSingle();
  return (data as { banned?: boolean } | null)?.banned === true;
}

export async function getAuthUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const userIdHeader = request.headers.get("x-user-id");

  let userId: string | null = null;

  if (bearerToken) {
    const supabase = createServerClient(bearerToken);
    if (supabase) {
      const { data, error } = await supabase.auth.getUser();
      const user = data?.user ?? null;
      if (!error && user) userId = user.id;
    }
  }

  if (!userId && userIdHeader) {
    const user = findUserById(userIdHeader);
    if (user) userId = user.id;
    else {
      const admin = createAdminClient();
      if (admin) {
        const { data: row } = await admin.from("users").select("id").eq("id", userIdHeader).maybeSingle();
        if (row && (row as { id?: string }).id) userId = (row as { id: string }).id;
      }
    }
  }

  if (userId && (await isUserBanned(userId))) return null;
  return userId;
}

/**
 * Get authenticated user id from request using ONLY Bearer token (no x-user-id).
 * Use for sensitive operations (payments, withdrawals) to prevent header spoofing.
 * Returns null if user is banned.
 */
export async function getAuthUserIdStrict(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!bearerToken) return null;
  const supabase = createServerClient(bearerToken);
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  if (error || !user) return null;
  if (await isUserBanned(user.id)) return null;
  return user.id;
}
