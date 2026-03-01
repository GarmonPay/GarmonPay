import { NextResponse } from "next/server";
import { verifyAdminAccess } from "@/lib/admin-verify";

/**
 * GET /api/admin/verify
 * Server-side admin verification for protected admin routes/layouts.
 * Response shape must remain: { isAdmin: boolean }.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const result = await verifyAdminAccess(bearerToken);
  if (!result.isAuthenticated) {
    return NextResponse.json({ isAdmin: false }, { status: 401 });
  }

  return NextResponse.json({ isAdmin: result.isAdmin });
}
