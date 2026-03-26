import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";

const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

/**
 * POST /api/auth/admin/login
 * Server-side only. Authenticates via Supabase Auth, then verifies role from public.users.
 * Uses SUPABASE_SERVICE_ROLE_KEY (never NEXT_PUBLIC) when set; else token-scoped read.
 * Sets httpOnly secure cookie on success.
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (process.env.NODE_ENV !== "test") {
    console.log("Admin login env: service role loaded =", !!serviceKey, "url =", !!url, "anon =", !!anonKey);
  }

  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, message: "Supabase URL and anon key required" },
      { status: 503 }
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json(
      { ok: false, message: "Email and password required" },
      { status: 400 }
    );
  }

  // 1) Sign in with Supabase Auth (anon client)
  const authClient = createClient(url, anonKey);
  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    return NextResponse.json(
      { ok: false, message: authError.message || "Invalid login credentials" },
      { status: 401 }
    );
  }
  const user = authData?.user;
  const accessToken = authData?.session?.access_token;
  if (!user || !accessToken) {
    return NextResponse.json(
      { ok: false, message: "Invalid response from sign in" },
      { status: 401 }
    );
  }

  // 2) Verify admin: select role from public.users where id = auth.uid()
  // Prefer SERVICE ROLE; if not set, use signed-in user's token (RLS may allow own row)
  const roleClient = serviceKey
    ? createClient(url, serviceKey)
    : createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${accessToken}` } } });
  const { data: profile, error: profileError } = await roleClient
    .from("users")
    .select("role, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Admin login public.users lookup error:", profileError);
    return NextResponse.json(
      { ok: false, message: "Could not verify admin role. Check that public.users has a row for this user with role = 'admin'." },
      { status: 503 }
    );
  }

  const role = (profile as { role?: string } | null)?.role?.toLowerCase();
  const isSuperAdmin = !!(profile as { is_super_admin?: boolean } | null)?.is_super_admin;
  const isAdmin =
    isSuperAdmin ||
    role === "admin" ||
    role === "game_admin" ||
    role === "super_admin";

  if (!isAdmin) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Access denied. Your account needs role admin, game_admin, or super_admin (or is_super_admin).",
      },
      { status: 403 }
    );
  }

  // 3) Set secure httpOnly cookie
  const isSecure = process.env.NODE_ENV === "production";
  const response = NextResponse.json({
    ok: true,
    adminId: user.id,
    email: user.email ?? email,
    isSuperAdmin,
  });
  const cookieValue = `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(accessToken)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${isSecure ? "; Secure" : ""}; HttpOnly`;
  response.headers.append("Set-Cookie", cookieValue);

  return response;
}
