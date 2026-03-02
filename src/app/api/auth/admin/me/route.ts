import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";

/**
 * GET /api/auth/admin/me
 * Verifies admin via httpOnly cookie or Bearer token.
 * Always uses SERVICE ROLE to query: select role from public.users where id = auth.uid()
 */
export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (!serviceKey) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  // Token: cookie first (httpOnly set by login), then Bearer
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

  // 1) Resolve auth.uid() from token (anon client)
  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // 2) select role from public.users where id = auth.uid() — SERVICE ROLE only
  const adminClient = createClient(url, serviceKey);
  const { data: profile, error: profileError } = await adminClient
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
