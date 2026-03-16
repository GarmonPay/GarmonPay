import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { generateAIFighter, type AIGeneratedFighter } from "@/lib/arena-ai-generate";
import { arenaRateLimitFightCreate, getClientIpArena } from "@/lib/arena-security";

const CPU_USER_IDS = [
  "a0000000-0000-0000-0000-000000000001",
  "a0000000-0000-0000-0000-000000000002",
  "a0000000-0000-0000-0000-000000000003",
  "a0000000-0000-0000-0000-000000000004",
  "a0000000-0000-0000-0000-000000000005",
  "a0000000-0000-0000-0000-000000000006",
];

const JOIN_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 min

/** Fallback when Anthropic fails — never show AI error to user. */
const FALLBACK_AI_FIGHTERS: AIGeneratedFighter[] = [
  {
    name: "IRON VEGA",
    style: "Brawler",
    avatar: "💀",
    strength: 85,
    speed: 78,
    stamina: 80,
    defense: 70,
    chin: 88,
    special: 72,
    taunt: "You're already done.",
    weakness: "speed",
  },
  {
    name: "THE SERPENT",
    style: "Counterpuncher",
    avatar: "🐍",
    strength: 68,
    speed: 92,
    stamina: 85,
    defense: 90,
    chin: 72,
    special: 80,
    taunt: "I don't miss.",
    weakness: "chin",
  },
  {
    name: "STONE COLD",
    style: "Pressure Fighter",
    avatar: "🪨",
    strength: 80,
    speed: 68,
    stamina: 94,
    defense: 82,
    chin: 95,
    special: 60,
    taunt: "Pain is my warmup.",
    weakness: "speed",
  },
];

function signJoinToken(payload: { fightId: string; userId: string; fighterAId: string; exp: number }): string {
  const secret = process.env.ARENA_JOIN_SECRET || "arena-join-secret-change-in-production";
  const str = JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(str).digest("hex");
  return Buffer.from(JSON.stringify({ ...payload, sig })).toString("base64url");
}

/** POST /api/arena/fights/create — create a fight vs CPU or AI. Body: { cpuFighterId } or { opponentType: 'ai' }. Rate limited. */
export async function POST(req: Request) {
  const rate = arenaRateLimitFightCreate(req);
  if (rate) return rate;
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const ip = getClientIpArena(req);

  let body: { cpuFighterId?: string; opponentType?: string; fingerprint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  try {
    await supabase.from("arena_activity_log").insert({ user_id: userId, ip, action_type: "fight_create", fingerprint_hash: body.fingerprint || null });
  } catch {
    // ignore
  }

  const { data: myFighter, error: myErr } = await supabase
    .from("arena_fighters")
    .select("id, name, style, avatar, strength, speed, stamina, defense, chin, special, wins")
    .eq("user_id", userId)
    .maybeSingle();
  if (myErr || !myFighter) {
    return NextResponse.json({ message: "Fighter not found" }, { status: 404 });
  }

  const isAi = body.opponentType === "ai";
  let fighterBId: string;
  let fighterBPayload: Record<string, unknown> & { taunt?: string; weakness?: string; isAi?: boolean };

  if (isAi) {
    const totalStats =
      (myFighter.strength ?? 0) +
      (myFighter.speed ?? 0) +
      (myFighter.stamina ?? 0) +
      (myFighter.defense ?? 0) +
      (myFighter.chin ?? 0) +
      (myFighter.special ?? 0);
    const wins = (myFighter as { wins?: number }).wins ?? 0;
    let generated: AIGeneratedFighter | null = await generateAIFighter(wins, totalStats);
    if (!generated) {
      const fallback = FALLBACK_AI_FIGHTERS[Math.floor(Math.random() * FALLBACK_AI_FIGHTERS.length)];
      generated = fallback;
    }
    // Use an existing CPU fighter's user_id instead of inserting a ghost user row
    const { data: cpuUserRow } = await supabase
      .from("arena_cpu_fighters")
      .select("user_id")
      .limit(1)
      .single();
    const aiUserId = cpuUserRow?.user_id ?? CPU_USER_IDS[Math.floor(Math.random() * CPU_USER_IDS.length)];
    const { data: aiFighter, error: aiFighterErr } = await supabase
      .from("arena_fighters")
      .insert({
        user_id: aiUserId,
        name: generated.name,
        style: generated.style,
        avatar: generated.avatar,
        strength: generated.strength,
        speed: generated.speed,
        stamina: generated.stamina,
        defense: generated.defense,
        chin: generated.chin,
        special: generated.special,
      })
      .select("id, name, style, avatar, strength, speed, stamina, defense, chin, special")
      .single();
    if (aiFighterErr || !aiFighter) {
      return NextResponse.json({ message: "Failed to create AI fighter" }, { status: 500 });
    }
    fighterBId = (aiFighter as { id: string }).id;
    fighterBPayload = {
      ...aiFighter,
      taunt: generated.taunt,
      weakness: generated.weakness,
      isAi: true,
    };
  } else {
    const cpuFighterId = body.cpuFighterId;
    if (!cpuFighterId || typeof cpuFighterId !== "string") {
      return NextResponse.json({ message: "cpuFighterId or opponentType required" }, { status: 400 });
    }
    const { data: cpuFighter, error: cpuErr } = await supabase
      .from("arena_fighters")
      .select("id, name, style, avatar, strength, speed, stamina, defense, chin, special, user_id")
      .eq("id", cpuFighterId)
      .maybeSingle();
    if (cpuErr || !cpuFighter) {
      return NextResponse.json({ message: "CPU fighter not found" }, { status: 404 });
    }
    if (!CPU_USER_IDS.includes((cpuFighter as { user_id: string }).user_id)) {
      return NextResponse.json({ message: "Not a CPU fighter" }, { status: 400 });
    }
    fighterBId = cpuFighter.id;
    const { user_id: _u, ...cpuSafe } = cpuFighter as { user_id: string; [k: string]: unknown };
    fighterBPayload = { ...cpuSafe, isAi: false };
  }

  const { data: fight, error: fightErr } = await supabase
    .from("arena_fights")
    .insert({
      fighter_a_id: myFighter.id,
      fighter_b_id: fighterBId,
      fight_type: isAi ? "ai" : "cpu",
    })
    .select("id")
    .single();
  if (fightErr || !fight) {
    return NextResponse.json({ message: fightErr?.message ?? "Failed to create fight" }, { status: 500 });
  }

  const fightId = (fight as { id: string }).id;
  const exp = Date.now() + JOIN_TOKEN_TTL_MS;
  const joinToken = signJoinToken({
    fightId,
    userId,
    fighterAId: myFighter.id,
    exp,
  });

  return NextResponse.json({
    fightId,
    fighterA: myFighter,
    fighterB: fighterBPayload,
    joinToken,
    wsUrl: process.env.NEXT_PUBLIC_BOXING_WS_URL || "http://localhost:3001",
  });
}
