import type { AdminSession } from "@/lib/admin-supabase";

/**
 * Build admin auth headers for API requests.
 * Always sends both admin id and bearer token when available.
 */
export function buildAdminAuthHeaders(
  session: AdminSession,
  extra?: Record<string, string>
): Record<string, string> {
  return {
    "X-Admin-Id": session.adminId,
    ...(session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    ...(extra ?? {}),
  };
}
