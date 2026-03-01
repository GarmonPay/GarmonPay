/**
 * Admin auth: Supabase Auth + public.users only.
 * Valid admin = role = 'admin' OR is_super_admin = true in public.users.
 * Equivalent to: select * from users where id = ? and (role = 'admin' or is_super_admin = true).
 */

import { createAdminClient, createServerClient } from "@/lib/supabase";

function hasAdminRole(row: { role?: string; is_super_admin?: boolean } | null | undefined): boolean {
  if (!row) return false;
  return (row.role?.toLowerCase() === "admin") || !!row.is_super_admin;
}

/**
 * Returns true if request has a valid admin bearer token and that token user is
 * admin/super admin in public.users.
 */
export async function isAdmin(request: Request): Promise<boolean> {
  const adminId = request.headers.get("x-admin-id");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!bearerToken) return false;

  const userClient = createServerClient(bearerToken);
  if (!userClient) return false;

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return false;
  if (adminId && adminId !== user.id) return false;

  const adminClient = createAdminClient();
  const profileClient = adminClient ?? userClient;
  const { data, error } = await profileClient
    .from("users")
    .select("role, is_super_admin, is_banned")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("Admin auth users query error:", error);
    return false;
  }

  const row = data as { role?: string; is_super_admin?: boolean; is_banned?: boolean };
  if (row.is_banned) return false;
  return hasAdminRole(row);
}
