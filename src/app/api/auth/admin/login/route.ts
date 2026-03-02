import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";

const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

/**
 * POST /api/auth/admin/login
 * Authenticates via Supabase Auth, then verifies role from public.users using SERVICE ROLE.
 * Sets httpOnly secure cookie on success.
 * Query: select role from public.users where id = auth.uid()
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, message: "Supabase URL and anon key required" },
      { status: 503 }
    );
  }
  if (!serviceKey) {
    return NextResponse.json(
      { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY required for admin login" },
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

  // 2) Verify admin: select role from public.users where id = auth.uid() — SERVICE ROLE only
  const adminClient = createClient(url, serviceKey);
  const { data: profile, error: profileError } = await adminClient
    .from("users")
    .select("role, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Admin login public.users lookup error:", profileError);
    return NextResponse.json(
      { ok: false, message: "Could not verify admin role" },
      { status: 500 }
    );
  }

  const role = (profile as { role?: string } | null)?.role?.toLowerCase();
  const isSuperAdmin = !!(profile as { is_super_admin?: boolean } | null)?.is_super_admin;
  const isAdmin = role === "admin" || isSuperAdmin;

  if (!isAdmin) {
    return NextResponse.json(
      { ok: false, message: "Access denied. Your account does not have role='admin' in public.users." },
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
