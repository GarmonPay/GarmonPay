/**
 * Admin session handling. Separate from member session.
 * Only admins get this session after /api/auth/admin/login.
 */

const ADMIN_SESSION_KEY = "garmonpay_admin_session";

export interface AdminSession {
  adminId: string;
  email: string;
  expiresAt: string;
  isSuperAdmin?: boolean;
  accessToken?: string;
}

export function getAdminSession(): AdminSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as AdminSession;
    if (new Date(data.expiresAt) <= new Date()) {
      clearAdminSession();
      return null;
    }
    if (!data.accessToken) {
      clearAdminSession();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function setAdminSession(session: AdminSession): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearAdminSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function getAdminRequestHeaders(session: AdminSession | null): Record<string, string> {
  if (!session?.accessToken) return {};
  return { Authorization: `Bearer ${session.accessToken}` };
}
