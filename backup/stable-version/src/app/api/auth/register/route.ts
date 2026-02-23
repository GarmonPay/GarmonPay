import { NextResponse } from "next/server";
import { createUserWithEmailPassword, findUserByEmail, generateReferralCode } from "@/lib/auth-store";
import { createHash } from "crypto";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, referralCode } = body as { email?: string; password?: string; referralCode?: string };
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ message: "Email and password required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ message: "Password must be at least 8 characters" }, { status: 400 });
    }
    const existing = findUserByEmail(email);
    if (existing) {
      return NextResponse.json({ message: "Email already registered" }, { status: 409 });
    }
    const passwordHash = hashPassword(password);
    const user = createUserWithEmailPassword(email, passwordHash, referralCode ?? null);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return NextResponse.json({
      user: { id: user.id, email: user.email },
      expiresAt,
    });
  } catch {
    return NextResponse.json({ message: "Registration failed" }, { status: 500 });
  }
}
