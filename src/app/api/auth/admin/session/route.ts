import { NextResponse } from "next/server";
import { getAdminAuthContext } from "@/lib/admin-auth";

const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours

function withAdminCookies(response: NextResponse, token: string) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("sb-admin-token", token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
  // Legacy compatibility for older middleware/layout checks.
  response.cookies.set("sb-access-token", token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
}

function clearAdminCookies(response: NextResponse) {
  response.cookies.set("sb-admin-token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set("sb-access-token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * POST /api/auth/admin/session
 * Validates current token as admin and sets secure admin session cookies.
 */
export async function POST(request: Request) {
  const ctx = await getAdminAuthContext(request);
  if (!ctx) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true,
    adminId: ctx.adminId,
    email: ctx.email,
    isSuperAdmin: ctx.isSuperAdmin,
    role: ctx.role,
  });
  withAdminCookies(response, ctx.accessToken);
  return response;
}

/**
 * GET /api/auth/admin/session
 * Returns active admin session (cookie or bearer-backed).
 */
export async function GET(request: Request) {
  const ctx = await getAdminAuthContext(request);
  if (!ctx) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const response = NextResponse.json({
    ok: true,
    adminId: ctx.adminId,
    email: ctx.email,
    isSuperAdmin: ctx.isSuperAdmin,
    role: ctx.role,
  });
  withAdminCookies(response, ctx.accessToken);
  return response;
}

/**
 * DELETE /api/auth/admin/session
 * Clears admin session cookies.
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAdminCookies(response);
  return response;
}
