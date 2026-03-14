import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/security — security events, multi-IP accounts, failed logins, locked accounts. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ message: "Service unavailable", events: [], multiIpAccounts: [], failedLogins: [], lockedUsers: [] }, { status: 503 });
  }

  const [
    { data: events },
    { data: failedRows },
    { data: lockedUsers },
  ] = await Promise.all([
    admin.from("security_events").select("id, user_id, email, ip_text, event_type, metadata, created_at").order("created_at", { ascending: false }).limit(200),
    admin.from("security_events").select("id, user_id, email, ip_text, event_type, created_at").in("event_type", ["login_failed", "lockout"]).order("created_at", { ascending: false }).limit(100),
    admin.from("users").select("id, email, failed_login_attempts, locked_until").not("locked_until", "is", null).limit(50),
  ]);

  let multiIpAccounts: { registration_ip: string; count: number; user_ids: string[] }[] = [];
  try {
    const { data: users } = await admin.from("users").select("id, registration_ip").not("registration_ip", "is", null);
    const byIp = new Map<string, string[]>();
    for (const u of users ?? []) {
      const ip = (u as { registration_ip: string }).registration_ip;
      if (!ip) continue;
      const list = byIp.get(ip) ?? [];
      list.push((u as { id: string }).id);
      byIp.set(ip, list);
    }
    multiIpAccounts = Array.from(byIp.entries())
      .filter(([, ids]) => ids.length > 1)
      .map(([registration_ip, user_ids]) => ({ registration_ip, count: user_ids.length, user_ids }));
  } catch {
    // ignore
  }

  return NextResponse.json({
    events: events ?? [],
    multiIpAccounts,
    failedLogins: failedRows ?? [],
    lockedUsers: lockedUsers ?? [],
  });
}
