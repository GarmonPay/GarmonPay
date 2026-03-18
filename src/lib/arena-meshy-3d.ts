/**
 * Meshy text-to-3D: preview task first, then refine (textured GLB). Server-only.
 * Refine cannot run without a succeeded preview_task_id (Meshy API).
 */

import { createAdminClient } from "@/lib/supabase";

const MESHY_TEXT_TO_3D = "https://api.meshy.ai/v2/text-to-3d";

const NEGATIVE_PROMPT =
  "cartoon, anime, toon, low poly, blurry, deformed, ugly, bad anatomy, extra limbs, floating, disconnected, flat lighting, cel shaded, stylized, 2D";

/** Full fighter prompt; Meshy preview/refine prompts max 600 chars — trimmed below. */
export function buildFighterPrompt(fighter: Record<string, unknown>): string {
  const gloves = String(fighter.equipped_gloves ?? "").toLowerCase();
  const gloveColor = gloves.includes("championship")
    ? "gold"
    : gloves.includes("titanium")
      ? "silver"
      : gloves.includes("pro") && !gloves.includes("championship")
        ? "blue"
        : gloves.includes("street")
          ? "black"
          : "red";

  const shorts = String(fighter.equipped_shorts ?? "").toLowerCase();
  const shortsColor =
    shorts.includes("gold_trunks") || shorts === "gold"
      ? "gold"
      : shorts.includes("street")
        ? "red"
        : shorts.includes("champion")
          ? "white"
          : shorts.includes("diamond")
            ? "black"
            : "dark navy";

  const bt = String(fighter.body_type ?? "middleweight");
  const build =
    bt === "heavyweight"
      ? "massive heavyweight muscular"
      : bt === "lightweight"
        ? "lean lightweight athletic"
        : "middleweight athletic muscular";

  const personality =
    typeof fighter.personality === "string" && fighter.personality.trim()
      ? fighter.personality.trim()
      : "fierce";

  const prompt =
    `ultra realistic professional boxer, ${build} physique, detailed skin texture, ` +
    `sweat droplets on skin, realistic lighting, 3D model game-ready, PBR textures, ` +
    `high detail, cinematic dramatic lighting, wearing ${gloveColor} boxing gloves and ` +
    `${shortsColor} boxing shorts, orthodox fighting stance, both hands raised in guard position ` +
    `protecting face, chin tucked down, elbows tucked in, knees slightly bent, ` +
    `left foot forward, right foot back, dark atmospheric background, photorealistic 8K detail, ` +
    `subsurface scattering on skin, visible muscle definition chest and arms, ` +
    `professional underground fighter look, dramatic spotlight from directly above, ` +
    `deep shadows, cinematic mood, full body visible head to feet, ${personality} facial expression`;

  return prompt.replace(/\s+/g, " ").trim().slice(0, 600);
}

/**
 * Start Meshy preview (geometry). Refine runs in 3d-status when preview succeeds.
 */
export async function startMeshy3DGeneration(
  fighterId: string,
  userId: string
): Promise<{ taskId: string } | null> {
  const supabase = createAdminClient();
  if (!supabase) return null;

  const { data: fighter, error: fetchErr } = await supabase
    .from("arena_fighters")
    .select(
      "id, name, style, body_type, equipped_gloves, equipped_shorts, personality, nickname"
    )
    .eq("id", fighterId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr || !fighter) return null;

  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) return null;

  const f = fighter as Record<string, unknown>;
  const prompt = buildFighterPrompt(f);

  const response = await fetch(MESHY_TEXT_TO_3D, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "preview",
      prompt,
      negative_prompt: NEGATIVE_PROMPT,
      should_remesh: true,
      ai_model: "latest",
    }),
  });

  if (!response.ok) {
    console.error("[arena-meshy-3d] Meshy preview error:", response.status, await response.text());
    return null;
  }

  const data = (await response.json()) as { result?: string };
  const taskId = typeof data.result === "string" ? data.result : null;
  if (!taskId) return null;

  const { error: updateErr } = await supabase
    .from("arena_fighters")
    .update({
      model_3d_task_id: taskId,
      model_3d_preview_task_id: taskId,
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

/**
 * Create refine task after preview SUCCEEDED. Texturing guided by same fighter prompt (≤600).
 */
export async function createMeshyRefineTask(
  previewTaskId: string,
  fighter: Record<string, unknown>
): Promise<string | null> {
  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) return null;

  const texturePrompt = buildFighterPrompt(fighter);

  const response = await fetch(MESHY_TEXT_TO_3D, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "refine",
      preview_task_id: previewTaskId,
      enable_pbr: true,
      ai_model: "latest",
      texture_prompt: texturePrompt,
    }),
  });

  if (!response.ok) {
    console.error("[arena-meshy-3d] Meshy refine error:", response.status, await response.text());
    return null;
  }

  const data = (await response.json()) as { result?: string };
  return typeof data.result === "string" ? data.result : null;
}
