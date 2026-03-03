/**
 * Get authenticated user id from request (Bearer token or x-user-id).
 * Used by API routes that require auth.
 * When only X-User-Id is sent, validates user exists in public.users (service role) so add-funds works if token is missing.
 */
import { findUserById } from "./auth-store";
import { createServerClient, createAdminClient } from "./supabase";

export async function getAuthUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const userIdHeader = request.headers.get("x-user-id");

  if (bearerToken) {
    const supabase = createServerClient(bearerToken);
    if (supabase) {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!error && user) return user.id;
    }
  }

  if (userIdHeader) {
    const user = findUserById(userIdHeader);
    if (user) return user.id;
    const admin = createAdminClient();
    if (admin) {
      const { data: row } = await admin.from("users").select("id").eq("id", userIdHeader).maybeSingle();
      if (row && (row as { id?: string }).id) return (row as { id: string }).id;
    }
  }

  return null;
}
