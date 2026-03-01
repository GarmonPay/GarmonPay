import { NextResponse } from "next/server";
import { createAdminClient, createServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ message: "Email and password required" }, { status: 400 });
    }

    const client = createServerClient();
    if (!client) {
      return NextResponse.json({ message: "Auth not configured" }, { status: 503 });
    }

    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError || !signIn.user || !signIn.session) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    let role = "member";
    let is_super_admin = false;
    try {
      const adminClient = createAdminClient() ?? createServerClient(signIn.session.access_token);
      if (adminClient) {
        const { data: row } = await adminClient
          .from("users")
          .select("role, is_super_admin")
          .eq("id", signIn.user.id)
          .maybeSingle();
        if (row && (row as { role?: string }).role) role = (row as { role: string }).role;
        is_super_admin = !!(row as { is_super_admin?: boolean } | null)?.is_super_admin;
      }
    } catch (_) {
      // keep default member
    }

    const expiresAt = signIn.session.expires_at
      ? new Date(signIn.session.expires_at * 1000).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return NextResponse.json({
      user: { id: signIn.user.id, email: signIn.user.email ?? email.trim() },
      expiresAt,
      role,
      is_super_admin: is_super_admin,
      accessToken: signIn.session.access_token,
    });
  } catch {
    return NextResponse.json({ message: "Login failed" }, { status: 500 });
  }
}
