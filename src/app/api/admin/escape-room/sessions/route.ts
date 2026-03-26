import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const fmt = searchParams.get("format");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const mode = searchParams.get("mode");
  const result = searchParams.get("result");
  const minStake = searchParams.get("min_stake_cents");
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100));

  let q = supabase
    .from("escape_room_sessions")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (dateFrom) q = q.gte("started_at", dateFrom);
  if (dateTo) q = q.lte("started_at", dateTo);
  if (mode === "free" || mode === "stake") q = q.eq("mode", mode);
  if (result && ["active", "win", "lose", "timeout", "voided"].includes(result)) q = q.eq("result", result);
  if (minStake && Number.isFinite(Number(minStake))) q = q.gte("stake_cents", Number(minStake));

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  if (fmt === "csv") {
    const headers = [
      "id",
      "player_id",
      "mode",
      "stake_cents",
      "started_at",
      "ended_at",
      "escape_time_seconds",
      "result",
      "payout_cents",
      "payout_status",
      "suspicious",
    ];
    const lines = [
      headers.join(","),
      ...rows.map((r: Record<string, unknown>) =>
        headers
          .map((h) => {
            const v = r[h];
            if (v == null) return "";
            const s = String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      ),
    ];
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="escape-sessions.csv"`,
      },
    });
  }

  return NextResponse.json({ sessions: rows });
}
