import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { creditGpayIdempotent } from "@/lib/coins";

export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { completion_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const completion_id = body.completion_id?.trim();
  const action = body.action === "reject" ? "reject" : body.action === "approve" ? "approve" : null;

  if (!completion_id || !action) {
    return NextResponse.json(
      { message: "completion_id and action (approve | reject) required" },
      { status: 400 }
    );
  }

  const { data: row, error: fetchErr } = await supabase
    .from("social_task_completions")
    .select("id, task_id, user_id, status, reward_gpc")
    .eq("id", completion_id)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ message: "Completion not found" }, { status: 404 });
  }

  const c = row as {
    id: string;
    task_id: string;
    user_id: string;
    status: string;
    reward_gpc: number;
  };

  if (c.status !== "pending") {
    return NextResponse.json({ message: "Completion is not pending" }, { status: 400 });
  }

  if (action === "reject") {
    const { error: upErr } = await supabase
      .from("social_task_completions")
      .update({ status: "rejected" })
      .eq("id", completion_id);

    if (upErr) {
      console.error("[admin/social/approve] reject:", upErr);
      return NextResponse.json({ message: upErr.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, status: "rejected" });
  }

  const { data: task, error: taskErr } = await supabase
    .from("social_tasks")
    .select("id, completions, max_completions, status")
    .eq("id", c.task_id)
    .maybeSingle();

  if (taskErr || !task) {
    return NextResponse.json({ message: "Task not found" }, { status: 404 });
  }

  const tk = task as { id: string; completions: number; max_completions: number; status: string };
  if (tk.status !== "active") {
    return NextResponse.json({ message: "Task is no longer active" }, { status: 400 });
  }
  if (tk.completions >= tk.max_completions) {
    return NextResponse.json({ message: "Task completion cap reached" }, { status: 400 });
  }

  const credit = await creditGpayIdempotent(
    c.user_id,
    c.reward_gpc,
    "Social task reward",
    `social_task_${completion_id}`,
    "social_task_reward"
  );

  if (!credit.success) {
    return NextResponse.json(
      { message: credit.message ?? "Failed to credit GPay Coins" },
      { status: 500 }
    );
  }

  const { error: upComp } = await supabase
    .from("social_task_completions")
    .update({ status: "approved" })
    .eq("id", completion_id);

  if (upComp) {
    console.error("[admin/social/approve] approve completion:", upComp);
    return NextResponse.json({ message: upComp.message }, { status: 500 });
  }

  const { error: upTask } = await supabase
    .from("social_tasks")
    .update({ completions: tk.completions + 1 })
    .eq("id", c.task_id);

  if (upTask) {
    console.error("[admin/social/approve] increment task:", upTask);
  }

  return NextResponse.json({ success: true, status: "approved" });
}
