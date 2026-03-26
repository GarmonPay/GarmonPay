import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";

function isUuid(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

/**
 * Resolve admin user id from request context.
 * Priority: X-Admin-Id header (if UUID) -> admin cookie token -> Bearer token.
 */
export async function getAdminUserIdFromRequest(
  request: Request
): Promise<string | null> {
  const headerAdminId = request.headers.get("x-admin-id");
  if (isUuid(headerAdminId)) return headerAdminId;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  let token: string | null = null;
  try {
    const cookieStore = await cookies();
    token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? null;
  } catch {
    // ignore
  }
  if (!token) {
    const authHeader = request.headers.get("authorization");
    token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  }
  if (!token) return null;

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();
  if (error || !user?.id) return null;
  return user.id;
}

// Backward-compatible alias used by some admin routes.
export const getAdminIdFromRequest = getAdminUserIdFromRequest;
