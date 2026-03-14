import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * POST /api/auth/check-lock
 * Body: { email: string }
 * Returns { locked: boolean, lockedUntil?: string } so client can block login attempt.
 */
export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ locked: false }, { status: 200 });
  }
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ locked: false }, { status: 200 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) return NextResponse.json({ locked: false }, { status: 200 });

  const { data: row } = await admin
    .from("users")
    .select("id, locked_until")
    .eq("email", email)
    .maybeSingle();

  if (!row) return NextResponse.json({ locked: false }, { status: 200 });
  const lockedUntil = (row as { locked_until?: string | null }).locked_until;
  if (!lockedUntil) return NextResponse.json({ locked: false }, { status: 200 });
  const until = new Date(lockedUntil).getTime();
  if (until <= Date.now()) {
    await admin.from("users").update({ locked_until: null, failed_login_attempts: 0 }).eq("id", (row as { id: string }).id);
    return NextResponse.json({ locked: false }, { status: 200 });
  }
  return NextResponse.json({ locked: true, lockedUntil: lockedUntil }, { status: 200 });
}
