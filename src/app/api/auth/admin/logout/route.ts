import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";

/**
 * POST /api/auth/admin/logout
 * Clears the httpOnly admin cookie so next request is unauthenticated.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  const isSecure = process.env.NODE_ENV === "production";
  response.headers.append(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly${isSecure ? "; Secure" : ""}`
  );
  return response;
}
