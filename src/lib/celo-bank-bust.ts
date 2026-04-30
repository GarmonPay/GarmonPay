import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCeloUserId } from "@/lib/celo-player-state";

async function nextAvailablePlayerSeat(
  admin: SupabaseClient,
  roomId: string,
  maxPlayers: number
): Promise<number> {
  const { data: seats } = await admin
    .from("celo_room_players")
    .select("seat_number")
    .eq("room_id", roomId);
  const used = new Set(
    (seats ?? [])
      .map((s) => s.seat_number as number | null)
      .filter((n) => n != null)
  );
  const cap = Math.max(2, Math.min(99, maxPlayers || 10));
  for (let s = 1; s < cap; s += 1) {
    if (!used.has(s)) return s;
  }
  return 1;
}

async function swapBankerSeatRoles(
  admin: SupabaseClient,
  roomId: string,
  oldBankerId: string,
  newBankerId: string,
  maxPlayers: number
): Promise<void> {
  const nextSeat = await nextAvailablePlayerSeat(admin, roomId, maxPlayers);
  await admin
    .from("celo_room_players")
    .update({ role: "player", seat_number: nextSeat })
    .eq("room_id", roomId)
    .eq("user_id", oldBankerId);
  await admin
    .from("celo_room_players")
    .update({ role: "banker", seat_number: 0 })
    .eq("room_id", roomId)
    .eq("user_id", newBankerId);
}

/**
 * When the room bank hits zero: remove the old banker from the seat (or assign a bust winner).
 * Server-authoritative — call immediately after `adjustRoomBank` returns `<= 0`.
 */
export async function handleCeloBankBustAndBankerTransfer(params: {
  admin: SupabaseClient;
  roomId: string;
  /** Bank balance after settlement (`adjustRoomBank` result). */
  newBankSc: number;
  /** Player who took the last bank money (single winner); omit for multi-way instant_loss with no pick. */
  bustWinnerUserId: string | null;
  action: string;
}): Promise<void> {
  const { admin, roomId, newBankSc, bustWinnerUserId, action } = params;
  if (newBankSc > 0) return;

  const { data: roomRaw } = await admin
    .from("celo_rooms")
    .select("id, banker_id, max_players, current_bank_sc, status")
    .eq("id", roomId)
    .maybeSingle();
  if (!roomRaw) return;

  const room = roomRaw as {
    banker_id: string | null;
    max_players?: number;
  };
  const previousBankerId = room.banker_id ? String(room.banker_id) : null;
  const maxPlayers = Math.floor(Number(room.max_players) || 10);

  if (!previousBankerId) {
    await admin
      .from("celo_rooms")
      .update({
        current_bank_sc: 0,
        current_bank_cents: 0,
        bank_busted: true,
      })
      .eq("id", roomId);
    console.log("[C-Lo banker bank rule]", {
      roomId,
      bankerId: null,
      userId: null,
      currentBankSc: 0,
      bankBusted: true,
      winnerUserId: bustWinnerUserId,
      action,
    });
    return;
  }

  const winner =
    bustWinnerUserId &&
    normalizeCeloUserId(bustWinnerUserId) !==
      normalizeCeloUserId(previousBankerId)
      ? bustWinnerUserId
      : null;

  if (winner) {
    await swapBankerSeatRoles(
      admin,
      roomId,
      previousBankerId,
      winner,
      maxPlayers
    );
    await admin
      .from("celo_rooms")
      .update({
        banker_id: winner,
        current_bank_sc: 0,
        current_bank_cents: 0,
        bank_busted: true,
        status: "waiting",
        last_activity: new Date().toISOString(),
      })
      .eq("id", roomId);
    console.log("[C-Lo banker bank rule]", {
      roomId,
      bankerId: winner,
      userId: previousBankerId,
      currentBankSc: 0,
      bankBusted: true,
      winnerUserId: winner,
      action,
    });
    return;
  }

  await admin
    .from("celo_room_players")
    .update({ role: "player", seat_number: await nextAvailablePlayerSeat(admin, roomId, maxPlayers) })
    .eq("room_id", roomId)
    .eq("user_id", previousBankerId);

  await admin
    .from("celo_rooms")
    .update({
      banker_id: null,
      current_bank_sc: 0,
      current_bank_cents: 0,
      bank_busted: true,
    })
    .eq("id", roomId);

  console.log("[C-Lo banker bank rule]", {
    roomId,
    bankerId: null,
    userId: previousBankerId,
    currentBankSc: 0,
    bankBusted: true,
    winnerUserId: null,
    action,
  });
}
