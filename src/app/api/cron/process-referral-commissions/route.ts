import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { processAllDueReferralCommissions } from "@/lib/referral-commissions-db";

/**
 * POST /api/cron/process-referral-commissions
 * Run monthly: process all due subscription billings and pay referral commissions.
 * Secure with CRON_SECRET: set header X-Cron-Secret or Authorization: Bearer <CRON_SECRET>.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = (request.headers.get("x-cron-secret") ?? (authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "")).trim();
  const expected = process.env.CRON_SECRET?.trim();
  if (expected && secret !== expected) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!createAdminClient()) {
    return NextResponse.json(
      { message: "Service unavailable", error: "Supabase not configured" },
      { status: 503 }
    );
  }
  try {
    const result = await processAllDueReferralCommissions();
    return NextResponse.json({
      success: result.success,
      processed: result.processed,
      commissionsPaid: result.commissionsPaid,
      message: "OK",
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("Process referral commissions error:", err.message, err);
    return NextResponse.json(
      { message: "Processing failed", error: err.message },
      { status: 500 }
    );
  }
}
