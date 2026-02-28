import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client with SERVICE ROLE KEY.
 * Bypasses RLS — use only for admin checks and server operations.
 */
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Returns true if the user has admin access (role = 'admin' or is_super_admin = true).
 * Uses service role so RLS cannot block.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = getAdminClient();
  if (!supabase) return false;
  const { data } = await supabase
    .from("users")
    .select("role, is_super_admin")
    .eq("id", userId)
    .single();
  if (!data) return false;
  const row = data as { role?: string; is_super_admin?: boolean };
  return (row.role?.toLowerCase() === "admin") || !!row.is_super_admin;
}
