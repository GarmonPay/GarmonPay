import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { createMeshyRefineTask } from "@/lib/arena-meshy-3d";

export const dynamic = "force-dynamic";

type MeshyTask = {
  status?: string;
  progress?: number;
  model_urls?: { glb?: string };
  thumbnail_url?: string;
};

type Fighter3dRow = {
  id: string;
  model_3d_task_id: string | null;
  model_3d_preview_task_id: string | null;
  model_3d_status: string | null;
};

async function fetchFighterForTask(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
  taskId: string
): Promise<Fighter3dRow | null> {
  const { data: byTask } = await supabase
    .from("arena_fighters")
    .select("id, model_3d_task_id, model_3d_preview_task_id, model_3d_status")
    .eq("user_id", userId)
    .eq("model_3d_task_id", taskId)
    .maybeSingle();

  if (byTask) return byTask as Fighter3dRow;

  const { data: byPreview } = await supabase
    .from("arena_fighters")
    .select("id, model_3d_task_id, model_3d_preview_task_id, model_3d_status")
    .eq("user_id", userId)
    .eq("model_3d_preview_task_id", taskId)
    .maybeSingle();

  return (byPreview as Fighter3dRow) ?? null;
}

async function meshyGetTask(apiKey: string, taskId: string): Promise<MeshyTask | null> {
  const res = await fetch(`https://api.meshy.ai/v2/text-to-3d/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as MeshyTask;
}

/** GET /api/arena/fighter/3d-status?taskId=xxx — Poll Meshy preview then refine. */
export async function GET(request: Request) {
  try {
    const userId = await getAuthUserIdStrict(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.MESHY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "3D generation not configured" }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const taskIdInitial = searchParams.get("taskId");
    if (!taskIdInitial) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }
    let taskIdParam: string = taskIdInitial;

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    for (let hop = 0; hop < 3; hop++) {
      const fighter = await fetchFighterForTask(supabase, userId, taskIdParam);
      if (!fighter) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }

      const activeTaskId = fighter.model_3d_task_id ?? taskIdParam;
      const task = await meshyGetTask(apiKey, activeTaskId);
      if (!task) {
        return NextResponse.json({ error: "Failed to get task status" }, { status: 502 });
      }

      const status = task.status ?? "PENDING";

      if (fighter.model_3d_status === "refine_lock") {
        return NextResponse.json({
          status: "generating",
          progress: Math.max(typeof task.progress === "number" ? task.progress : 0, 90),
        });
      }

      if (status === "FAILED") {
        await supabase
          .from("arena_fighters")
          .update({
            model_3d_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", fighter.id)
          .eq("user_id", userId);

        return NextResponse.json({ status: "failed" });
      }

      if (fighter.model_3d_status === "generating_refine" && status === "SUCCEEDED") {
        const modelUrl = task.model_urls?.glb ?? null;
        const thumbnailUrl = task.thumbnail_url ?? null;

        if (modelUrl) {
          await supabase
            .from("arena_fighters")
            .update({
              model_3d_url: modelUrl,
              model_3d_status: "complete",
              model_thumbnail_url: thumbnailUrl,
              model_3d_generated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", fighter.id)
            .eq("user_id", userId);
        }

        return NextResponse.json({
          status: "complete",
          modelUrl,
          thumbnail: thumbnailUrl,
        });
      }

      if (fighter.model_3d_status === "generating" && status === "SUCCEEDED") {
        const previewId =
          fighter.model_3d_preview_task_id ?? fighter.model_3d_task_id ?? activeTaskId;
        if (activeTaskId !== previewId) {
          taskIdParam = activeTaskId as string;
          continue;
        }

        const { data: claimed } = await supabase
          .from("arena_fighters")
          .update({ model_3d_status: "refine_lock" })
          .eq("id", fighter.id)
          .eq("user_id", userId)
          .eq("model_3d_task_id", previewId)
          .eq("model_3d_status", "generating")
          .select("id")
          .maybeSingle();

        if (!claimed) {
          const f2 = await fetchFighterForTask(supabase, userId, taskIdParam);
          if (f2?.model_3d_status === "generating_refine" && f2.model_3d_task_id) {
            taskIdParam = f2.model_3d_task_id as string;
            continue;
          }
          if (f2?.model_3d_status === "refine_lock") {
            return NextResponse.json({ status: "generating", progress: 92 });
          }
          return NextResponse.json({ status: "generating", progress: 95 });
        }

        const { data: fullFighter, error: fullErr } = await supabase
          .from("arena_fighters")
          .select("body_type, equipped_gloves, equipped_shorts, personality, nickname, name, style")
          .eq("id", fighter.id)
          .eq("user_id", userId)
          .maybeSingle();

        if (fullErr || !fullFighter) {
          await supabase
            .from("arena_fighters")
            .update({
              model_3d_status: "failed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", fighter.id)
            .eq("user_id", userId);
          return NextResponse.json({ status: "failed" });
        }

        const refineId = await createMeshyRefineTask(
          previewId,
          fullFighter as Record<string, unknown>
        );

        if (!refineId) {
          await supabase
            .from("arena_fighters")
            .update({
              model_3d_status: "failed",
              model_3d_task_id: null,
              model_3d_preview_task_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", fighter.id)
            .eq("user_id", userId);
          return NextResponse.json({ status: "failed" });
        }

        await supabase
          .from("arena_fighters")
          .update({
            model_3d_task_id: refineId,
            model_3d_status: "generating_refine",
            updated_at: new Date().toISOString(),
          })
          .eq("id", fighter.id)
          .eq("user_id", userId)
          .eq("model_3d_status", "refine_lock");

        return NextResponse.json({
          status: "generating",
          nextTaskId: refineId,
          progress: 0,
          phase: "refine",
        });
      }

      if (fighter.model_3d_status === "generating_refine") {
        return NextResponse.json({
          status: "generating",
          progress: typeof task.progress === "number" ? task.progress : 0,
          phase: "refine",
        });
      }

      return NextResponse.json({
        status: "generating",
        progress: typeof task.progress === "number" ? task.progress : 0,
      });
    }

    return NextResponse.json({ error: "Too many redirects" }, { status: 500 });
  } catch (err) {
    console.error("[3d-status]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
