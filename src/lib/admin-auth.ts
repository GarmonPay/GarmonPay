/**
 * Admin auth: token from cookie or Bearer, then public.users lookup.
 * Uses SUPABASE_SERVICE_ROLE_KEY when set; else token-scoped read (RLS may allow own row).
 * Valid admin = role = 'admin' OR is_super_admin = true in public.users.
 */

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";

function hasAdminRole(row: { role?: string; is_super_admin?: boolean } | null | undefined): boolean {
  if (!row) return false;
  return (row.role?.toLowerCase() === "admin") || !!row.is_super_admin;
}

/** Returns true if request has valid admin. Server-side only. */
export async function isAdmin(request: Request): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) return false;

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
  if (!token) return false;

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return false;

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
    return false;
  }
  return hasAdminRole(data as { role?: string; is_super_admin?: boolean });
}
