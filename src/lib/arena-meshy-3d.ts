/**
 * Meshy 3D generation for arena fighters. Shared between generate-3d API and auto-trigger on fighter create.
 */

import { createAdminClient } from "@/lib/supabase";
import {
  storeItemToGlovesKey,
  storeItemToShoesKey,
  storeItemToShortsKey,
  storeItemToHeadgearKey,
} from "@/lib/arena-gear-keys";

type FighterRow = {
  id: string;
  user_id: string;
  body_type: string | null;
  personality: string | null;
  fighter_color: string | null;
  equipped_gloves: string | null;
  equipped_shoes: string | null;
  equipped_shorts: string | null;
  equipped_headgear: string | null;
};

function buildFighterPrompt(fighter: {
  body_type?: string | null;
  equipped_shorts?: string;
  equipped_gloves?: string;
  equipped_shoes?: string;
  equipped_headgear?: string;
  personality?: string | null;
  fighter_color?: string | null;
}): string {
  const shorts =
    fighter.equipped_shorts && fighter.equipped_shorts !== "default"
      ? `${fighter.equipped_shorts} colored`
      : "dark grey";
  const gloves =
    fighter.equipped_gloves && fighter.equipped_gloves !== "default"
      ? "Wearing professional boxing gloves."
      : "Hands wrapped in white hand wraps.";
  const shoes =
    fighter.equipped_shoes && fighter.equipped_shoes !== "default"
      ? "Wearing boxing boots."
      : "Bare feet.";
  const headgear =
    fighter.equipped_headgear && fighter.equipped_headgear !== "none"
      ? "Wearing boxing headgear."
      : "";

  return `
Professional underground boxer in fighting stance.
${fighter.body_type || "athletic"} muscular build.
Hands raised in guard position.
Wearing ${shorts} boxing shorts.
${gloves}
${shoes}
${headgear}
${fighter.personality || "Fierce"} expression.
${fighter.fighter_color ? `Accent color ${fighter.fighter_color}.` : ""}
Dark dramatic studio lighting.
Photorealistic detailed 3D character.
Full body visible from head to toe.
Dark background.
  `.trim();
}

/** Start Meshy 3D generation for a fighter. Updates DB with task_id and status. Returns taskId or null. */
export async function startMeshy3DGeneration(
  fighterId: string,
  userId: string
): Promise<{ taskId: string } | null> {
  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) return null;

  const supabase = createAdminClient();
  if (!supabase) return null;

  const { data: fighter, error: fighterErr } = await supabase
    .from("arena_fighters")
    .select(
      "id, user_id, body_type, personality, fighter_color, equipped_gloves, equipped_shoes, equipped_shorts, equipped_headgear"
    )
    .eq("id", fighterId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fighterErr || !fighter) return null;

  const f = fighter as FighterRow;
  const ids = [f.equipped_gloves, f.equipped_shoes, f.equipped_shorts, f.equipped_headgear].filter(
    Boolean
  ) as string[];
  let equipped_gloves = "default";
  let equipped_shoes = "default";
  let equipped_shorts = "default";
  let equipped_headgear = "none";

  if (ids.length > 0) {
    const { data: items } = await supabase
      .from("arena_store_items")
      .select("id, category, name")
      .in("id", ids);
    const byId = Object.fromEntries(
      ((items ?? []) as { id: string; category: string; name: string }[]).map((i) => [i.id, i])
    );
    equipped_gloves = f.equipped_gloves
      ? storeItemToGlovesKey(byId[f.equipped_gloves]?.category ?? "", byId[f.equipped_gloves]?.name ?? "")
      : "default";
    equipped_shoes = f.equipped_shoes
      ? storeItemToShoesKey(byId[f.equipped_shoes]?.category ?? "", byId[f.equipped_shoes]?.name ?? "")
      : "default";
    equipped_shorts = f.equipped_shorts
      ? storeItemToShortsKey(byId[f.equipped_shorts]?.category ?? "", byId[f.equipped_shorts]?.name ?? "")
      : "default";
    equipped_headgear = f.equipped_headgear
      ? storeItemToHeadgearKey(byId[f.equipped_headgear]?.category ?? "", byId[f.equipped_headgear]?.name ?? "")
      : "none";
  }

  const prompt = buildFighterPrompt({
    body_type: f.body_type,
    personality: f.personality,
    fighter_color: f.fighter_color,
    equipped_shorts,
    equipped_gloves,
    equipped_shoes,
    equipped_headgear,
  });

  const meshyResponse = await fetch("https://api.meshy.ai/v2/text-to-3d", {
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

  if (!meshyResponse.ok) {
    const errText = await meshyResponse.text();
    console.error("[arena-meshy-3d] Meshy error:", meshyResponse.status, errText);
    return null;
  }

  const meshyData = (await meshyResponse.json()) as { result?: string };
  const taskId = meshyData.result;
  if (!taskId || typeof taskId !== "string") return null;

  await supabase
    .from("arena_fighters")
    .update({
      model_3d_task_id: taskId,
      model_3d_status: "generating",
      updated_at: new Date().toISOString(),
    })
    .eq("id", fighterId)
    .eq("user_id", userId);

  return { taskId };
}
