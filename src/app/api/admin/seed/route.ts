import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createUserWithEmailPassword, findUserByEmail, listUsers, setUserRole, getUserRole } from "@/lib/auth-store";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

/**
 * One-time seed: create first admin if none exist.
 * Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD in env.
 * Requires header `x-admin-seed-secret` matching ADMIN_SEED_SECRET.
 * Disabled in production unless ADMIN_SEED_ENABLED=true.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ADMIN_SEED_ENABLED !== "true") {
    return NextResponse.json(
      { message: "Admin seed is disabled in production (set ADMIN_SEED_ENABLED=true to allow)." },
      { status: 403 }
    );
  }

  const expected = process.env.ADMIN_SEED_SECRET?.trim();
  const provided = request.headers.get("x-admin-seed-secret")?.trim();
  if (!expected || provided !== expected) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!email || !password) {
    return NextResponse.json(
      { message: "Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD to seed first admin" },
      { status: 400 }
    );
  }
  const hasAdmin = listUsers().some((u) => getUserRole(u) === "admin");
  if (hasAdmin) {
    return NextResponse.json({ message: "An admin already exists" }, { status: 409 });
  }
  const existing = findUserByEmail(email);
  if (existing) {
    setUserRole(existing.id, "admin");
    return NextResponse.json({
      message: "Existing user promoted to admin",
      user: { id: existing.id, email: existing.email },
    });
  }
  const hash = hashPassword(password);
  const user = createUserWithEmailPassword(email, hash, null, "admin");
  return NextResponse.json({ message: "Admin created", user: { id: user.id, email: user.email } });
}
