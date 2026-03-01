import { NextResponse } from "next/server";
import { verifyAdminAccess } from "@/lib/admin-verify";

/**
 * GET /api/auth/admin/me
 * Verifies current user (via Bearer token) has role = 'admin' or is_super_admin in public.users.
 * Uses service role when available; falls back to token-scoped lookup for current user.
 * Allows admin dashboard access for role=admin users.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const result = await verifyAdminAccess(bearerToken);
  if (!result.isAuthenticated || !result.userId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!result.isAdmin) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    adminId: result.userId,
    email: result.email ?? "",
    isSuperAdmin: result.isSuperAdmin,
  });
}
