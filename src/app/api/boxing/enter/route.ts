import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { enterMatch } from "@/lib/boxing-db";

export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let body: { entryFeeCents?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const entryFeeCents = typeof body.entryFeeCents === "number" && body.entryFeeCents >= 100
    ? body.entryFeeCents
    : 100;
  const result = await enterMatch(userId, entryFeeCents);
  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }
  return NextResponse.json({
    match: result.match,
    outcome: result.outcome,
  });
}
