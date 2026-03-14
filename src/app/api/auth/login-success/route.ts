import { NextResponse } from "next/server";
import { createAdminClient, createServerClient } from "@/lib/supabase";
import { getClientIp } from "@/lib/rate-limit";
import { sendNewLoginAlert } from "@/lib/send-email";

/**
 * POST /api/auth/login-success
 * Requires Authorization: Bearer <access_token>
 * Updates last_login_ip, last_login_at, clears failed_login_attempts.
 * Sends "new login" email if IP changed (when RESEND_API_KEY is set).
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });

  const supabase = createServerClient(token);
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: true }, { status: 200 });

  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;

  const { data: row } = await admin.from("users").select("id, email, last_login_ip").eq("id", user.id).maybeSingle();
  if (!row) return NextResponse.json({ ok: true }, { status: 200 });

  const r = row as { id: string; email?: string | null; last_login_ip?: string | null };
  const previousIp = r.last_login_ip ?? null;
  const isNewDevice = previousIp !== null && previousIp !== ip;

  await admin.from("users").update({
    last_login_ip: ip !== "unknown" ? ip : previousIp,
    last_login_at: new Date().toISOString(),
    failed_login_attempts: 0,
    locked_until: null,
  }).eq("id", r.id);

  try {
    await admin.from("security_events").insert({
      user_id: r.id,
      email: r.email ?? undefined,
      ip_text: ip !== "unknown" ? ip : null,
      event_type: "login_success",
      metadata: { new_device: isNewDevice },
    });
  } catch {
    // best-effort
  }

  if (isNewDevice && r.email) {
    await sendNewLoginAlert({ to: r.email, ip, userAgent });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
