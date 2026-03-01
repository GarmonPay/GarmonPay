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

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.user || !data.session) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    const userId = data.user.id;
    const admin = createAdminClient();
    const profileClient = admin ?? supabase;
    let role = "member";
    let isSuperAdmin = false;
    let isBanned = false;
    try {
      const { data: row } = await profileClient
        .from("users")
        .select("role, is_super_admin, is_banned")
        .eq("id", userId)
        .maybeSingle();
      if (row && (row as { role?: string }).role) {
        role = String((row as { role: string }).role);
      }
      isSuperAdmin = !!(row as { is_super_admin?: boolean } | null)?.is_super_admin;
      isBanned = !!(row as { is_banned?: boolean } | null)?.is_banned;
    } catch (_) {
      // keep defaults
    }

    if (isBanned) {
      await supabase.auth.signOut().catch(() => {});
      return NextResponse.json({ message: "Account is suspended" }, { status: 403 });
    }

    // Ensure user row exists for downstream wallet/admin features.
    if (admin) {
      const { error: upsertError } = await admin
        .from("users")
        .upsert(
          {
            id: userId,
            email: data.user.email ?? email.trim(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      if (upsertError) {
        console.warn("Auth login users upsert warning:", upsertError.message);
      }
    }

    const expiresAt = data.session.expires_at
      ? new Date(data.session.expires_at * 1000).toISOString()
      : "";
    return NextResponse.json({
      user: { id: userId, email: data.user.email ?? email.trim() },
      expiresAt,
      role,
      is_super_admin: role === "admin" ? isSuperAdmin : false,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  } catch {
    return NextResponse.json({ message: "Login failed" }, { status: 500 });
  }
}
