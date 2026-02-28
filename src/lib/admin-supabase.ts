/**
 * Admin session: Supabase Auth + public.users only. No localStorage.
 */

import { createBrowserClient } from "@/lib/supabase";

export interface AdminSession {
  adminId: string;
  email: string;
  expiresAt: string;
  isSuperAdmin?: boolean;
}

export async function getAdminSessionAsync(): Promise<AdminSession | null> {
  if (typeof window === "undefined") return null;
  const supabase = createBrowserClient();
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const { data: profile, error } = await supabase
    .from("users")
    .select("role, is_super_admin")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error || !profile) return null;
  const row = profile as { role?: string; is_super_admin?: boolean };
  const isAdmin = (row.role?.toLowerCase() === "admin") || !!row.is_super_admin;
  if (!isAdmin) return null;
  return {
    adminId: session.user.id,
    email: session.user.email ?? "",
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : "",
    isSuperAdmin: !!row.is_super_admin,
  };
}
