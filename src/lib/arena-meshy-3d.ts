/**
 * Start Meshy text-to-3D generation for an arena fighter. Server-only (uses createAdminClient).
 */

import { createAdminClient } from "@/lib/supabase";

function buildFighterPrompt(name: string, style?: string | null, bodyType?: string | null): string {
  const body = bodyType === "heavyweight" ? "heavyweight boxer" : bodyType === "lightweight" ? "lightweight boxer" : "middleweight boxer";
  const stylePart = style ? ` ${style} style` : "";
  return `A realistic ${body} in fighting stance, athletic build, boxing gloves raised, named ${name},${stylePart} dark background, photorealistic`.slice(0, 600);
}

/**
 * Start Meshy 3D generation for the given fighter. Updates arena_fighters with task id and status.
 * @returns { taskId } or null if fighter not found or API error.
 */
export async function startMeshy3DGeneration(
  fighterId: string,
  userId: string
): Promise<{ taskId: string } | null> {
  const supabase = createAdminClient();
  if (!supabase) return null;

  const { data: fighter, error: fetchErr } = await supabase
    .from("arena_fighters")
    .select("id, name, style, body_type")
    .eq("id", fighterId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr || !fighter) return null;

  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) return null;

  const name = (fighter as { name?: string }).name ?? "Fighter";
  const style = (fighter as { style?: string | null }).style ?? null;
  const bodyType = (fighter as { body_type?: string | null }).body_type ?? null;
  const prompt = buildFighterPrompt(name, style, bodyType);

  const response = await fetch("https://api.meshy.ai/v2/text-to-3d", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "preview",
      prompt,
      art_style: "realistic",
      negative_prompt: "cartoon, anime, blurry, deformed",
    }),
  });

  if (!response.ok) {
    console.error("[arena-meshy-3d] Meshy API error:", response.status, await response.text());
    return null;
  }

  const data = (await response.json()) as { result?: string; [key: string]: unknown };
  const taskId = typeof data.result === "string" ? data.result : null;
  if (!taskId) return null;

  const { error: updateErr } = await supabase
    .from("arena_fighters")
    .update({
      model_3d_task_id: taskId,
      model_3d_status: "generating",
      updated_at: new Date().toISOString(),
    })
    .eq("id", fighterId)
    .eq("user_id", userId);

  if (updateErr) {
    console.error("[arena-meshy-3d] Update error:", updateErr);
    return null;
  }

  return { taskId };
}
