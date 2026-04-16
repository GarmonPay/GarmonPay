import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/social/pending — list pending social task completions for admin review. */
export async function GET(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";

  const { data: rows, error } = await supabase
    .from("social_task_completions")
    .select("id, task_id, user_id, proof_url, status, reward_gpc, completed_at")
    .eq("status", status)
    .order("completed_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[admin/social/pending]", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const taskIds = Array.from(new Set(list.map((r) => (r as { task_id: string }).task_id)));
  let taskMap: Record<string, Record<string, unknown>> = {};
  if (taskIds.length > 0) {
    const { data: tasks } = await supabase
      .from("social_tasks")
      .select("id, title, platform, task_type, target_url")
      .in("id", taskIds);
    for (const t of tasks ?? []) {
      const row = t as { id: string };
      taskMap[row.id] = t as Record<string, unknown>;
    }
  }

  const completions = list.map((r) => {
    const row = r as {
      id: string;
      task_id: string;
      user_id: string;
      proof_url: string | null;
      status: string;
      reward_gpc: number;
      completed_at: string;
    };
    return {
      ...row,
      task: taskMap[row.task_id] ?? null,
    };
  });

  return NextResponse.json({ completions });
}
