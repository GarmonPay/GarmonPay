import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getClientIp } from "@/lib/rate-limit";

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * POST /api/auth/login-failed
 * Body: { email: string }
 * Increments failed_login_attempts; locks account after MAX_ATTEMPTS.
 */
export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: true }, { status: 200 });

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) return NextResponse.json({ ok: true }, { status: 200 });

  const ip = getClientIp(req);
  const { data: row } = await admin.from("users").select("id, failed_login_attempts, locked_until").eq("email", email).maybeSingle();
  if (!row) return NextResponse.json({ ok: true }, { status: 200 });

  const r = row as { id: string; failed_login_attempts?: number; locked_until?: string | null };
  const current = typeof r.failed_login_attempts === "number" ? r.failed_login_attempts : 0;
  const nextCount = current + 1;
  const lockedUntil = nextCount >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS).toISOString() : null;

  await admin.from("users").update({
    failed_login_attempts: nextCount,
    locked_until: lockedUntil,
  }).eq("id", r.id);

  try {
    await admin.from("security_events").insert({
      user_id: r.id,
      email,
      ip_text: ip !== "unknown" ? ip : null,
      event_type: nextCount >= MAX_ATTEMPTS ? "lockout" : "login_failed",
      metadata: { attempt: nextCount },
    });
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
