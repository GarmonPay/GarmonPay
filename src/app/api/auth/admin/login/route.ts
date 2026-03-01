import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

type AdminProfile = {
  role?: string | null;
  is_super_admin?: boolean | null;
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ message: "Email and password required" }, { status: 400 });
    }

    // IMPORTANT: this endpoint must use SUPABASE_SERVICE_ROLE_KEY (server-only).
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json(
        { message: "Server not configured. Missing SUPABASE_SERVICE_ROLE_KEY." },
        { status: 503 }
      );
    }

    // Step 1: Authenticate with Supabase Auth.
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authError || !authData.user || !authData.session) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    // Step 2: Fetch role from public.users by auth user id.
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("role, is_super_admin")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Admin login profile query error:", profileError);
      return NextResponse.json({ message: "Could not verify admin access" }, { status: 500 });
    }

    // Step 3: Require role = 'admin' to allow admin login.
    const row = profile as AdminProfile | null;
    const role = row?.role?.toLowerCase() ?? "";
    if (role !== "admin") {
      return NextResponse.json({ message: "Access denied. Admin only." }, { status: 403 });
    }

    // Step 4: Allow access.
    const expiresAt = authData.session.expires_at
      ? new Date(authData.session.expires_at * 1000).toISOString()
      : new Date(Date.now() + 60 * 60 * 1000).toISOString();

    return NextResponse.json({
      ok: true,
      user: {
        id: authData.user.id,
        email: authData.user.email ?? email,
      },
      role: "admin",
      is_super_admin: !!row?.is_super_admin,
      accessToken: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      expiresAt,
    });
  } catch (error) {
    console.error("Admin login route error:", error);
    return NextResponse.json({ message: "Login failed" }, { status: 500 });
  }
}
