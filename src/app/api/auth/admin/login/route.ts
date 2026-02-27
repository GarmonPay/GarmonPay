import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase";

function createAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ message: "Email and password required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const auth = createAuthClient();
    const admin = createAdminClient();
    if (!auth || !admin) {
      return NextResponse.json({ message: "Auth service not configured" }, { status: 503 });
    }

    const { data: signInData, error: signInError } = await auth.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInError || !signInData.user) {
      if (signInError) {
        console.error(signInError);
      }
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    const signedInEmail = signInData.user.email?.trim().toLowerCase() ?? normalizedEmail;
    const { data: adminUser, error: adminError } = await admin
      .from("users")
      .select("id, email, role, is_super_admin")
      .eq("email", signedInEmail)
      .eq("role", "admin")
      .maybeSingle();

    if (adminError) {
      console.error(adminError);
      return NextResponse.json({ message: "Failed to validate admin role" }, { status: 500 });
    }

    if (!adminUser) {
      return NextResponse.json({ message: "Access denied. Admin only." }, { status: 403 });
    }

    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(); // 8h for admin
    return NextResponse.json({
      user: { id: adminUser.id, email: adminUser.email ?? signedInEmail },
      expiresAt,
      is_super_admin: !!(adminUser as { is_super_admin?: boolean }).is_super_admin,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Login failed" }, { status: 500 });
  }
}
