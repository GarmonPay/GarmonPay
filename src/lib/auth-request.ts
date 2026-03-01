/**
 * Get authenticated user id from request using Supabase Auth token only.
 * Accepts Authorization Bearer token or secure auth cookies.
 */

import { createServerClient } from "./supabase";

function parseCookieValue(cookieHeader: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match ? decodeURIComponent(match[1].trim()) : null;
}

function getTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  return (
    parseCookieValue(cookieHeader, "sb-admin-token") ??
    parseCookieValue(cookieHeader, "sb-access-token")
  );
}

export async function getAuthUserId(request: Request): Promise<string | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;

  const supabase = createServerClient(token);
  if (!supabase) return null;

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}
