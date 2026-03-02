/**
 * Admin session: verified via server endpoint only (GET /api/auth/admin/me).
 * Cookie sb-admin-token is httpOnly so client does not read it; browser sends it with credentials: 'include'.
 */

export interface AdminSession {
  adminId: string;
  email: string;
  expiresAt: string;
  isSuperAdmin?: boolean;
  accessToken?: string;
}

/** Headers for admin API calls. Cookie is sent automatically with same-origin fetch; X-Admin-Id helps logging. */
export function adminApiHeaders(session: AdminSession | null): Record<string, string> {
  if (!session) return {};
  return { "X-Admin-Id": session.adminId };
}

/**
 * Get current admin session from server. Uses httpOnly cookie (credentials: 'include').
 * Server verifies via SERVICE ROLE: select role from public.users where id = auth.uid()
 */
export async function getAdminSessionAsync(): Promise<AdminSession | null> {
  if (typeof window === "undefined") return null;

  try {
    const res = await fetch("/api/auth/admin/me", { credentials: "include" });
    const data = await res.json();
    if (!res.ok || !data?.ok) return null;
    return {
      adminId: data.adminId ?? "",
      email: data.email ?? "",
      expiresAt: data.expiresAt ?? "",
      isSuperAdmin: !!data.isSuperAdmin,
    };
  } catch {
    return null;
  }
}
