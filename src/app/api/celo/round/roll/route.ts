import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { creditCoins, getUserCoins } from "@/lib/coins";
import {
  rollThreeDice,
  evaluateRoll,
  calculatePayout,
  comparePointToBanker,
  type DiceValue,
} from "@/lib/celo-engine";
import { mergeCeloRoomUpdate, normalizeCeloRoomRow } from "@/lib/celo-room-schema";

type RoomRow = Record<string, unknown> & { id: string; banker_id?: string; current_bank_sc?: number; current_bank_cents?: number };
type RoundRow = Record<string, unknown> & {
  id: string;
  room_id: string;
  status: string;
  banker_id: string | null;
  prize_pool_sc: number;
  platform_fee_sc: number;
  banker_point: number | null;
  banker_rerolls: number;
  current_player_seat: number | null;
  player_celo_offer?: boolean;
  player_celo_expires_at?: string | null;
  roll_processing?: boolean;
};

function bankAmount(room: RoomRow): number {
  return Math.floor(Number(room.current_bank_sc ?? room.current_bank_cents ?? 0));
}

async function completeRound(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  roundId: string,
  roomId: string,
  feeSc: number
) {
  await supabase
    .from("celo_rounds")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      platform_fee_sc: feeSc,
      roll_processing: false,
      roller_user_id: null,
    })
    .eq("id", roundId);

  await supabase
    .from("celo_rooms")
    .update({ status: "active", last_activity: new Date().toISOString() })
    .eq("id", roomId);
}

export async function POST(req: Request) {
  const userId = await getAuthUserIdBearerOrCookie(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: { room_id?: unknown; round_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const roomId = typeof body.room_id === "string" ? body.room_id : null;
  const roundId = typeof body.round_id === "string" ? body.round_id : null;
  if (!roomId || !roundId) return NextResponse.json({ message: "room_id and round_id required" }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const { data: roundRaw, error: roundErr } = await supabase.from("celo_rounds").select("*").eq("id", roundId).maybeSingle();
  if (roundErr || !roundRaw) return NextResponse.json({ message: "Round not found" }, { status: 404 });

  const round = roundRaw as RoundRow;
  if (String(round.room_id) !== roomId) return NextResponse.json({ message: "Invalid round" }, { status: 400 });
  if (round.status === "completed") return NextResponse.json({ message: "Round already completed" }, { status: 400 });
  if (round.roll_processing) return NextResponse.json({ message: "Roll in progress" }, { status: 409 });

  const { data: roomRaw } = await supabase.from("celo_rooms").select("*").eq("id", roomId).maybeSingle();
  if (!roomRaw) return NextResponse.json({ message: "Room not found" }, { status: 404 });
  const room = roomRaw as RoomRow;

  const { data: membership } = await supabase
    .from("celo_room_players")
    .select("role, seat_number, entry_sc")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) return NextResponse.json({ message: "Not in this room" }, { status: 403 });

  await supabase
    .from("celo_rounds")
    .update({ roll_processing: true, roller_user_id: userId, updated_at: new Date().toISOString() })
    .eq("id", roundId);

  const prizePool = Math.floor(Number(round.prize_pool_sc ?? 0));

  try {
    if (round.status === "banker_rolling") {
      if (String(room.banker_id) !== userId) {
        await supabase.from("celo_rounds").update({ roll_processing: false }).eq("id", roundId);
        return NextResponse.json({ message: "Banker's turn to roll" }, { status: 403 });
      }

      const dice = rollThreeDice();
      const ev = evaluateRoll(dice);
      const diceArr = [dice[0], dice[1], dice[2]];

      const rerolls = ev.result === "no_count" ? Math.floor(Number(round.banker_rerolls ?? 0)) + 1 : Math.floor(Number(round.banker_rerolls ?? 0));

      await supabase
        .from("celo_rounds")
        .update({
          banker_dice: diceArr,
          banker_dice_name: ev.rollName,
          banker_dice_result: ev.result,
          banker_point: ev.result === "point" ? ev.point ?? null : null,
          banker_rerolls: rerolls,
        })
        .eq("id", roundId);

      if (ev.result === "no_count") {
        await supabase.from("celo_rounds").update({ roll_processing: false }).eq("id", roundId);
        const bal = await getUserCoins(userId);
        return NextResponse.json({
          ok: true,
          phase: "banker",
          dice: diceArr,
          rollName: ev.rollName,
          result: ev.result,
          outcome: "reroll",
          gpayCoins: bal.gpayCoins,
        });
      }

      if (ev.result === "instant_win") {
        const fee = Math.floor((prizePool * 10) / 100);
        const net = prizePool - fee;
        const bankerId = String(room.banker_id ?? "");
        const credit = await creditCoins(
          bankerId,
          0,
          net,
          `C-Lo round ${roundId} (banker table)` ,
          `celo_round_banker_win_${roundId}`,
          "celo_payout"
        );
        if (!credit.success) {
          await supabase.from("celo_rounds").update({ roll_processing: false }).eq("id", roundId);
          return NextResponse.json({ message: credit.message ?? "Credit failed" }, { status: 500 });
        }

        const newBank = bankAmount(room) + net;
        const roomPatch: Record<string, unknown> = mergeCeloRoomUpdate(newBank, {
          last_activity: new Date().toISOString(),
          last_round_was_celo: ev.isCelo,
          banker_celo_at: ev.isCelo ? new Date().toISOString() : room.banker_celo_at,
        });

        await supabase.from("celo_rooms").update(roomPatch).eq("id", roomId);
        await completeRound(supabase, roundId, roomId, fee);

        const bal = await getUserCoins(userId);
        return NextResponse.json({
          ok: true,
          phase: "banker",
          dice: diceArr,
          rollName: ev.rollName,
          result: ev.result,
          outcome: "banker_table",
          isCelo: ev.isCelo,
          gpayCoins: bal.gpayCoins,
          room: normalizeCeloRoomRow((await supabase.from("celo_rooms").select("*").eq("id", roomId).single()).data as Record<string, unknown>),
        });
      }

      if (ev.result === "instant_loss") {
        const { data: players } = await supabase
          .from("celo_room_players")
          .select("user_id, entry_sc")
          .eq("room_id", roomId)
          .eq("role", "player");

        for (const p of players ?? []) {
          const uid = String((p as { user_id: string }).user_id);
          const entry = Math.floor(Number((p as { entry_sc?: number }).entry_sc ?? 0));
          if (entry <= 0) continue;
          const { net } = calculatePayout(entry);
          await creditCoins(uid, 0, net, `C-Lo round ${roundId} (player earns)`, `celo_round_player_earn_${roundId}_${uid}`, "celo_payout");
        }

        await completeRound(supabase, roundId, roomId, Math.floor((prizePool * 10) / 100));

        const bal = await getUserCoins(userId);
        return NextResponse.json({
          ok: true,
          phase: "banker",
          dice: diceArr,
          rollName: ev.rollName,
          result: ev.result,
          outcome: "players_earn",
          gpayCoins: bal.gpayCoins,
        });
      }

      if (ev.result === "point") {
        await supabase
          .from("celo_rounds")
          .update({
            status: "player_rolling",
            roll_processing: false,
            banker_point: ev.point ?? null,
          })
          .eq("id", roundId);

        const bal = await getUserCoins(userId);
        return NextResponse.json({
          ok: true,
          phase: "banker",
          dice: diceArr,
          rollName: ev.rollName,
          result: ev.result,
          bankerPoint: ev.point,
          gpayCoins: bal.gpayCoins,
        });
      }
    }

    if (round.status === "player_rolling") {
      const seatNeed = Math.floor(Number(round.current_player_seat ?? 0));
      const { data: turnPlayer } = await supabase
        .from("celo_room_players")
        .select("user_id, entry_sc, seat_number")
        .eq("room_id", roomId)
        .eq("role", "player")
        .eq("seat_number", seatNeed)
        .maybeSingle();

      if (!turnPlayer || String((turnPlayer as { user_id: string }).user_id) !== userId) {
        await supabase.from("celo_rounds").update({ roll_processing: false }).eq("id", roundId);
        return NextResponse.json({ message: "Not your turn to roll" }, { status: 403 });
      }

      const entry = Math.floor(Number((turnPlayer as { entry_sc?: number }).entry_sc ?? 0));
      const dice = rollThreeDice();
      const ev = evaluateRoll(dice);
      const diceArr = [dice[0], dice[1], dice[2]] as [DiceValue, DiceValue, DiceValue];

      const bankerPoint = Math.floor(Number(round.banker_point ?? 0));

      let outcome: "win" | "loss" | "reroll" = "reroll";
      let payout = 0;

      if (ev.result === "no_count") {
        await supabase.from("celo_player_rolls").insert({
          round_id: roundId,
          room_id: roomId,
          user_id: userId,
          dice: diceArr,
          roll_name: ev.rollName,
          roll_result: ev.result,
          point: null,
          entry_sc: entry,
          outcome: "reroll",
          payout_sc: 0,
          platform_fee_sc: 0,
          reroll_count: 1,
        });
        await supabase.from("celo_rounds").update({ roll_processing: false }).eq("id", roundId);
        const bal = await getUserCoins(userId);
        return NextResponse.json({
          ok: true,
          phase: "player",
          dice: diceArr,
          rollName: ev.rollName,
          result: ev.result,
          outcome: "reroll",
          gpayCoins: bal.gpayCoins,
        });
      }

      if (ev.result === "instant_win") {
        const { net, fee } = calculatePayout(entry);
        await creditCoins(userId, 0, net, `C-Lo round ${roundId} (player earns)`, `celo_player_win_${roundId}_${userId}`, "celo_payout");
        payout = net;
        outcome = "win";

        const expires = new Date(Date.now() + 30_000).toISOString();
        await supabase.from("celo_player_rolls").insert({
          round_id: roundId,
          room_id: roomId,
          user_id: userId,
          dice: diceArr,
          roll_name: ev.rollName,
          roll_result: ev.result,
          point: null,
          entry_sc: entry,
          outcome: "win",
          payout_sc: net,
          platform_fee_sc: fee,
          reroll_count: 0,
        });

        const roundPatch: Record<string, unknown> = { roll_processing: false };
        if (ev.isCelo) {
          roundPatch.player_celo_offer = true;
          roundPatch.player_celo_expires_at = expires;
        }

        const { data: others } = await supabase
          .from("celo_room_players")
          .select("seat_number")
          .eq("room_id", roomId)
          .eq("role", "player")
          .gt("entry_sc", 0);

        const seats = (others ?? [])
          .map((o) => Math.floor(Number((o as { seat_number?: number }).seat_number)))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b);

        const next = seats.filter((s) => s > seatNeed)[0];
        if (next !== undefined) {
          await supabase.from("celo_rounds").update({ ...roundPatch, current_player_seat: next }).eq("id", roundId);
        } else {
          await supabase.from("celo_rounds").update(roundPatch).eq("id", roundId);
          await completeRound(supabase, roundId, roomId, Math.floor((prizePool * 10) / 100));
        }

        const bal = await getUserCoins(userId);
        return NextResponse.json({
          ok: true,
          phase: "player",
          dice: diceArr,
          rollName: ev.rollName,
          result: ev.result,
          outcome,
          player_can_become_banker: ev.isCelo,
          payout_sc: payout,
          gpayCoins: bal.gpayCoins,
        });
      }

      if (ev.result === "instant_loss") {
        outcome = "loss";
        const nb = bankAmount(room) + entry;
        await supabase.from("celo_rooms").update(mergeCeloRoomUpdate(nb, { last_activity: new Date().toISOString() })).eq("id", roomId);

        await supabase.from("celo_player_rolls").insert({
          round_id: roundId,
          room_id: roomId,
          user_id: userId,
          dice: diceArr,
          roll_name: ev.rollName,
          roll_result: ev.result,
          point: null,
          entry_sc: entry,
          outcome: "loss",
          payout_sc: 0,
          platform_fee_sc: 0,
          reroll_count: 0,
        });

        const { data: others } = await supabase
          .from("celo_room_players")
          .select("seat_number")
          .eq("room_id", roomId)
          .eq("role", "player")
          .gt("entry_sc", 0);

        const seats = (others ?? [])
          .map((o) => Math.floor(Number((o as { seat_number?: number }).seat_number)))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b);

        const next = seats.filter((s) => s > seatNeed)[0];
        if (next !== undefined) {
          await supabase.from("celo_rounds").update({ current_player_seat: next, roll_processing: false }).eq("id", roundId);
        } else {
          await completeRound(supabase, roundId, roomId, Math.floor((prizePool * 10) / 100));
        }

        const bal = await getUserCoins(userId);
        return NextResponse.json({
          ok: true,
          phase: "player",
          dice: diceArr,
          rollName: ev.rollName,
          result: ev.result,
          outcome,
          gpayCoins: bal.gpayCoins,
        });
      }

      if (ev.result === "point") {
        const pPoint = Math.floor(ev.point ?? 0);
        const cmp = comparePointToBanker(pPoint, bankerPoint);
        if (cmp === "player") {
          const { net, fee } = calculatePayout(entry);
          await creditCoins(userId, 0, net, `C-Lo round ${roundId} (player earns)`, `celo_player_point_${roundId}_${userId}`, "celo_payout");
          payout = net;
          outcome = "win";
          await supabase.from("celo_player_rolls").insert({
            round_id: roundId,
            room_id: roomId,
            user_id: userId,
            dice: diceArr,
            roll_name: ev.rollName,
            roll_result: ev.result,
            point: pPoint,
            entry_sc: entry,
            outcome: "win",
            payout_sc: net,
            platform_fee_sc: fee,
            reroll_count: 0,
          });
        } else {
          outcome = "loss";
          const nb = bankAmount(room) + entry;
          await supabase.from("celo_rooms").update(mergeCeloRoomUpdate(nb, { last_activity: new Date().toISOString() })).eq("id", roomId);
          await supabase.from("celo_player_rolls").insert({
            round_id: roundId,
            room_id: roomId,
            user_id: userId,
            dice: diceArr,
            roll_name: ev.rollName,
            roll_result: ev.result,
            point: pPoint,
            entry_sc: entry,
            outcome: "loss",
            payout_sc: 0,
            platform_fee_sc: 0,
            reroll_count: 0,
          });
        }

        const { data: others } = await supabase
          .from("celo_room_players")
          .select("seat_number")
          .eq("room_id", roomId)
          .eq("role", "player")
          .gt("entry_sc", 0);

        const seats = (others ?? [])
          .map((o) => Math.floor(Number((o as { seat_number?: number }).seat_number)))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b);

        const next = seats.filter((s) => s > seatNeed)[0];
        if (next !== undefined) {
          await supabase.from("celo_rounds").update({ current_player_seat: next, roll_processing: false }).eq("id", roundId);
        } else {
          await completeRound(supabase, roundId, roomId, Math.floor((prizePool * 10) / 100));
        }

        const bal = await getUserCoins(userId);
        return NextResponse.json({
          ok: true,
          phase: "player",
          dice: diceArr,
          rollName: ev.rollName,
          result: ev.result,
          outcome,
          payout_sc: payout,
          gpayCoins: bal.gpayCoins,
        });
      }
    }

    await supabase.from("celo_rounds").update({ roll_processing: false }).eq("id", roundId);
    return NextResponse.json({ message: "Unhandled round state" }, { status: 500 });
  } catch (e) {
    await supabase.from("celo_rounds").update({ roll_processing: false }).eq("id", roundId);
    console.error("[celo roll]", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
