import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * When the room bank hits zero: remove the old banker from the seat (or assign a bust winner).
 * Server-authoritative — call immediately after `adjustRoomBank` returns `<= 0`.
 *
 * Uses DB RPC `celo_handle_bank_bust_and_transfer` so `celo_room_players` and `celo_rooms` stay in sync.
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
    .select("banker_id, max_players, current_bank_sc")
    .eq("id", roomId)
    .maybeSingle();
  if (!roomRaw) return;

  const previousBankerId = roomRaw.banker_id ? String(roomRaw.banker_id) : null;
  const maxPlayers = Math.floor(Number(roomRaw.max_players) || 10);
  const oldBankAmount = Math.max(
    0,
    Math.floor(Number(roomRaw.current_bank_sc ?? 0))
  );

  const bustParam =
    bustWinnerUserId && String(bustWinnerUserId).trim() !== ""
      ? String(bustWinnerUserId).trim()
      : null;

  const { data: rpcData, error: rpcError } = await admin.rpc(
    "celo_handle_bank_bust_and_transfer",
    {
      p_room_id: roomId,
      p_winner_user_id: bustParam,
      p_max_players: maxPlayers,
      p_action: action,
    }
  );

  if (rpcError) throw new Error(rpcError.message);

  const row = rpcData as {
    success?: boolean;
    banker_id?: string | null;
    action?: string;
  } | null;

  const newBankerId =
    row?.banker_id != null && String(row.banker_id).trim() !== ""
      ? String(row.banker_id)
      : null;

  if (!previousBankerId) {
    console.log("[C-Lo banker bank rule]", {
      roomId,
      bankerId: null,
      userId: null,
      currentBankSc: 0,
      bankBusted: true,
      winnerUserId: bustWinnerUserId,
      action,
    });
    console.log("[C-Lo Bank Takeover]", {
      roomId,
      oldBankerId: previousBankerId,
      newBankerId: null,
      winningPlayerId: bustWinnerUserId ?? null,
      oldBankAmount,
      newBankAmount: 0,
      roomStatus: "waiting",
    });
    return;
  }

  if (newBankerId) {
    console.log("[C-Lo banker bank rule]", {
      roomId,
      bankerId: newBankerId,
      userId: previousBankerId,
      currentBankSc: 0,
      bankBusted: true,
      winnerUserId: newBankerId,
      action,
    });
    console.log("[C-Lo Bank Takeover]", {
      roomId,
      oldBankerId: previousBankerId,
      newBankerId,
      winningPlayerId: newBankerId,
      oldBankAmount,
      newBankAmount: 0,
      room: { status: "bank_takeover" },
    });
    return;
  }

  console.log("[C-Lo banker bank rule]", {
    roomId,
    bankerId: null,
    userId: previousBankerId,
    currentBankSc: 0,
    bankBusted: true,
    winnerUserId: null,
    action,
  });
  console.log("[C-Lo Bank Takeover]", {
    roomId,
    oldBankerId: previousBankerId,
    newBankerId: null,
    winningPlayerId: null,
    oldBankAmount,
    newBankAmount: 0,
    roomStatus: "waiting",
  });
}
