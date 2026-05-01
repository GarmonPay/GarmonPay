import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { userMeetsMinTier } from "@/lib/social-tier";
import { runFraudChecks } from "@/lib/social-fraud-detection";
import { creditGpayIdempotent } from "@/lib/coins";
import { getClientIp } from "@/lib/rate-limit";

const MAX_UA_LEN = 512;
const MAX_FP_LEN = 256;

const GENERIC_OK = {
  success: true,
  message: "Submitted! Most tasks reviewed within 2 hours.",
  status: "pending" as const,
};

export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: { task_id?: string; proof_url?: string; claimed_at?: string; fingerprint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const task_id = body.task_id?.trim();
  const proof_url = typeof body.proof_url === "string" ? body.proof_url.trim() : "";
  const claimed_at = typeof body.claimed_at === "string" ? body.claimed_at.trim() : undefined;
  const submissionIp = getClientIp(req);
  const submissionUaRaw = req.headers.get("user-agent") ?? "";
  const submissionUa = submissionUaRaw.slice(0, MAX_UA_LEN);
  const fpRaw = typeof body.fingerprint === "string" ? body.fingerprint.trim() : "";
  const submissionFingerprint = fpRaw.slice(0, MAX_FP_LEN) || null;

  if (!task_id) {
    return NextResponse.json({ error: "task_id required" }, { status: 400 });
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("membership, social_banned")
    .eq("id", userId)
    .maybeSingle();

  if ((userRow as { social_banned?: boolean } | null)?.social_banned) {
    return NextResponse.json({ error: "Unable to submit right now." }, { status: 403 });
  }

  const membership = (userRow as { membership?: string } | null)?.membership ?? "free";

  const { data: task, error: taskErr } = await supabase
    .from("social_tasks")
    .select("*")
    .eq("id", task_id)
    .maybeSingle();

  if (taskErr || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const t = task as {
    id: string;
    status: string;
    reward_gpc: number;
    max_completions: number;
    completions: number;
    min_tier: string;
    proof_required: boolean;
    platform: string;
    task_type: string;
  };

  if (t.status !== "active") {
    return NextResponse.json({ error: "Task is not active" }, { status: 400 });
  }

  if (!userMeetsMinTier(membership, t.min_tier)) {
    return NextResponse.json(
      { error: "Your membership tier does not unlock this task yet" },
      { status: 403 }
    );
  }

  if (t.completions >= t.max_completions) {
    return NextResponse.json({ error: "This task has reached its completion limit" }, { status: 400 });
  }

  if (t.proof_required && !proof_url) {
    return NextResponse.json({ error: "proof_url required for this task" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("social_task_completions")
    .select("id, status")
    .eq("task_id", task_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "You have already submitted this task" }, { status: 400 });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("social_task_completions")
    .insert({
      task_id,
      user_id: userId,
      proof_url: proof_url || null,
      status: "pending",
      reward_gpc: t.reward_gpc,
      claimed_at: claimed_at ?? null,
      submission_ip: submissionIp || null,
      submission_ua: submissionUa || null,
      submission_fingerprint: submissionFingerprint,
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    console.error("[social/submit] insert:", insErr);
    return NextResponse.json({ error: "Unable to submit. Try again later." }, { status: 500 });
  }

  const completionId = inserted.id as string;
  const submittedAt = new Date().toISOString();

  let fraudResult;
  try {
    fraudResult = await runFraudChecks({
      userId,
      taskId: task_id,
      completionId,
      proofUrl: proof_url,
      proofRequired: t.proof_required,
      submittedAt,
      claimedAt: claimed_at ?? null,
      platform: t.platform,
      taskType: t.task_type,
      submissionIp,
    });
  } catch (e) {
    console.error("[social/submit] fraud checks:", e);
    return NextResponse.json(GENERIC_OK);
  }

  if (fraudResult.action === "approve" && fraudResult.shouldCredit) {
    const credit = await creditGpayIdempotent(
      userId,
      t.reward_gpc,
      "Social task reward",
      `social_task_${completionId}`,
      "social_task_reward"
    );
    if (credit.success) {
      await supabase.from("social_task_completions").update({ status: "approved" }).eq("id", completionId);
      await supabase
        .from("social_tasks")
        .update({ completions: t.completions + 1 })
        .eq("id", task_id);
    } else {
      console.error("[social/submit] GPC credit:", credit.message);
    }
  }

  if (fraudResult.action === "ban") {
    const { error: banErr } = await supabase.from("users").update({ social_banned: true }).eq("id", userId);
    if (banErr) console.error("[social/submit] social_banned:", banErr.message);
  }

  return NextResponse.json(GENERIC_OK);
}
