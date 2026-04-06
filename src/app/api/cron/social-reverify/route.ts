import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { reverifyCompletion } from "@/lib/social-fraud-detection";

/**
 * POST /api/cron/social-reverify
 * Periodically HEAD-check proof URLs for approved completions (silent follow-up).
 * Secure with CRON_SECRET: X-Cron-Secret or Authorization: Bearer.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = (
    request.headers.get("x-cron-secret") ?? (authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "")
  ).trim();
  const expected = process.env.CRON_SECRET?.trim();
  if (expected && secret !== expected) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data: rows, error } = await supabase
    .from("social_task_completions")
    .select("id, user_id, task_id, proof_url")
    .eq("status", "approved")
    .eq("verification_status", "verified")
    .not("proof_url", "is", null)
    .order("completed_at", { ascending: false })
    .limit(40);

  if (error) {
    console.error("[cron/social-reverify]", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  let processed = 0;
  for (const row of rows ?? []) {
    const r = row as {
      id: string;
      user_id: string;
      task_id: string;
      proof_url: string;
    };
    if (!r.proof_url?.trim()) continue;
    try {
      await reverifyCompletion({
        completionId: r.id,
        userId: r.user_id,
        taskId: r.task_id,
        proofUrl: r.proof_url,
        platform: "",
      });
      processed += 1;
    } catch (e) {
      console.error("[cron/social-reverify] row", r.id, e);
    }
  }

  return NextResponse.json({ ok: true, checked: (rows ?? []).length, processed });
}
