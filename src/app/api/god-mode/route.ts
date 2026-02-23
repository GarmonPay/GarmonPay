import { NextResponse } from "next/server";
import { findUserById, isSuperAdmin } from "@/lib/auth-store";
import { createAdminClient } from "@/lib/supabase";
import { getGodModeStats, getOwnerFlags, getPlatformProfitCents } from "@/lib/god-mode-db";

async function isSuperAdminRequest(request: Request): Promise<boolean> {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return false;
  const user = findUserById(adminId);
  if (user && isSuperAdmin(user)) return true;
  const supabase = createAdminClient();
  if (supabase) {
    const { data } = await supabase.from("users").select("is_super_admin").eq("id", adminId).maybeSingle();
    if ((data as { is_super_admin?: boolean } | null)?.is_super_admin) return true;
  }
  return false;
}

/** GET /api/god-mode — platform stats + activity. Only super admin. */
export async function GET(request: Request) {
  if (!(await isSuperAdminRequest(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    const [stats, flags] = await Promise.all([getGodModeStats(), getOwnerFlags()]);
    const totalPlatformProfitCents = getPlatformProfitCents(stats);
    return NextResponse.json({
      stats: {
        ...stats,
        totalPlatformProfitCents,
      },
      flags,
    });
  } catch (e) {
    console.error("God-mode stats error:", e);
    return NextResponse.json({ message: "Failed to load" }, { status: 500 });
  }
}
