import { NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase";

/**
 * GET /api/auth/admin/me
 * Verifies current user (via Bearer token) has role = 'admin' or is_super_admin in public.users.
 * Uses service role so RLS cannot block. Allows admin dashboard access for role=admin users.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!bearerToken) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const supabase = createServerClient(bearerToken);
  if (!supabase) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("role, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const row = profile as { role?: string; is_super_admin?: boolean };
  const isAdmin = (row.role?.toLowerCase() === "admin") || !!row.is_super_admin;
  if (!isAdmin) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  return NextResponse.json({
    ok: true,
    adminId: user.id,
    email: user.email ?? "",
    isSuperAdmin: !!row.is_super_admin,
  });
}
