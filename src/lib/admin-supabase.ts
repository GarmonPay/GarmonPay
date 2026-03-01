/**
 * Admin session: Supabase Auth + server-side admin check (service role).
 * Uses cookie (sb-access-token) first so login persists after redirect; falls back to getSession().
 */

import { createBrowserClient } from "@/lib/supabase";

export interface AdminSession {
  adminId: string;
  email: string;
  expiresAt: string;
  isSuperAdmin?: boolean;
  accessToken?: string;
}

export async function getAdminSessionAsync(): Promise<AdminSession | null> {
  if (typeof window === "undefined") return null;

  const supabase = createBrowserClient();
  if (!supabase) return null;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) return null;

  try {
    const res = await fetch("/api/auth/admin/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) return null;
    return {
      adminId: data.adminId ?? "",
      email: data.email ?? "",
      expiresAt: session?.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : "",
      isSuperAdmin: !!data.isSuperAdmin,
      accessToken: token ?? undefined,
    };
  } catch {
    return null;
  }
}
