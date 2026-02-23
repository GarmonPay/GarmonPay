import { NextResponse } from "next/server";
import { findUserByEmail, getUserRole, hasAdminAccess, isSuperAdmin } from "@/lib/auth-store";
import { createHash } from "crypto";

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
    if (!hasAdminAccess(user)) {
      return NextResponse.json({ message: "Access denied. Admin only." }, { status: 403 });
    }
    const hash = hashPassword(password);
    if (hash !== user.passwordHash) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(); // 8h for admin
    return NextResponse.json({
      user: { id: user.id, email: user.email },
      expiresAt,
      is_super_admin: isSuperAdmin(user),
    });
  } catch {
    return NextResponse.json({ message: "Login failed" }, { status: 500 });
  }
}
