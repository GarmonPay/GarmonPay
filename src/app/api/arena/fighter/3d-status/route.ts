import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type MeshyTask = {
  status?: string;
  progress?: number;
  model_urls?: { glb?: string };
  thumbnail_url?: string;
};

/** GET /api/arena/fighter/3d-status?taskId=xxx — Poll Meshy for 3D task completion. */
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
    const taskId = searchParams.get("taskId");
    if (!taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: fighter } = await supabase
      .from("arena_fighters")
      .select("id, model_3d_task_id")
      .eq("user_id", userId)
      .eq("model_3d_task_id", taskId)
      .maybeSingle();

    if (!fighter) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const statusResponse = await fetch(`https://api.meshy.ai/v2/text-to-3d/${taskId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!statusResponse.ok) {
      console.error("[3d-status] Meshy status error:", statusResponse.status);
      return NextResponse.json(
        { error: "Failed to get task status" },
        { status: 502 }
      );
    }

    const task = (await statusResponse.json()) as MeshyTask;
    const status = task.status ?? "PENDING";

    if (status === "SUCCEEDED") {
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

    return NextResponse.json({
      status: "generating",
      progress: typeof task.progress === "number" ? task.progress : 0,
    });
  } catch (err) {
    console.error("[3d-status]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
