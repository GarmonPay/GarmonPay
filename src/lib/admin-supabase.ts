/**
 * Admin session: Supabase Auth + server-side admin check (service role).
 * Ensures role = 'admin' or is_super_admin can access admin even when RLS blocks client reads.
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
  if (!session?.user?.id || !session.access_token) return null;
  try {
    const res = await fetch("/api/auth/admin/me", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) return null;
    return {
      adminId: data.adminId ?? session.user.id,
      email: data.email ?? session.user.email ?? "",
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : "",
      isSuperAdmin: !!data.isSuperAdmin,
    };
  } catch {
    return null;
  }
}
