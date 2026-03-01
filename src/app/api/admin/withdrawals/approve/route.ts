import { NextResponse } from "next/server";
import { PATCH as patchWithdrawal } from "@/app/api/admin/withdrawals/route";

/**
 * Legacy compatibility endpoint.
 * Internally forwards to PATCH /api/admin/withdrawals with status=approved.
 */
export async function POST(req: Request) {
  let body: { withdrawalId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const withdrawalId = typeof body.withdrawalId === "string" ? body.withdrawalId : "";
  if (!withdrawalId) {
    return NextResponse.json({ message: "withdrawalId required" }, { status: 400 });
  }

  const forwarded = new Request(req.url, {
    method: "PATCH",
    headers: req.headers,
    body: JSON.stringify({ id: withdrawalId, status: "approved" }),
  });
  return patchWithdrawal(forwarded);
}
