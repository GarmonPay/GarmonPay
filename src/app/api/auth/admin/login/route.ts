import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
      return NextResponse.json({ message: "Supabase is not configured" }, { status: 503 });
    }

    const supabase = createClient(url, anonKey);
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError || !authData.user) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    const { data: adminUser, error: adminError } = await supabase
      .from("users")
      .select("*")
      .eq("email", authData.user.email ?? "")
      .eq("role", "admin")
      .maybeSingle();

    if (adminError || !adminUser) {
      await supabase.auth.signOut();
      return NextResponse.json({ message: "Access denied. Admin only." }, { status: 403 });
    }

    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(); // 8h for admin
    return NextResponse.json({
      user: { id: authData.user.id, email: authData.user.email ?? email.trim() },
      expiresAt,
      is_super_admin: !!(adminUser as { is_super_admin?: boolean }).is_super_admin,
    });
  } catch {
    return NextResponse.json({ message: "Login failed" }, { status: 500 });
  }
}
