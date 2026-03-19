import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getTotalStats, getWeightClass } from "@/lib/arena-achievements";
import { normalizeFighterStats } from "@/lib/arena-fighter-types";
import {
  storeItemToGlovesKey,
  storeItemToShoesKey,
  storeItemToShortsKey,
  storeItemToHeadgearKey,
} from "@/lib/arena-gear-keys";

/** GET /api/arena/me — current user's fighter (if any). Resolves equipped gear IDs to visual keys. */
export async function GET(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const [{ data: fighter, error }, { data: userRow }] = await Promise.all([
    supabase
      .from("arena_fighters")
      .select("id, name, style, avatar, title, strength, speed, stamina, defense, chin, special, wins, losses, condition, win_streak, training_sessions, body_type, skin_tone, face_style, hair_style, equipped_gloves, equipped_shoes, equipped_shorts, equipped_headgear, nickname, origin, backstory, personality, trash_talk_style, signature_move_name, signature_move_desc, recommended_training, fighter_color, portrait_svg, generation_method, model_3d_url, model_3d_status, model_3d_task_id, model_thumbnail_url")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("users").select("arena_coins, arena_free_generation_used").eq("id", userId).single(),
  ]);
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  const arenaCoins = userRow != null ? Number((userRow as { arena_coins?: number }).arena_coins ?? 0) : 0;
  const freeGenerationUsed = !!(userRow as { arena_free_generation_used?: boolean })?.arena_free_generation_used;
  let weightClass: string | null = null;
  let totalStats = 0;
  let resolvedFighter = fighter;

  if (fighter) {
    totalStats = getTotalStats(fighter as Record<string, number>);
    weightClass = getWeightClass(totalStats);

    const f = fighter as { equipped_gloves?: string | null; equipped_shoes?: string | null; equipped_shorts?: string | null; equipped_headgear?: string | null };
    const ids = [
      f?.equipped_gloves ?? undefined,
      f?.equipped_shoes ?? undefined,
      f?.equipped_shorts ?? undefined,
      f?.equipped_headgear ?? undefined,
    ].filter(Boolean) as string[];
    if (ids.length > 0) {
      const { data: items } = await supabase
        .from("arena_store_items")
        .select("id, category, name")
        .in("id", ids);
      const byId = Object.fromEntries(
        ((items ?? []) as { id: string; category: string; name: string }[]).map((i) => [i.id, i])
      );
      resolvedFighter = {
        ...fighter,
        body_type: (fighter as { body_type?: string | null })?.body_type ?? "middleweight",
        skin_tone: (fighter as { skin_tone?: string | null })?.skin_tone ?? "tone3",
        face_style: (fighter as { face_style?: string | null })?.face_style ?? "determined",
        hair_style: (fighter as { hair_style?: string | null })?.hair_style ?? "short_fade",
        equipped_gloves_key: f?.equipped_gloves
          ? storeItemToGlovesKey(byId[f.equipped_gloves]?.category ?? "", byId[f.equipped_gloves]?.name ?? "")
          : "default",
        equipped_shoes_key: f?.equipped_shoes
          ? storeItemToShoesKey(byId[f.equipped_shoes]?.category ?? "", byId[f.equipped_shoes]?.name ?? "")
          : "default",
        equipped_shorts_key: f?.equipped_shorts
          ? storeItemToShortsKey(byId[f.equipped_shorts]?.category ?? "", byId[f.equipped_shorts]?.name ?? "")
          : "default",
        equipped_headgear_key: f?.equipped_headgear
          ? storeItemToHeadgearKey(byId[f.equipped_headgear]?.category ?? "", byId[f.equipped_headgear]?.name ?? "")
          : "none",
      } as typeof fighter & {
        body_type: string;
        skin_tone: string;
        face_style: string;
        hair_style: string;
        equipped_gloves_key: string;
        equipped_shoes_key: string;
        equipped_shorts_key: string;
        equipped_headgear_key: string;
      };
    } else {
      resolvedFighter = {
        ...fighter,
        body_type: (fighter as { body_type?: string | null })?.body_type ?? "middleweight",
        skin_tone: (fighter as { skin_tone?: string | null })?.skin_tone ?? "tone3",
        face_style: (fighter as { face_style?: string | null })?.face_style ?? "determined",
        hair_style: (fighter as { hair_style?: string | null })?.hair_style ?? "short_fade",
        equipped_gloves_key: "default",
        equipped_shoes_key: "default",
        equipped_shorts_key: "default",
        equipped_headgear_key: "none",
      } as typeof fighter & {
        body_type: string;
        skin_tone: string;
        face_style: string;
        hair_style: string;
        equipped_gloves_key: string;
        equipped_shoes_key: string;
        equipped_shorts_key: string;
        equipped_headgear_key: string;
      };
    }
  }

  const fighterOut =
    resolvedFighter != null
      ? normalizeFighterStats(resolvedFighter as Record<string, unknown>)
      : null;

  return NextResponse.json({
    fighter: fighterOut,
    weightClass,
    totalStats,
    arenaCoins,
    freeGenerationUsed,
  });
}
