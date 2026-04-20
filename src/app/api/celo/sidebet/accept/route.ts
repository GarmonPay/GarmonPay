import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { debitGpayCoins, getUserCoins } from "@/lib/coins";

export async function POST(req: Request) {
  const userId = await getAuthUserIdBearerOrCookie(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: { bet_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const betId = typeof body.bet_id === "string" ? body.bet_id : null;
  if (!betId) return NextResponse.json({ message: "bet_id required" }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const { data: betRaw, error: bErr } = await supabase.from("celo_side_bets").select("*").eq("id", betId).maybeSingle();
  if (bErr || !betRaw) return NextResponse.json({ message: "Entry not found" }, { status: 404 });

  const bet = betRaw as Record<string, unknown>;
  if (String(bet.creator_id) === userId) {
    return NextResponse.json({ message: "You cannot accept your own entry" }, { status: 400 });
  }
  if (String(bet.status) !== "open") {
    return NextResponse.json({ message: "Entry is not open" }, { status: 400 });
  }

  const exp = bet.expires_at ? new Date(String(bet.expires_at)).getTime() : 0;
  if (exp && Date.now() > exp) {
    return NextResponse.json({ message: "Entry expired" }, { status: 400 });
  }

  const roomId = String(bet.room_id);
  const { data: mem } = await supabase.from("celo_room_players").select("id").eq("room_id", roomId).eq("user_id", userId).maybeSingle();
  if (!mem) return NextResponse.json({ message: "Join the room first" }, { status: 403 });

  const amount = Math.floor(Number(bet.amount_cents ?? 0));
  const { gpayCoins } = await getUserCoins(userId);
  if (gpayCoins < amount) {
    return NextResponse.json({ message: "Insufficient GPay Coins (GPC)" }, { status: 400 });
  }

  const debitRef = `celo_side_accept_${betId}_${userId}`;
  const debit = await debitGpayCoins(userId, amount, "C-Lo side entry (match)", debitRef, "celo_sidebet");
  if (!debit.success) {
    return NextResponse.json({ message: debit.message ?? "Debit failed" }, { status: 400 });
  }

  const { data: updated, error: uErr } = await supabase
    .from("celo_side_bets")
    .update({
      acceptor_id: userId,
      status: "matched",
    })
    .eq("id", betId)
    .eq("status", "open")
    .select("*")
    .single();

  if (uErr || !updated) {
    return NextResponse.json({ message: "Could not match entry (it may have been taken)" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    sideBet: updated,
    gpayCoins: (await getUserCoins(userId)).gpayCoins,
  });
}
