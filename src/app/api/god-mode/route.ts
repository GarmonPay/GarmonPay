import { NextResponse } from "next/server";
import { getGodModeStats, getOwnerFlags, getPlatformProfitCents } from "@/lib/god-mode-db";
import { requireSuperAdminAccess } from "@/lib/admin-auth";

/** GET /api/god-mode — platform stats + activity. Only super admin. */
export async function GET(request: Request) {
  const access = await requireSuperAdminAccess(request);
  if (!access.ok) {
    return access.response;
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
