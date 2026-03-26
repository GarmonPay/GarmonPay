import { NextResponse } from "next/server";
import { isGameAdmin } from "@/lib/admin-auth";
import { getFinancialSummary, reviewPayout } from "@/lib/escape-room-db";
import { getAdminUserIdFromRequest } from "@/lib/escape-room-api-auth";

export async function GET(req: Request) {
  if (!(await isGameAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const data = await getFinancialSummary({ from, to });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load financials";
    return NextResponse.json({ message }, { status: 500 });
  }
}

/**
 * POST /api/admin/games/financials
 * Body: { sessionId, action: "approve" | "reject", reason? }
 */
export async function POST(req: Request) {
  if (!(await isGameAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  let body: { sessionId?: string; action?: "approve" | "reject"; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) {
    return NextResponse.json({ message: "sessionId required" }, { status: 400 });
  }
  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ message: "action must be approve or reject" }, { status: 400 });
  }
  const adminId = await getAdminUserIdFromRequest(req);
  if (!adminId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const payout = await reviewPayout(
      sessionId,
      body.action,
      adminId,
      typeof body.reason === "string" ? body.reason.trim() : undefined
    );
    return NextResponse.json({ payout });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update payout";
    return NextResponse.json({ message }, { status: 500 });
  }
}
