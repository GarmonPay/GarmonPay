import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { userMeetsMinTier } from "@/lib/social-tier";

export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: { task_id?: string; proof_url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const task_id = body.task_id?.trim();
  const proof_url = typeof body.proof_url === "string" ? body.proof_url.trim() : "";

  if (!task_id) {
    return NextResponse.json({ error: "task_id required" }, { status: 400 });
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("membership")
    .eq("id", userId)
    .maybeSingle();

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
    reward_cents: number;
    max_completions: number;
    completions: number;
    min_tier: string;
    proof_required: boolean;
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
    return NextResponse.json(
      { error: "You have already submitted this task" },
      { status: 400 }
    );
  }

  const { error: insErr } = await supabase.from("social_task_completions").insert({
    task_id,
    user_id: userId,
    proof_url: proof_url || null,
    status: "pending",
    reward_cents: t.reward_cents,
  });

  if (insErr) {
    console.error("[social/submit] insert:", insErr);
    return NextResponse.json({ error: insErr.message ?? "Failed to submit" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: "Submission received. You will be credited after approval.",
  });
}
