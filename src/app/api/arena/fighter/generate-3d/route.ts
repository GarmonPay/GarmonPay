import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { startMeshy3DGeneration } from "@/lib/arena-meshy-3d";

/** POST /api/arena/fighter/generate-3d — Start Meshy 3D generation for user's fighter. */
export async function POST(request: Request) {
  try {
    const userId = await getAuthUserIdStrict(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.MESHY_API_KEY) {
      return NextResponse.json({ error: "3D model generation is not available at this time." }, { status: 503 });
    }

    let body: { fighterId?: string };
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    let fighterId =
      typeof body.fighterId === "string" && body.fighterId.trim() ? body.fighterId.trim() : null;

    if (!fighterId) {
      const supabase = createAdminClient();
      if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
      const { data: f } = await supabase
        .from("arena_fighters")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      fighterId = (f as { id?: string } | null)?.id ?? null;
    }

    if (!fighterId) {
      return NextResponse.json({ error: "Fighter not found" }, { status: 404 });
    }

    const result = await startMeshy3DGeneration(fighterId, userId);

    if (!result) {
      return NextResponse.json({ error: "Fighter not found or generation failed" }, { status: 400 });
    }

    return NextResponse.json({ taskId: result.taskId, status: "generating" });
  } catch (err) {
    console.error("[generate-3d]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
