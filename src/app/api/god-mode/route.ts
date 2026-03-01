import { NextResponse } from "next/server";
import { isSuperAdminRequest } from "@/lib/admin-auth";
import { getGodModeStats, getOwnerFlags, getPlatformProfitCents } from "@/lib/god-mode-db";

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
