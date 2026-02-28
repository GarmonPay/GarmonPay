/**
 * Admin auth: Supabase Auth + public.users only.
 * Valid admin = role = 'admin' OR is_super_admin = true in public.users.
 * Equivalent to: select * from users where id = ? and (role = 'admin' or is_super_admin = true).
 */

import { createAdminClient } from "@/lib/supabase";

/** Returns true if request has valid admin: X-Admin-Id matches a user in public.users with role = 'admin' or is_super_admin = true. */
export async function isAdmin(request: Request): Promise<boolean> {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return false;

  const supabase = createAdminClient();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("users")
    .select("role, is_super_admin")
    .eq("id", adminId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("Admin auth users query error:", error);
    return false;
  }
  const row = data as { role?: string; is_super_admin?: boolean };
  return (row.role?.toLowerCase() === "admin") || !!row.is_super_admin;
}
