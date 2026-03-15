import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/arena/security — arena anti-cheat view: high-velocity users, same-IP fighters, recent activity. */
export async function GET(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString();

  const { data: activities } = await supabase
    .from("arena_activity_log")
    .select("user_id, ip, action_type, created_at")
    .gte("created_at", sinceStr)
    .order("created_at", { ascending: false })
    .limit(500);

  const byUser = new Map<string, { count: number; lastAt: string; ips: Set<string> }>();
  const byIp = new Map<string, Set<string>>();
  for (const a of activities ?? []) {
    const u = (a as { user_id?: string }).user_id;
    const ip = (a as { ip?: string }).ip ?? "unknown";
    const at = (a as { created_at: string }).created_at;
    if (u) {
      const cur = byUser.get(u) ?? { count: 0, lastAt: at, ips: new Set<string>() };
      cur.count += 1;
      cur.lastAt = at;
      cur.ips.add(ip);
      byUser.set(u, cur);
    }
    if (ip !== "unknown") {
      const set = byIp.get(ip) ?? new Set<string>();
      if (u) set.add(u);
      byIp.set(ip, set);
    }
  }

  const velocity = Array.from(byUser.entries())
    .map(([userId, v]) => ({ userId, count: v.count, lastAt: v.lastAt, ipCount: v.ips.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  const sameIpAccounts = Array.from(byIp.entries())
    .filter(([, ids]) => ids.size > 1)
    .map(([ip, ids]) => ({ ip, userCount: ids.size, userIds: Array.from(ids) }))
    .slice(0, 30);

  return NextResponse.json({
    velocity,
    sameIpAccounts,
    recentCount: (activities ?? []).length,
  });
}
