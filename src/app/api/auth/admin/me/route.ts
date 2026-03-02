import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";

/**
 * GET /api/auth/admin/me
 * Server-side only. Verifies admin via cookie or Bearer.
 * Uses SUPABASE_SERVICE_ROLE_KEY when set; else token-scoped read of public.users.
 */
export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

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
  if (!token) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const roleClient = serviceKey
    ? createClient(url, serviceKey)
    : authClient;
  const { data: profile, error: profileError } = await roleClient
    .from("users")
    .select("role, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const row = profile as { role?: string; is_super_admin?: boolean };
  const isAdminUser = (row.role?.toLowerCase() === "admin") || !!row.is_super_admin;
  if (!isAdminUser) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    adminId: user.id,
    email: user.email ?? "",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    isSuperAdmin: !!row.is_super_admin,
  });
}
