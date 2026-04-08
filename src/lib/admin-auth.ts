/**
 * Admin auth: token from cookie or Bearer, then public.users lookup.
 * Uses SUPABASE_SERVICE_ROLE_KEY when set; else token-scoped read (RLS may allow own row).
 * Valid admin = role in admin, game_admin, super_admin OR is_super_admin.
 */

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";

function hasAdminRole(row: { role?: string; is_super_admin?: boolean } | null | undefined): boolean {
  if (!row) return false;
  if (!!row.is_super_admin) return true;
  const r = row.role?.toLowerCase() ?? "";
  return r === "admin" || r === "game_admin" || r === "super_admin";
}

/** Resolves Supabase auth user id when the user has an admin role; else null. */
export async function getAdminAuthUserId(request: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) return null;

  let token: string | null = null;
  try {
    const cookieStore = await cookies();
    token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? null;
  } catch {
    // ignore
  }
  if (!token) {
    const authHeader = request.headers.get("authorization");
    token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  }
  if (!token) return null;

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return null;

  const roleClient = serviceKey
    ? createClient(url, serviceKey)
    : authClient;
  const { data, error } = await roleClient
    .from("users")
    .select("role, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("Admin auth users query error:", error);
    return null;
  }
  if (!hasAdminRole(data as { role?: string; is_super_admin?: boolean })) return null;
  return user.id;
}

/** Returns true if request has valid admin. Server-side only. */
export async function isAdmin(request: Request): Promise<boolean> {
  return (await getAdminAuthUserId(request)) !== null;
}
