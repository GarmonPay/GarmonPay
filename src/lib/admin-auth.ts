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

export interface AdminAuthContext {
  adminId: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
  accessToken: string;
}

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

/**
 * Returns validated admin auth context when request token belongs to a user whose
 * public.users role is admin or is_super_admin=true.
 */
export async function getAdminAuthContext(request: Request): Promise<AdminAuthContext | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;

  const userClient = createServerClient(token);
  if (!userClient) return null;

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return null;

  const adminIdHeader = request.headers.get("x-admin-id");
  if (adminIdHeader && adminIdHeader !== user.id) {
    return null;
  }

  const adminClient = createAdminClient();
  const profileClient = adminClient ?? userClient;
  const { data: profile, error: profileError } = await profileClient
    .from("users")
    .select("role, is_super_admin, email")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    if (profileError) console.error("Admin auth users query error:", profileError);
    return null;
  }

  const row = profile as { role?: string; is_super_admin?: boolean; email?: string };
  if (!hasAdminRole(row)) return null;

  return {
    adminId: user.id,
    email: user.email ?? row.email ?? "",
    role: row.role ?? "user",
    isSuperAdmin: !!row.is_super_admin,
    accessToken: token,
  };
}

/** Returns true if request has valid admin auth context. */
export async function isAdmin(request: Request): Promise<boolean> {
  return !!(await getAdminAuthContext(request));
}

/** Returns true if request is authenticated as a super admin user. */
export async function isSuperAdminRequest(request: Request): Promise<boolean> {
  const ctx = await getAdminAuthContext(request);
  return !!ctx?.isSuperAdmin;
}
