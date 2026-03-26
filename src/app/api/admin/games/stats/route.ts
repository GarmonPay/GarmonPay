import { NextResponse } from "next/server";
import { isGameAdmin } from "@/lib/admin-auth";
import { getAdminStats } from "@/lib/escape-room-db";

/** GET /api/admin/games/stats?range=daily|weekly|monthly */
export async function GET(request: Request) {
  if (!(await isGameAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const rangeParam = (url.searchParams.get("range") ?? "daily").toLowerCase();
  const range = rangeParam === "weekly" || rangeParam === "monthly" ? rangeParam : "daily";
  try {
    const stats = await getAdminStats(range);
    return NextResponse.json({ stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load stats";
    return NextResponse.json({ message }, { status: 500 });
  }
}
