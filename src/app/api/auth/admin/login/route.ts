import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ message: "Email and password required" }, { status: 400 });
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ message: "Authentication is not configured" }, { status: 503 });
    }

    const authClient = createClient(url, anonKey);
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError || !authData.user || !authData.session) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
    }

    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("role, is_super_admin")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError || !profile) {
      return NextResponse.json({ message: "Access denied. Admin only." }, { status: 403 });
    }

    const role = String((profile as { role?: string }).role ?? "member");
    const isSuper = Boolean((profile as { is_super_admin?: boolean }).is_super_admin);
    if (role !== "admin" && !isSuper) {
      return NextResponse.json({ message: "Access denied. Admin only." }, { status: 403 });
    }

    const expiresAt = authData.session.expires_at
      ? new Date(authData.session.expires_at * 1000).toISOString()
      : new Date(Date.now() + 60 * 60 * 1000).toISOString();

    return NextResponse.json({
      user: { id: authData.user.id, email: authData.user.email ?? email.trim() },
      expiresAt,
      accessToken: authData.session.access_token,
      is_super_admin: isSuper,
    });
  } catch {
    return NextResponse.json({ message: "Login failed" }, { status: 500 });
  }
}
