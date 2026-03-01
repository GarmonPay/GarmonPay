/**
 * Admin session: Supabase Auth + server-side admin check (service role).
 * Uses secure server session endpoint to validate role and set HttpOnly cookie.
 */

import { createBrowserClient } from "@/lib/supabase";

export interface AdminSession {
  adminId: string;
  email: string;
  expiresAt: string;
  isSuperAdmin?: boolean;
  role?: string;
  accessToken?: string;
}

/** Headers for admin API calls. Authorization is the source of truth for admin identity. */
export function adminApiHeaders(session: AdminSession | null): Record<string, string> {
  if (!session) return {};
  const headers: Record<string, string> = {};
  if (session.accessToken) headers["Authorization"] = `Bearer ${session.accessToken}`;
  if (session.adminId) headers["X-Admin-Id"] = session.adminId;
  return headers;
}

function toSession(
  payload: { adminId?: string; email?: string; isSuperAdmin?: boolean; role?: string },
  token?: string | null
): AdminSession {
  return {
    adminId: payload.adminId ?? "",
    email: payload.email ?? "",
    expiresAt: "",
    isSuperAdmin: !!payload.isSuperAdmin,
    role: payload.role,
    accessToken: token ?? undefined,
  };
}

export async function getAdminSessionAsync(): Promise<AdminSession | null> {
  if (typeof window === "undefined") return null;

  const supabase = createBrowserClient();
  let token: string | null = null;
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
  }

  // Preferred: token-backed validation + secure HttpOnly session refresh.
  if (token) {
    try {
      const res = await fetch("/api/auth/admin/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        return toSession(data, token);
      }
      await fetch("/api/auth/admin/session", { method: "DELETE" }).catch(() => {});
      return null;
    } catch {
      return null;
    }
  }

  // Fallback: HttpOnly admin session cookie.
  try {
    const res = await fetch("/api/auth/admin/session");
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) return null;
    return toSession(data, token);
  } catch {
    return null;
  }
}
