import { NextResponse } from "next/server";
import { createAdminClient, createServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ message: "Email and password required" }, { status: 400 });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ message: "Auth not configured" }, { status: 503 });
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError || !data.user || !data.session) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    const admin = createAdminClient();
    const profileClient = admin ?? supabase;
    const { data: profile } = await profileClient
      .from("users")
      .select("role, is_super_admin, is_banned")
      .eq("id", data.user.id)
      .maybeSingle();
    const row = profile as { role?: string; is_super_admin?: boolean; is_banned?: boolean } | null;
    const hasAdminAccess = (row?.role?.toLowerCase() === "admin") || !!row?.is_super_admin;
    if (!hasAdminAccess) {
      await supabase.auth.signOut().catch(() => {});
      return NextResponse.json({ message: "Access denied. Admin only." }, { status: 403 });
    }
    if (row?.is_banned) {
      await supabase.auth.signOut().catch(() => {});
      return NextResponse.json({ message: "Account is suspended." }, { status: 403 });
    }
    const expiresAt = data.session.expires_at
      ? new Date(data.session.expires_at * 1000).toISOString()
      : "";
    return NextResponse.json({
      user: { id: data.user.id, email: data.user.email ?? email.trim() },
      expiresAt,
      is_super_admin: !!row?.is_super_admin,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  } catch {
    return NextResponse.json({ message: "Login failed" }, { status: 500 });
  }
}
