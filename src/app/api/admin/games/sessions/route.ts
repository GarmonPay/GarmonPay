import { NextResponse } from "next/server";
import { isGameAdmin } from "@/lib/admin-auth";
import { listPlayers, listSessions, reviewPayout } from "@/lib/escape-room-db";
import { getAdminUserIdFromRequest } from "@/lib/escape-room-api-auth";

function csvEscape(value: string): string {
  const needsQuotes = /[",\n]/.test(value);
  const escaped = value.replace(/"/g, "\"\"");
  return needsQuotes ? `"${escaped}"` : escaped;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const headerLine = headers.map(csvEscape).join(",");
  const lines = rows.map((row) =>
    headers.map((key) => csvEscape(String(row[key] ?? ""))).join(",")
  );
  return [headerLine, ...lines].join("\n");
}

/** GET /api/admin/games/sessions */
export async function GET(req: Request) {
  if (!(await isGameAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") ?? "all") as
    | "free"
    | "stake"
    | "all";
  const result = (url.searchParams.get("result") ?? "all") as
    | "active"
    | "win"
    | "lose"
    | "timeout"
    | "voided"
    | "all";
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const minStake = url.searchParams.get("minStake");
  const maxStake = url.searchParams.get("maxStake");
  const exportFormat = url.searchParams.get("export");
  const view = (url.searchParams.get("view") ?? "sessions").toLowerCase();

  if (view === "players") {
    try {
      const players = await listPlayers(1000);
      return NextResponse.json({ players });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch players";
      return NextResponse.json({ message }, { status: 500 });
    }
  }

  try {
    const sessions = await listSessions({
      mode,
      result,
      from,
      to,
      minStakeCents: minStake != null ? Number(minStake) : undefined,
      maxStakeCents: maxStake != null ? Number(maxStake) : undefined,
      limit: 1000,
      offset: 0,
    });
    if (exportFormat === "csv") {
      const rows = sessions.map((s) => ({
        session_id: s.id,
        player_id: s.player_id,
        mode: s.mode,
        stake_cents: s.stake_cents,
        start_time: s.started_at,
        end_time: s.ended_at ?? "",
        escape_time_seconds: s.escape_time_seconds ?? "",
        result: s.result,
        payout_cents: s.payout_cents,
      }));
      const csv = toCsv(rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=escape-room-sessions.csv",
        },
      });
    }
    return NextResponse.json({ sessions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch sessions";
    return NextResponse.json({ message }, { status: 500 });
  }
}

/** POST /api/admin/games/sessions */
export async function POST(req: Request) {
  if (!(await isGameAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const actor = await getAdminUserIdFromRequest(req);
  if (!actor) {
    return NextResponse.json(
      { message: "Unauthorized admin actor" },
      { status: 401 }
    );
  }
  let body: { sessionId?: string; action?: "approve_payout" | "reject_payout"; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return NextResponse.json({ message: "sessionId required" }, { status: 400 });
  }
  if (body.action !== "approve_payout" && body.action !== "reject_payout") {
    return NextResponse.json({ message: "Invalid action" }, { status: 400 });
  }
  try {
    const payout = await reviewPayout(
      sessionId,
      body.action === "approve_payout" ? "approve" : "reject",
      actor,
      body.reason?.trim()
    );
    return NextResponse.json({ success: true, payout });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to review payout";
    return NextResponse.json({ message }, { status: 500 });
  }
}
