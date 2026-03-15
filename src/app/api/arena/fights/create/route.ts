import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { randomUUID } from "crypto";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { generateAIFighter } from "@/lib/arena-ai-generate";
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
    const generated = await generateAIFighter(wins, totalStats);
    if (!generated) {
      return NextResponse.json({ message: "AI opponent generation failed" }, { status: 503 });
    }
    const aiUserId = randomUUID();
    await supabase.from("users").insert({
      id: aiUserId,
      email: `arena-ai-${aiUserId}@garmonpay.internal`,
      balance: 0,
      role: "user",
      is_super_admin: false,
      created_at: new Date().toISOString(),
    });
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
    wsUrl: process.env.NEXT_PUBLIC_ARENA_WS_URL || "http://localhost:3001",
  });
}
