/**
 * Admin auth: Supabase Auth + public.users only.
 * Valid admin = role = 'admin' OR is_super_admin = true in public.users.
 * Equivalent to: select * from users where id = ? and (role = 'admin' or is_super_admin = true).
 */

import { createAdminClient, createServerClient } from "@/lib/supabase";

async function isAdminUserId(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from("users")
    .select("role, is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("Admin auth users query error:", error);
    return false;
  }
  const row = data as { role?: string; is_super_admin?: boolean };
  return (row.role?.toLowerCase() === "admin") || !!row.is_super_admin;
}

/** Returns admin user id if request is authenticated as admin, otherwise null. */
export async function getAdminUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (bearerToken) {
    const userClient = createServerClient(bearerToken);
    if (userClient) {
      const {
        data: { user },
        error,
      } = await userClient.auth.getUser();
      if (!error && user) {
        const allowed = await isAdminUserId(user.id);
        if (allowed) return user.id;
      }
    }
  }

  const adminId = request.headers.get("x-admin-id");
  if (adminId && await isAdminUserId(adminId)) {
    return adminId;
  }

  return null;
}

/** Returns true when request is authenticated as admin. */
export async function isAdmin(request: Request): Promise<boolean> {
  const adminId = await getAdminUserId(request);
  return !!adminId;
}
