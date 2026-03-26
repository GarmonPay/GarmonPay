import { NextResponse } from "next/server";
import { isGameAdmin } from "@/lib/admin-auth";
import { reviewFlag, listFlags } from "@/lib/escape-room-db";
import { getAdminUserIdFromRequest } from "@/lib/escape-room-api-auth";

/** GET /api/admin/games/flags?status=pending|legit|cheated|voided */
export async function GET(req: Request) {
  if (!(await isGameAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const status =
    statusParam === "pending" ||
    statusParam === "legit" ||
    statusParam === "cheated" ||
    statusParam === "voided"
      ? statusParam
      : undefined;
  try {
    const flags = await listFlags(status);
    return NextResponse.json({ flags });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load flags";
    return NextResponse.json({ message }, { status: 500 });
  }
}

/** PATCH /api/admin/games/flags { flagId, verdict, notes? } */
export async function PATCH(req: Request) {
  if (!(await isGameAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  let body: { flagId?: string; verdict?: "legit" | "cheated" | "voided"; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  if (!body.flagId || !body.verdict) {
    return NextResponse.json({ message: "flagId and verdict are required" }, { status: 400 });
  }
  const adminId = await getAdminUserIdFromRequest(req);
  if (!adminId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const flag = await reviewFlag(
      body.flagId,
      body.verdict,
      typeof body.notes === "string" ? body.notes.trim() || null : null,
      adminId
    );
    return NextResponse.json({ success: true, flag });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to review flag";
    return NextResponse.json({ message }, { status: 400 });
  }
}
