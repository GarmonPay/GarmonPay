import { NextResponse } from "next/server";
import { isGameAdmin } from "@/lib/admin-auth";
import { getSessionReplayMetadata } from "@/lib/escape-room-db";

/** GET /api/admin/games/replay?sessionId=... */
export async function GET(request: Request) {
  if (!(await isGameAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ message: "sessionId is required" }, { status: 400 });
  }
  try {
    const data = await getSessionReplayMetadata(sessionId);
    const exportFormat = (searchParams.get("export") ?? "").toLowerCase();
    if (exportFormat === "csv") {
      const lines = ["id,event_type,server_time,payload_json"];
      for (const row of data.timerLogs) {
        const payload = JSON.stringify(row.payload ?? {}).replace(/"/g, '""');
        lines.push(
          `${row.id},"${String(row.event_type).replace(/"/g, '""')}","${String(
            row.server_time
          ).replace(/"/g, '""')}","${payload}"`
        );
      }
      return new NextResponse(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=escape-replay-${sessionId}.csv`,
        },
      });
    }
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load replay metadata";
    return NextResponse.json({ message }, { status: 500 });
  }
}
