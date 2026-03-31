import { NextResponse } from "next/server";
import { evaluateRoll, rollThreeDice } from "@/lib/celo-engine";
import { walletLedgerEntry } from "@/lib/wallet-ledger";
import { getCeloUserId, admin } from "@/lib/celo-server";
import { rotateBankerAfterRound } from "@/lib/celo-banker-rotation";

export async function POST(request: Request) {
  try {
    const userId = await getCeloUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const room_id = typeof body.room_id === "string" ? body.room_id : "";
    if (!room_id) {
      return NextResponse.json({ error: "room_id is required" }, { status: 400 });
    }

    const supabase = admin();

    const { data: room, error: roomErr } = await supabase
      .from("celo_rooms")
      .select("id, banker_id, status, platform_fee_pct, max_bet_cents")
      .eq("id", room_id)
      .maybeSingle();

    if (roomErr || !room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (room.banker_id !== userId) {
      return NextResponse.json({ error: "Only the banker can start a round" }, { status: 403 });
    }

    if (!["waiting", "active", "rolling"].includes(room.status)) {
      return NextResponse.json({ error: "Room cannot start a round in this state" }, { status: 400 });
    }

    const { data: openRound } = await supabase
      .from("celo_rounds")
      .select("id, status")
      .eq("room_id", room_id)
      .in("status", ["betting", "banker_rolling", "player_rolling"])
      .maybeSingle();

    if (openRound) {
      return NextResponse.json({ error: "A round is already in progress" }, { status: 400 });
    }

    const { data: playerRows, error: prErr } = await supabase
      .from("celo_room_players")
      .select("user_id, bet_cents, role")
      .eq("room_id", room_id)
      .eq("role", "player");

    if (prErr || !playerRows?.length) {
      return NextResponse.json({ error: "At least one player with a bet is required" }, { status: 400 });
    }

    const playersWithBet = playerRows.filter((p) => (p.bet_cents ?? 0) > 0);
    if (playersWithBet.length === 0) {
      return NextResponse.json({ error: "At least one player with a bet is required" }, { status: 400 });
    }

    const total_pot_cents = playersWithBet.reduce((s, p) => s + Number(p.bet_cents ?? 0), 0);
    if (total_pot_cents <= 0) {
      return NextResponse.json({ error: "Pot is empty" }, { status: 400 });
    }

    const { data: lastRound } = await supabase
      .from("celo_rounds")
      .select("round_number")
      .eq("room_id", room_id)
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const round_number = (lastRound?.round_number ?? 0) + 1;
    const feePct = Number(room.platform_fee_pct ?? 10);

    /** Never seed with [1,1,1] — that is a real instant-win hand (ACE OUT). Always use CSPRNG first. */
    let bankerRerolls = 0;
    let dice: [number, number, number] = rollThreeDice();
    let ev = evaluateRoll(dice);

    while (ev.result === "no_count") {
      bankerRerolls++;
      if (bankerRerolls >= 3) {
        ev = {
          rollName: "Three No Counts — Banker Loses!",
          result: "instant_loss",
          dice: ev.dice,
        };
        break;
      }
      dice = rollThreeDice();
      ev = evaluateRoll(dice);
    }

    const platform_fee_cents = Math.floor((total_pot_cents * feePct) / 100);
    const net_pot_cents = total_pot_cents - platform_fee_cents;

    const roundStatus = ev.result === "point" ? "player_rolling" : "completed";
    const completedAt = ev.result === "point" ? null : new Date().toISOString();

    const { data: roundRow, error: insRoundErr } = await supabase
      .from("celo_rounds")
      .insert({
        room_id,
        round_number,
        banker_id: room.banker_id,
        status: roundStatus,
        banker_roll: dice,
        banker_roll_name: ev.rollName,
        banker_roll_result: ev.result,
        banker_point: ev.point ?? null,
        total_pot_cents,
        platform_fee_cents,
        completed_at: completedAt,
        banker_rerolls: bankerRerolls,
      })
      .select("id")
      .single();

    if (insRoundErr || !roundRow) {
      return NextResponse.json({ error: insRoundErr?.message ?? "Failed to create round" }, { status: 500 });
    }

    const roundId = roundRow.id;

    await supabase
      .from("celo_rooms")
      .update({
        status: ev.result === "point" ? "rolling" : "active",
        last_activity: new Date().toISOString(),
      })
      .eq("id", room_id);

    await supabase.from("celo_audit_log").insert({
      room_id,
      round_id: roundId,
      user_id: userId,
      action: "round_started",
      details: {
        round_number,
        total_pot_cents,
        banker_roll: dice,
        result: ev.result,
        banker_rerolls: bankerRerolls,
      },
    });

    if (ev.result === "instant_win") {
      const ref = `celo_round_${roundId}_banker_win`;
      const win = await walletLedgerEntry(room.banker_id, "game_win", net_pot_cents, ref);
      if (!win.success) {
        await supabase.from("celo_audit_log").insert({
          room_id,
          round_id: roundId,
          user_id: room.banker_id,
          action: "settlement_failed",
          details: { message: win.message, kind: "banker_win" },
        });
      }
    } else if (ev.result === "instant_loss") {
      let distributed = 0;
      for (let i = 0; i < playersWithBet.length; i++) {
        const p = playersWithBet[i];
        const bet = Number(p.bet_cents ?? 0);
        let share: number;
        if (i === playersWithBet.length - 1) {
          share = net_pot_cents - distributed;
        } else {
          share = Math.floor((net_pot_cents * bet) / total_pot_cents);
          distributed += share;
        }
        if (share > 0) {
          const ref = `celo_round_${roundId}_player_${p.user_id}`;
          const w = await walletLedgerEntry(p.user_id, "game_win", share, ref);
          if (!w.success) {
            await supabase.from("celo_audit_log").insert({
              room_id,
              round_id: roundId,
              user_id: p.user_id,
              action: "settlement_failed",
              details: { message: w.message },
            });
          }
        }
      }
    }

    const { data: roundOut } = await supabase.from("celo_rounds").select("*").eq("id", roundId).single();

    if (ev.result !== "point") {
      await rotateBankerAfterRound(supabase, room_id);
    }

    return NextResponse.json({
      ok: true,
      round: roundOut,
      banker_evaluation: {
        dice,
        rollName: ev.rollName,
        result: ev.result,
        point: ev.point,
        rerolls: bankerRerolls,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
