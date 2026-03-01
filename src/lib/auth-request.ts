/**
 * Get authenticated user id from request (Bearer token or x-user-id).
 * Used by API routes that require auth.
 */

import { findUserById } from "./auth-store";
import { createServerClient } from "./supabase";

export interface AuthenticatedSupabaseUser {
  id: string;
  email: string | null;
}

/** Strict auth: Bearer token only (no fallback). */
export async function getSupabaseAuthUser(request: Request): Promise<AuthenticatedSupabaseUser | null> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!bearerToken) return null;

  const supabase = createServerClient(bearerToken);
  if (!supabase) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  return {
    id: user.id,
    email: user.email ?? null,
  };
}

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
  }

  return null;
}
