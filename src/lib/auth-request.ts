/**
 * Get authenticated user id from request.
 * Security: user identity is accepted only from validated Supabase JWT.
 * Used by API routes that require auth.
 */

import { createServerClient } from "./supabase";

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (bearerToken) return bearerToken;

  // Backward compatibility for existing admin cookie flow. Token is still validated with Supabase.
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)sb-access-token=([^;]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return null;
}

export async function getAuthUserId(request: Request): Promise<string | null> {
  const bearerToken = getBearerToken(request);
  if (!bearerToken) return null;
  const supabase = createServerClient(bearerToken);
  if (!supabase) return null;

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}
