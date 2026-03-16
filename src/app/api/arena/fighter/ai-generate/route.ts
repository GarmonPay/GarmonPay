import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import {
  generateAICharacterWithFallback,
  buildPortraitSVG,
  type AIGeneratedCharacter,
} from "@/lib/arena-ai-character";
import { startMeshy3DGeneration } from "@/lib/arena-meshy-3d";

const REGENERATION_COST = 500;

/** POST /api/arena/fighter/ai-generate — create or regenerate fighter via Claude AI. */
export async function POST(request: Request) {
  try {
    const userId = await getAuthUserIdStrict(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI generation is currently unavailable. Please use manual fighter creation." },
        { status: 503 }
      );
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    let body: {
      method?: "questionnaire" | "auto";
      answers?: string[];
      username?: string;
      regeneration?: boolean;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const method = body.method === "auto" ? "auto" : "questionnaire";
    const answers = Array.isArray(body.answers) ? body.answers : [];
    const username = typeof body.username === "string" ? body.username.trim().slice(0, 100) : "";
    const regeneration = !!body.regeneration;

    const displayUsername = username || "Fighter";

    // Load user and fighter
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id, email, arena_coins, arena_free_generation_used")
      .eq("id", userId)
      .single();

    if (userErr || !userRow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const arenaCoins = Number((userRow as { arena_coins?: number }).arena_coins ?? 0);
    const freeGenerationUsed = !!(userRow as { arena_free_generation_used?: boolean }).arena_free_generation_used;

    const { data: existingFighter } = await supabase
      .from("arena_fighters")
      .select("id, name, strength, speed, stamina, defense, chin, special, wins, losses, training_sessions, equipped_gloves, equipped_shoes, equipped_shorts, equipped_headgear, condition, win_streak")
      .eq("user_id", userId)
      .maybeSingle();

    if (regeneration) {
      if (!existingFighter) {
        return NextResponse.json({ error: "No fighter to regenerate" }, { status: 400 });
      }
      if (arenaCoins < REGENERATION_COST) {
        return NextResponse.json(
          { error: "Insufficient coins", required: REGENERATION_COST, code: "INSUFFICIENT_COINS" },
          { status: 402 }
        );
      }
    } else {
      if (existingFighter) {
        return NextResponse.json({ error: "Fighter already exists" }, { status: 400 });
      }
      if (freeGenerationUsed && arenaCoins < REGENERATION_COST) {
        return NextResponse.json(
          { error: "Insufficient coins", required: REGENERATION_COST, code: "INSUFFICIENT_COINS" },
          { status: 402 }
        );
      }
    }

    // Deduct coins if paid generation (before calling Claude so we don't charge on failure we can't recover)
    const shouldDeduct = regeneration || freeGenerationUsed;
    if (shouldDeduct && arenaCoins >= REGENERATION_COST) {
      const newCoins = arenaCoins - REGENERATION_COST;
      await supabase.from("users").update({ arena_coins: newCoins }).eq("id", userId);
      await supabase.from("arena_coin_transactions").insert({
        user_id: userId,
        amount: -REGENERATION_COST,
        type: "regeneration",
        description: "AI fighter regeneration",
      });
    }

    let character: AIGeneratedCharacter;
    try {
      character = await generateAICharacterWithFallback(method, displayUsername, answers);
    } catch (e) {
      console.error("[ai-generate] Generation failed:", e);
      if (shouldDeduct && arenaCoins >= REGENERATION_COST) {
        await supabase.from("users").update({ arena_coins: arenaCoins }).eq("id", userId);
      }
      return NextResponse.json(
        { error: "AI is warming up. Try again in a moment." },
        { status: 503 }
      );
    }

    const portraitSvg = buildPortraitSVG(character);

    if (regeneration && existingFighter) {
      const { data: updated, error: updateErr } = await supabase
        .from("arena_fighters")
        .update({
          name: character.name,
          style: character.style,
          avatar: character.avatar,
          body_type: character.body_type,
          nickname: character.nickname,
          origin: character.origin,
          backstory: character.backstory,
          personality: character.personality,
          trash_talk_style: character.trash_talk_style,
          signature_move_name: character.signature_move_name,
          signature_move_desc: character.signature_move_desc,
          recommended_training: character.recommended_training,
          fighter_color: character.color,
          portrait_svg: portraitSvg,
          generation_method: method,
          // Reset 3D model so the fighter page shows it needs regeneration
          model_3d_task_id: null,
          model_3d_status: null,
          model_3d_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingFighter.id)
        .select()
        .single();

      if (updateErr) {
        console.error("[ai-generate] Update error:", updateErr);
        return NextResponse.json({ error: "Failed to update fighter" }, { status: 500 });
      }
      return NextResponse.json({ success: true, fighter: updated });
    }

    // Ensure user exists in public.users; mark free generation used
    const { data: _u } = await supabase.from("users").select("id").eq("id", userId).maybeSingle();
    if (!_u) {
      const authResponse = await supabase.auth.admin.getUserById(userId);
      const authUser = authResponse.data?.user ?? null;
      const coinsAfter = shouldDeduct ? arenaCoins - REGENERATION_COST : arenaCoins;
      await supabase.from("users").insert({
        id: userId,
        email: authUser?.email ?? null,
        role: "user",
        balance: 0,
        arena_coins: coinsAfter,
        arena_free_generation_used: true,
        created_at: new Date().toISOString(),
      });
    } else {
      await supabase.from("users").update({ arena_free_generation_used: true }).eq("id", userId);
    }

    const { data: fighter, error: insertErr } = await supabase
      .from("arena_fighters")
      .insert({
        user_id: userId,
        name: character.name,
        style: character.style,
        avatar: character.avatar,
        body_type: character.body_type,
        skin_tone: "tone3",
        face_style: "determined",
        hair_style: "short_fade",
        strength: character.stats.strength,
        speed: character.stats.speed,
        stamina: character.stats.stamina,
        defense: character.stats.defense,
        chin: character.stats.chin,
        special: character.stats.special,
        nickname: character.nickname,
        origin: character.origin,
        backstory: character.backstory,
        personality: character.personality,
        trash_talk_style: character.trash_talk_style,
        signature_move_name: character.signature_move_name,
        signature_move_desc: character.signature_move_desc,
        recommended_training: character.recommended_training,
        fighter_color: character.color,
        portrait_svg: portraitSvg,
        generation_method: method,
        free_generation_used: !shouldDeduct,
        wins: 0,
        losses: 0,
        training_sessions: 0,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[ai-generate] Insert error:", insertErr);
      if (shouldDeduct && arenaCoins >= REGENERATION_COST) {
        await supabase.from("users").update({ arena_coins: arenaCoins }).eq("id", userId);
      }
      return NextResponse.json({ error: "Failed to create fighter" }, { status: 500 });
    }

    // Start 3D generation in background (do not await)
    startMeshy3DGeneration(fighter.id, userId).catch((e) =>
      console.error("[ai-generate] 3D generation start failed:", e)
    );

    return NextResponse.json({ success: true, fighter });
  } catch (err) {
    console.error("[ai-generate]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
