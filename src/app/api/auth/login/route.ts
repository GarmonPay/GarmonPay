import { NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/auth-store";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ message: "Email and password required" }, { status: 400 });
    }
    const user = findUserByEmail(email);
    if (!user) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }
    const hash = hashPassword(password);
    if (hash !== user.passwordHash) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    let role: "member" | "admin" = "member";
    let is_super_admin = false;
    try {
      const supabase = createAdminClient();
      if (supabase) {
        const { data: row } = await supabase
          .from("users")
          .select("role, is_super_admin")
          .eq("id", user.id)
          .maybeSingle();
        if (row && (row as { role?: string }).role === "admin") {
          role = "admin";
        } else if (row && (row as { role?: string }).role) {
          role = (row as { role: "member" | "admin" }).role;
        }
        is_super_admin = !!(row as { is_super_admin?: boolean } | null)?.is_super_admin;
      }
    } catch (_) {
      // keep default member
    }
    if (role === "admin" && (user as { is_super_admin?: boolean }).is_super_admin) {
      is_super_admin = true;
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return NextResponse.json({
      user: { id: user.id, email: user.email },
      expiresAt,
      role,
      is_super_admin: role === "admin" ? is_super_admin : false,
    });
  } catch {
    return NextResponse.json({ message: "Login failed" }, { status: 500 });
  }
}
