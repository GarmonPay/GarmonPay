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

/** Headers for admin API calls. Include Bearer when available so isAdmin() works without service role key. */
export function adminApiHeaders(session: AdminSession | null): Record<string, string> {
  if (!session) return {};
  const headers: Record<string, string> = { "X-Admin-Id": session.adminId };
  if (session.accessToken) headers["Authorization"] = `Bearer ${session.accessToken}`;
  return headers;
}

function getAccessTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/sb-access-token=([^;]+)/);
  return match ? decodeURIComponent(match[1].trim()) : null;
}

export async function getAdminSessionAsync(): Promise<AdminSession | null> {
  if (typeof window === "undefined") return null;

  const supabase = createBrowserClient();
  if (!supabase) return null;

  // Prefer cookie set by admin login so session survives full-page redirect
  let token = getAccessTokenFromCookie();
  if (!token) {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
  }
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
      expiresAt: data.expiresAt ?? "",
      isSuperAdmin: !!data.isSuperAdmin,
      accessToken: token ?? undefined,
    };
  } catch {
    return null;
  }
}
