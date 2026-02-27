/**
 * Get authenticated user id from request (Bearer token).
 * Optionally allow x-user-id only when ALLOW_INSECURE_USER_ID_HEADER=true.
 * Used by API routes that require auth.
 */

import { createServerClient } from "./supabase";

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

  if (userIdHeader && process.env.ALLOW_INSECURE_USER_ID_HEADER === "true") {
    return userIdHeader;
  }

  return null;
}
