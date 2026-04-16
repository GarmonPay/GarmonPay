"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DM_Sans, Cinzel_Decorative } from "next/font/google";
import { createBrowserClient } from "@/lib/supabase";
import CeloTable from "@/components/celo/CeloTable";
import CeloChat from "@/components/celo/CeloChat";
import SideBetPanel from "@/components/celo/SideBetPanel";
import type { CeloMessage, CeloPlayer, CeloRoom, CeloRound, CeloSideBet } from "@/types/celo";
import type { Dice3DType } from "@/components/celo/Dice3D";
import { CELO_ROLL_ANIMATION_DURATION_MS } from "@/lib/celo-roll-sync-constants";

const VoiceChat = dynamic(() => import("@/components/celo/VoiceChat"), { ssr: false });

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });
const cinzel = Cinzel_Decorative({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });

function mapRoom(raw: Record<string, unknown>): CeloRoom {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    creator_id: String(raw.creator_id ?? ""),
    banker_id: String(raw.banker_id ?? ""),
    status: String(raw.status ?? ""),
    room_type: String(raw.room_type ?? "public"),
    join_code: raw.join_code != null ? String(raw.join_code) : null,
    minimum_entry_sc: Number(raw.minimum_entry_sc ?? raw.min_bet_cents ?? 0),
    current_bank_sc: Number(raw.current_bank_sc ?? raw.current_bank_cents ?? 0),
    total_rounds: Number(raw.total_rounds ?? 0),
    created_at: String(raw.created_at ?? ""),
    last_activity: String(raw.last_activity ?? ""),
    max_players: Number(raw.max_players ?? 6),
    last_round_was_celo: Boolean(raw.last_round_was_celo),
    banker_celo_at: raw.banker_celo_at != null ? String(raw.banker_celo_at) : null,
    platform_fee_pct: Number(raw.platform_fee_pct ?? 10),
    max_bet_cents: Number(raw.max_bet_cents ?? 0),
    current_bank_cents: Number(raw.current_bank_cents ?? raw.current_bank_sc ?? 0),
    banker_reserve_sc: Number(raw.banker_reserve_sc ?? 0),
    no_short_stop: Boolean(raw.no_short_stop),
  };
}

function mapPlayerRow(row: Record<string, unknown>): CeloPlayer {
  const u = row.users as { id?: string; full_name?: string | null; email?: string | null } | undefined;
  return {
    id: String(row.id),
    room_id: String(row.room_id),
    user_id: String(row.user_id),
    role: (row.role === "banker" || row.role === "spectator" ? row.role : "player") as CeloPlayer["role"],
    seat_number: Number(row.seat_number ?? 0),
    entry_sc: Number(row.entry_sc ?? row.bet_cents ?? 0),
    dice_type: String(row.dice_type ?? "standard"),
    dice_quantity: Number(row.dice_quantity ?? 1),
    dice_expires_at: row.dice_expires_at != null ? String(row.dice_expires_at) : null,
    joined_at: String(row.joined_at ?? ""),
    user: u
      ? {
          id: String(u.id ?? row.user_id),
          full_name: String(u.full_name ?? ""),
          email: String(u.email ?? ""),
        }
      : undefined,
  };
}

function mapRound(raw: Record<string, unknown> | null): CeloRound | null {
  if (!raw) return null;
  const dice = raw.banker_dice as number[] | null;
  return {
    id: String(raw.id),
    room_id: String(raw.room_id),
    round_number: Number(raw.round_number ?? 0),
    banker_id: String(raw.banker_id ?? ""),
    status: String(raw.status ?? ""),
    banker_dice: Array.isArray(dice) ? dice : null,
    banker_roll_name: raw.banker_roll_name != null ? String(raw.banker_roll_name) : raw.banker_dice_name != null ? String(raw.banker_dice_name) : null,
    banker_roll_result: raw.banker_roll_result != null ? String(raw.banker_roll_result) : raw.banker_dice_result != null ? String(raw.banker_dice_result) : null,
    banker_point: raw.banker_point != null ? Number(raw.banker_point) : null,
    current_player_seat: raw.current_player_seat != null ? Number(raw.current_player_seat) : null,
    prize_pool_sc: Number(raw.prize_pool_sc ?? raw.total_pot_cents ?? 0),
    platform_fee_sc: Number(raw.platform_fee_sc ?? 0),
    banker_winnings_sc: Number(raw.banker_winnings_sc ?? 0),
    bank_covered: Boolean(raw.bank_covered),
    covered_by: raw.covered_by != null ? String(raw.covered_by) : null,
    created_at: String(raw.created_at ?? ""),
    completed_at: raw.completed_at != null ? String(raw.completed_at) : null,
  };
}

export default function CeloDashboardRoomPage() {
  const params = useParams();
  const roomId = (Array.isArray(params.roomId) ? params.roomId[0] : params.roomId) as string;
  const router = useRouter();
  const supabase = useMemo(() => createBrowserClient(), []);

  const [room, setRoom] = useState<CeloRoom | null>(null);
  const [players, setPlayers] = useState<CeloPlayer[]>([]);
  const [round, setRound] = useState<CeloRound | null>(null);
  const [messages, setMessages] = useState<CeloMessage[]>([]);
  const [sideBets, setSideBets] = useState<CeloSideBet[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [userName, setUserName] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [rolling, setRolling] = useState(false);
  const [dice, setDice] = useState<[number, number, number]>([1, 1, 1]);
  const [rollName, setRollName] = useState<string | null>(null);
  const [rollResult, setRollResult] = useState<string | null>(null);

  const [diceShopOpen, setDiceShopOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"bets" | "chat" | "voice">("bets");
  const [canLowerBank, setCanLowerBank] = useState(false);
  const [lowerTimer, setLowerTimer] = useState(0);
  const [showBecomeBanker, setShowBecomeBanker] = useState(false);
  const [becomeTimer, setBecomeTimer] = useState(0);

  const myPlayer = players.find((p) => p.user_id === userId);
  const myEntry = myPlayer?.entry_sc ?? 0;
  const isBanker = room?.banker_id === userId;

  const prizePoolSc = useMemo(() => {
    if (round?.prize_pool_sc && round.prize_pool_sc > 0) return round.prize_pool_sc;
    return players.filter((p) => p.role === "player").reduce((s, p) => s + (p.entry_sc ?? 0), 0);
  }, [round, players]);

  const mapDiceType = useCallback((t: string | undefined): Dice3DType => {
    const x = String(t ?? "standard").toLowerCase();
    const allowed: Dice3DType[] = ["standard", "gold", "diamond", "blood", "street", "midnight", "fire"];
    return allowed.includes(x as Dice3DType) ? (x as Dice3DType) : "standard";
  }, []);

  const fetchAll = useCallback(async () => {
    if (!supabase || !roomId) return;
    setLoadError(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      router.push("/login");
      return;
    }
    setUserId(session.user.id);
    setAccessToken(session.access_token ?? null);
    setUserName(
      (session.user.user_metadata?.full_name as string | undefined)?.trim() ||
        session.user.email?.split("@")[0] ||
        "Player"
    );

    try {
      const [snapRes, balRes] = await Promise.all([
        fetch(`/api/celo/room/${encodeURIComponent(roomId)}/snapshot`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        supabase.from("users").select("sweeps_coins, balance_cents").eq("id", session.user.id).maybeSingle(),
      ]);

      if (snapRes.status === 401) {
        router.push("/login");
        return;
      }
      if (snapRes.status === 403 || snapRes.status === 404) {
        setLoadError("Room not found or access denied.");
        setLoading(false);
        return;
      }
      if (!snapRes.ok) {
        setLoadError("Could not load room.");
        setLoading(false);
        return;
      }

      const snap = (await snapRes.json()) as {
        room?: Record<string, unknown>;
        players?: Record<string, unknown>[];
        round?: Record<string, unknown> | null;
        chat?: CeloMessage[];
      };

      if (!snap.room) {
        setLoadError("Room not found.");
        setLoading(false);
        return;
      }

      setRoom(mapRoom(snap.room));
      setPlayers((snap.players ?? []).map((p) => mapPlayerRow(p)));
      setRound(mapRound(snap.round ?? null));
      if (snap.chat) setMessages(snap.chat as CeloMessage[]);

      const br = balRes.data as { sweeps_coins?: number; balance_cents?: number } | null;
      setBalance(Number(br?.sweeps_coins ?? br?.balance_cents ?? 0));

      const { data: bets } = await supabase.from("celo_side_bets").select("*").eq("room_id", roomId).order("created_at", { ascending: false }).limit(40);

      if (bets) {
        setSideBets(
          bets.map((b: Record<string, unknown>) => ({
            id: String(b.id),
            room_id: String(b.room_id),
            round_id: b.round_id != null ? String(b.round_id) : null,
            creator_id: String(b.creator_id),
            acceptor_id: b.acceptor_id != null ? String(b.acceptor_id) : null,
            bet_type: String(b.bet_type ?? ""),
            target_player_id: b.target_player_id != null ? String(b.target_player_id) : null,
            specific_point: b.specific_point != null ? Number(b.specific_point) : null,
            amount_sc: Number(b.amount_cents ?? b.amount_sc ?? 0),
            odds_multiplier: Number(b.odds_multiplier ?? 2),
            status: String(b.status ?? "open"),
            winner_id: b.winner_id != null ? String(b.winner_id) : null,
            platform_fee_sc: Number(b.platform_fee_sc ?? 0),
            payout_sc: Number(b.payout_sc ?? 0),
            expires_at: String(b.expires_at ?? ""),
            created_at: String(b.created_at ?? ""),
            settled_at: b.settled_at != null ? String(b.settled_at) : null,
            creator: { full_name: "Player" },
          })),
        );
      }

      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoadError("Failed to load room.");
      setLoading(false);
    }
  }, [roomId, router, supabase]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!supabase || !roomId) return;
    const ch = supabase.channel(`celo-dash-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_rooms", filter: `id=eq.${roomId}` },
        (p) => {
          if (p.new) setRoom(mapRoom(p.new as Record<string, unknown>));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_room_players", filter: `room_id=eq.${roomId}` },
        () => {
          void fetchAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_rounds", filter: `room_id=eq.${roomId}` },
        (p) => {
          if (p.new) setRound(mapRound(p.new as Record<string, unknown>));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "celo_chat", filter: `room_id=eq.${roomId}` },
        async (p) => {
          const row = p.new as Record<string, unknown>;
          const uid = String(row.user_id ?? "");
          const { data: u } = await supabase.from("users").select("full_name, email").eq("id", uid).maybeSingle();
          const ur = u as { full_name?: string | null; email?: string | null } | null;
          const msg: CeloMessage = {
            id: String(row.id),
            room_id: roomId,
            user_id: uid,
            message: String(row.message ?? ""),
            is_system: false,
            created_at: String(row.created_at ?? ""),
            user_name: ur?.full_name?.trim() || ur?.email?.split("@")[0] || "Player",
          };
          setMessages((prev) => [...prev.slice(-60), msg]);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_side_bets", filter: `room_id=eq.${roomId}` },
        () => {
          void fetchAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "celo_player_rolls", filter: `room_id=eq.${roomId}` },
        async (p) => {
          const row = p.new as Record<string, unknown>;
          const roller = String(row.user_id ?? "");
          if (roller === userId) return;
          setRolling(true);
          setRollName(null);
          setRollResult(null);
          await new Promise<void>((resolve) => setTimeout(resolve, CELO_ROLL_ANIMATION_DURATION_MS));
          const diceRaw = row.dice as number[] | undefined;
          if (Array.isArray(diceRaw) && diceRaw.length === 3) {
            setDice([diceRaw[0]!, diceRaw[1]!, diceRaw[2]!]);
          }
          setRollName(String(row.roll_name ?? ""));
          setRollResult(String(row.outcome ?? row.roll_result ?? ""));
          setRolling(false);
          void fetchAll();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, supabase, fetchAll, userId]);

  const handleRoll = useCallback(async () => {
    if (!accessToken) return;
    setRolling(true);
    setRollName(null);
    setRollResult(null);
    try {
      const [, data] = await Promise.all([
        new Promise<void>((resolve) => setTimeout(resolve, CELO_ROLL_ANIMATION_DURATION_MS)),
        fetch("/api/celo/round/roll", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ room_id: roomId }),
        }).then((r) => r.json()),
      ]);

      const res = data as Record<string, unknown>;
      if (res.error) {
        setRollName("Could not roll — try again");
        setRolling(false);
        return;
      }
      const d = res.dice as number[] | undefined;
      if (Array.isArray(d) && d.length === 3) {
        setDice([d[0]!, d[1]!, d[2]!]);
      }
      setRollName((res.rollName as string) ?? null);
      setRollResult(String(res.outcome ?? res.result ?? ""));

      if (res.banker_can_adjust_bank || res.banker_can_lower_bank) {
        setCanLowerBank(true);
        setLowerTimer(60);
      }
      if (res.player_can_become_banker) {
        setShowBecomeBanker(true);
        setBecomeTimer(30);
      }

      await fetchAll();
    } catch {
      setRollName("Error — try again");
    } finally {
      setRolling(false);
    }
  }, [accessToken, roomId, fetchAll]);

  const handleStartRound = useCallback(async () => {
    if (!accessToken) return;
    await fetch("/api/celo/round/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ room_id: roomId }),
    });
    await fetchAll();
  }, [accessToken, roomId, fetchAll]);

  const sendChat = useCallback(
    async (text: string) => {
      if (!accessToken) return;
      const res = await fetch(`/api/celo/room/${encodeURIComponent(roomId)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) await fetchAll();
    },
    [accessToken, roomId, fetchAll]
  );

  const purchaseDice = useCallback(
    async (diceType: Dice3DType, quantity: number) => {
      if (!accessToken) return;
      await fetch("/api/celo/dice/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ room_id: roomId, dice_type: diceType, quantity }),
      });
      setDiceShopOpen(false);
      await fetchAll();
    },
    [accessToken, roomId, fetchAll]
  );

  const lowerBank = useCallback(
    async (amountSc: number) => {
      if (!accessToken) return;
      await fetch("/api/celo/room/lower-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          room_id: roomId,
          new_bank_sc: amountSc,
          new_minimum_sc: room?.minimum_entry_sc ?? 500,
        }),
      });
      setCanLowerBank(false);
      await fetchAll();
    },
    [accessToken, roomId, room?.minimum_entry_sc, fetchAll]
  );

  const coverBank = useCallback(async () => {
    if (!accessToken) return;
    await fetch("/api/celo/room/cover-bank", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ room_id: roomId }),
    });
    await fetchAll();
  }, [accessToken, roomId, fetchAll]);

  useEffect(() => {
    if (!canLowerBank || lowerTimer <= 0) return;
    const t = setInterval(() => setLowerTimer((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [canLowerBank, lowerTimer]);

  useEffect(() => {
    if (!showBecomeBanker || becomeTimer <= 0) return;
    const t = setInterval(() => setBecomeTimer((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [showBecomeBanker, becomeTimer]);

  if (loading) {
    return (
      <div className={`${dmSans.className} flex min-h-screen items-center justify-center bg-[#05010F] text-slate-200`}>
        Loading table…
      </div>
    );
  }

  if (loadError || !room) {
    return (
      <div className={`${dmSans.className} flex min-h-screen flex-col items-center justify-center gap-4 bg-[#05010F] text-slate-200`}>
        <p className="text-red-400">{loadError ?? "Room unavailable"}</p>
        <button type="button" className="rounded-lg bg-amber-500/20 px-4 py-2 text-amber-200" onClick={() => router.push("/dashboard/games/celo")}>
          Back to lobby
        </button>
      </div>
    );
  }

  const spectator = myPlayer?.role === "spectator";

  return (
    <div className={`${dmSans.className} min-h-screen bg-[#05010F] text-slate-100`}>
      <div className="hidden min-h-screen lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-0">
        <CeloTable
          room={room}
          currentRound={round}
          players={players}
          currentUserId={userId}
          onRoll={handleRoll}
          onStartRound={handleStartRound}
          rolling={rolling}
          dice={dice}
          rollName={rollName}
          rollResult={rollResult}
          myBalance={balance}
          myEntry={myEntry}
          prizePoolSc={prizePoolSc}
          canLowerBank={canLowerBank}
          lowerBankSecondsLeft={lowerTimer}
          onLowerBank={(amount) => void lowerBank(amount)}
          showCoverBank={Boolean(round && !round.bank_covered && balance >= room.current_bank_sc)}
          coverBankAmountSc={room.current_bank_sc}
          onCoverBank={() => void coverBank()}
          onOpenDiceShop={() => setDiceShopOpen(true)}
          diceShopOpen={diceShopOpen}
          onCloseDiceShop={() => setDiceShopOpen(false)}
          onPurchaseDice={(dt, q) => void purchaseDice(dt, q)}
          myDiceType={mapDiceType(myPlayer?.dice_type)}
          isBanker={isBanker}
        />
        <aside className="flex flex-col gap-3 border-l border-violet-500/20 bg-[#08051a]/95 p-3">
          <h2 className={`${cinzel.className} text-center text-sm text-amber-200/90`}>Table</h2>
          <VoiceChat roomId={roomId} userId={userId} userName={userName} isSpectator={spectator} />
          <div className="min-h-[200px] flex-1 overflow-hidden">
            <SideBetPanel
              roomId={roomId}
              roundId={round?.id ?? null}
              sideBets={sideBets}
              myUserId={userId}
              myBalance={balance}
              roundStatus={round?.status ?? ""}
              accessToken={accessToken}
              onRefresh={() => void fetchAll()}
            />
          </div>
          <div className="min-h-[220px] flex-1">
            <CeloChat roomId={roomId} userId={userId} userName={userName} messages={messages} onSendMessage={(m) => void sendChat(m)} />
          </div>
        </aside>
      </div>

      <div className="lg:hidden">
        <CeloTable
          room={room}
          currentRound={round}
          players={players}
          currentUserId={userId}
          onRoll={handleRoll}
          onStartRound={handleStartRound}
          rolling={rolling}
          dice={dice}
          rollName={rollName}
          rollResult={rollResult}
          myBalance={balance}
          myEntry={myEntry}
          prizePoolSc={prizePoolSc}
          canLowerBank={canLowerBank}
          lowerBankSecondsLeft={lowerTimer}
          onLowerBank={(amount) => void lowerBank(amount)}
          showCoverBank={Boolean(round && !round.bank_covered && balance >= room.current_bank_sc)}
          coverBankAmountSc={room.current_bank_sc}
          onCoverBank={() => void coverBank()}
          onOpenDiceShop={() => setDiceShopOpen(true)}
          diceShopOpen={diceShopOpen}
          onCloseDiceShop={() => setDiceShopOpen(false)}
          onPurchaseDice={(dt, q) => void purchaseDice(dt, q)}
          myDiceType={mapDiceType(myPlayer?.dice_type)}
          isBanker={isBanker}
          compact
        />
        <div
          className="fixed left-0 right-0 z-50 flex border-t border-violet-500/30 bg-[#08051a]/98"
          style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
        >
          {(
            [
              ["bets", "🎰 Side"],
              ["chat", "💬 Chat"],
              ["voice", "🎤 Voice"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`flex-1 py-3 text-center text-[11px] font-bold ${mobileTab === k ? "bg-violet-600/30 text-amber-200" : "text-slate-400"}`}
              onClick={() => setMobileTab(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="border-t border-violet-500/20 bg-[#08051a]/95 p-3 pb-24"
          style={{ minHeight: 280, display: mobileTab === "bets" ? "block" : "none" }}
        >
          <SideBetPanel
            roomId={roomId}
            roundId={round?.id ?? null}
            sideBets={sideBets}
            myUserId={userId}
            myBalance={balance}
            roundStatus={round?.status ?? ""}
            accessToken={accessToken}
            onRefresh={() => void fetchAll()}
          />
        </div>
        <div style={{ display: mobileTab === "chat" ? "block" : "none" }} className="border-t border-violet-500/20 bg-[#08051a]/95 p-3 pb-24">
          <CeloChat roomId={roomId} userId={userId} userName={userName} messages={messages} onSendMessage={(m) => void sendChat(m)} />
        </div>
        <div style={{ display: mobileTab === "voice" ? "block" : "none" }} className="border-t border-violet-500/20 bg-[#08051a]/95 p-3 pb-24">
          <VoiceChat roomId={roomId} userId={userId} userName={userName} isSpectator={spectator} />
        </div>
      </div>

      {showBecomeBanker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4">
          <div className="max-w-md rounded-2xl border-2 border-amber-400/50 bg-[#0f0a1a] p-6 text-center shadow-2xl">
            <p className={`${cinzel.className} text-xl text-amber-300`}>You rolled C-Lo! 🎲</p>
            <p className="mt-2 text-sm text-slate-300">Become the banker? You need enough SC to cover the bank.</p>
            <p className="mt-2 text-xs text-slate-500">{becomeTimer}s</p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 py-3 font-bold text-black"
                onClick={() => {
                  void (async () => {
                    if (!accessToken || !round?.id) return;
                    await fetch("/api/celo/banker/accept", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
                      body: JSON.stringify({ room_id: roomId, round_id: round.id }),
                    });
                    setShowBecomeBanker(false);
                    await fetchAll();
                  })();
                }}
              >
                YES — BECOME BANKER
              </button>
              <button type="button" className="flex-1 rounded-xl bg-slate-700 py-3 font-bold text-slate-200" onClick={() => setShowBecomeBanker(false)}>
                NO THANKS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
