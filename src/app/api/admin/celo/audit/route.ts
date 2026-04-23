import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { auditCeloRoomRounds } from "@/lib/celo-accounting-audit";

/**
 * GET /api/admin/celo/audit?roomId=<uuid>&roundId=<optional>&limit=<n>
 * Admin-only read-only C-Lo accounting trace for staging verification.
 */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { message: "Server not configured (missing service role)" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const roomId = String(url.searchParams.get("roomId") ?? "").trim();
  const roundId = url.searchParams.get("roundId")?.trim() || undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.min(50, Math.max(1, parseInt(limitRaw, 10) || 8)) : undefined;

  if (!roomId) {
    return NextResponse.json({ message: "roomId query parameter required" }, { status: 400 });
  }

  try {
    const result = await auditCeloRoomRounds(admin, roomId, {
      roundId,
      limit: limit ?? 8,
    });
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      ...result,
    });
  } catch (e) {
    console.error("[admin celo audit]", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Audit failed" },
      { status: 500 }
    );
  }
}
