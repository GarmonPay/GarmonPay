import { NextResponse } from "next/server";
import { processAllDueReferralCommissions } from "@/lib/referral-commissions-db";

/**
 * POST /api/cron/process-referral-commissions
 * Run monthly: process all due subscription billings and pay referral commissions.
 * Secure with CRON_SECRET header so only your scheduler (e.g. Vercel Cron) can call.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processAllDueReferralCommissions();
    return NextResponse.json(result);
  } catch (e) {
    console.error("Process referral commissions error:", e);
    return NextResponse.json({ message: "Processing failed", error: String(e) }, { status: 500 });
  }
}
