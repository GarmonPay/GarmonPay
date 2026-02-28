import { createClient } from "@supabase/supabase-js";

/**
 * Verify that a user ID has admin access (role = 'admin' or is_super_admin = true).
 * Use with SUPABASE_SERVICE_ROLE_KEY for server-side admin checks.
 */
export async function verifyAdmin(userId: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("users")
    .select("role, is_super_admin")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return false;

  const row = data as { role?: string; is_super_admin?: boolean };
  if (row.role?.toLowerCase() === "admin") return true;
  if (row.is_super_admin === true) return true;

  return false;
}
