"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────────────

type Room = {
  id: string;
  name: string;
  status: string;
  banker_id: string;
  room_type: string;
  max_players: number;
  min_bet_cents: number;
  max_bet_cents: number;
  current_bank_cents: number;
  platform_fee_pct: number;
  speed: string;
  last_round_was_celo: boolean;
  banker_celo_at: string | null;
};

type Player = {
  id: string;
  user_id: string;
  role: string;
  bet_cents: number;
  seat_number: number | null;
};

type Round = {
  id: string;
  status: string;
  banker_id: string;
  banker_roll: number[] | null;
  banker_roll_name: string | null;
  banker_roll_result: string | null;
  banker_point: number | null;
  banker_rerolls: number;
  total_pot_cents: number;
  platform_fee_cents: number;
  bank_covered: boolean;
  covered_by: string | null;
  completed_at: string | null;
};

type PlayerRoll = {
  id: string;
  user_id: string;
  dice: number[];
  roll_name: string | null;
  roll_result: string | null;
  outcome: string | null;
  payout_cents: number;
  platform_fee_cents: number;
  player_celo_at: string | null;
  created_at: string;
};

type SideBet = {
  id: string;
  creator_id: string;
  acceptor_id: string | null;
  bet_type: string;
  amount_cents: number;
  odds_multiplier: number;
  status: string;
  specific_point: number | null;
};

type RollResponse = {
  dice?: number[];
  rollName?: string;
  result?: string;
  isCelo?: boolean;
  outcome?: string;
  payoutCents?: number;
  bankerWinCents?: number;
  bankerPoint?: number;
  newBankerId?: string;
  banker_can_lower_bank?: boolean;
  player_can_become_banker?: boolean;
  roundComplete?: boolean;
  error?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const DICE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

const SIDE_BET_OPTIONS = [
  { value: "celo", label: "C-Lo (4-5-6)", odds: 8 },
  { value: "shit", label: "Shit (1-2-3)", odds: 8 },
  { value: "trips", label: "Trips", odds: 8 },
  { value: "hand_crack", label: "Hand Crack", odds: 4.5 },
  { value: "banker_wins", label: "Banker Wins Round", odds: 1.8 },
  { value: "player_wins", label: "Player Wins Round", odds: 1.8 },
  { value: "specific_point", label: "Specific Point", odds: 6 },
];

const RESULT_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  instant_win: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
  instant_loss: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
  point: { bg: "bg-violet-500/10", text: "text-violet-300", border: "border-violet-500/30" },
  no_count: { bg: "bg-white/5", text: "text-violet-300/70", border: "border-white/10" },
};

// ── Dice component ────────────────────────────────────────────────────────────

function DiceDisplay({
  dice,
  rolling,
  result,
}: {
  dice: number[];
  rolling: boolean;
  result?: string;
}) {
  const [display, setDisplay] = useState<number[]>(dice.length > 0 ? dice : [1, 1, 1]);

  useEffect(() => {
    if (!rolling) {
      if (dice.length > 0) setDisplay(dice);
      return;
    }
    const iv = setInterval(() => {
      setDisplay([
        Math.ceil(Math.random() * 6),
        Math.ceil(Math.random() * 6),
        Math.ceil(Math.random() * 6),
      ]);
    }, 80);
    return () => clearInterval(iv);
  }, [rolling, dice]);

  const style = result ? RESULT_STYLE[result] : RESULT_STYLE.no_count;

  return (
    <div className="flex gap-3 justify-center">
      {display.map((d, i) => (
        <div
          key={i}
          className={`w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center rounded-2xl text-5xl sm:text-6xl select-none transition-all duration-200 border-2 ${
            rolling
              ? "border-[#F5C842] bg-[#F5C842]/10 animate-pulse"
              : `${style.border} ${style.bg}`
          }`}
        >
          {DICE_FACES[d] ?? d}
        </div>
      ))}
    </div>
  );
}

// ── Seat display ──────────────────────────────────────────────────────────────

function SeatCard({
  player,
  isMe,
  isBanker,
  isCurrentTurn,
  resolvedRoll,
}: {
  player: Player;
  isMe: boolean;
  isBanker: boolean;
  isCurrentTurn: boolean;
  resolvedRoll: PlayerRoll | null;
}) {
  const shortId = player.user_id.slice(0, 6).toUpperCase();
  const label = player.role === "banker" ? "🏦 Banker" : `Seat ${player.seat_number ?? "?"}`;
  const outcome = resolvedRoll?.outcome;

  return (
    <div
      className={`rounded-xl border p-3 transition-all ${
        isCurrentTurn
          ? "border-[#F5C842] bg-[#F5C842]/5 shadow-[0_0_16px_rgba(245,200,66,0.15)]"
          : isMe
          ? "border-violet-500/50 bg-violet-500/5"
          : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-violet-300/60">{label}</p>
          <p className="text-sm font-mono font-medium text-white truncate">
            {isMe ? "You" : shortId}
            {isBanker && <span className="ml-1 text-[#F5C842]">👑</span>}
          </p>
        </div>
        <div className="text-right shrink-0">
          {player.role !== "banker" && (
            <p className="text-sm font-bold text-[#F5C842] font-mono">
              ${(player.bet_cents / 100).toFixed(2)}
            </p>
          )}
          {outcome === "win" && (
            <span className="text-xs text-emerald-400 font-semibold">
              +${(resolvedRoll!.payout_cents / 100).toFixed(2)} ✓
            </span>
          )}
          {outcome === "loss" && (
            <span className="text-xs text-red-400 font-semibold">Loss ✗</span>
          )}
          {isCurrentTurn && !outcome && (
            <span className="text-[10px] text-[#F5C842] animate-pulse">Rolling…</span>
          )}
        </div>
      </div>
      {resolvedRoll?.roll_name && (
        <p className="text-[10px] text-violet-300/50 mt-1 truncate">{resolvedRoll.roll_name}</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CeloRoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const router = useRouter();

  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [playerRolls, setPlayerRolls] = useState<PlayerRoll[]>([]);
  const [openSideBets, setOpenSideBets] = useState<SideBet[]>([]);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [balanceCents, setBalanceCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rolling animation state
  const [isRolling, setIsRolling] = useState(false);
  const [lastRollResult, setLastRollResult] = useState<RollResponse | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Join form state — default to min_bet_cents once room loads
  const [joinEntryCents, setJoinEntryCents] = useState(0);
  useEffect(() => {
    if (room && joinEntryCents === 0) setJoinEntryCents(room.min_bet_cents);
  }, [room, joinEntryCents]);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");

  // Side bet form state
  const [showSideBets, setShowSideBets] = useState(false);
  const [sbType, setSbType] = useState("celo");
  const [sbAmount, setSbAmount] = useState(100);
  const [sbPoint, setSbPoint] = useState(2);
  const [sbLoading, setSbLoading] = useState(false);
  const [sbError, setSbError] = useState<string | null>(null);

  // Lower bank form state
  const [showLowerBank, setShowLowerBank] = useState(false);
  const [newBankCents, setNewBankCents] = useState(0);
  const [lowerBankLoading, setLowerBankLoading] = useState(false);

  // Ticker for countdowns (1s)
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const tokenRef = useRef<string | undefined>(undefined);

  // ── API helper ─────────────────────────────────────────────────────────────
  const api = useCallback(
    async (path: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> => {
      const token = tokenRef.current;
      if (!token) return { ok: false, data: { error: "Not authenticated" } };
      const res = await fetch(path, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      return { ok: res.ok, data };
    },
    []
  );

  // ── Data loaders ───────────────────────────────────────────────────────────
  const loadRoom = useCallback(async () => {
    const sb = createBrowserClient();
    if (!sb) return;
    const { data } = await sb.from("celo_rooms").select("*").eq("id", roomId).maybeSingle();
    if (data) setRoom(data as Room);
  }, [roomId]);

  const loadPlayers = useCallback(async () => {
    const sb = createBrowserClient();
    if (!sb) return;
    const { data } = await sb
      .from("celo_room_players")
      .select("id,user_id,role,bet_cents,seat_number")
      .eq("room_id", roomId)
      .order("seat_number", { ascending: true });
    const plist = (data as Player[]) ?? [];
    setPlayers(plist);
    if (session?.userId) {
      setMyPlayer(plist.find((p) => p.user_id === session.userId) ?? null);
    }
  }, [roomId, session?.userId]);

  const loadRound = useCallback(async () => {
    const sb = createBrowserClient();
    if (!sb) return;
    const { data } = await sb
      .from("celo_rounds")
      .select("*")
      .eq("room_id", roomId)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const round = (data as Round) ?? null;
    setCurrentRound(round);

    if (round) {
      const { data: rolls } = await sb
        .from("celo_player_rolls")
        .select("*")
        .eq("round_id", round.id)
        .order("created_at", { ascending: true });
      setPlayerRolls((rolls as PlayerRoll[]) ?? []);

      const { data: bets } = await sb
        .from("celo_side_bets")
        .select("*")
        .eq("round_id", round.id)
        .eq("status", "open");
      setOpenSideBets((bets as SideBet[]) ?? []);
    } else {
      setPlayerRolls([]);
      setOpenSideBets([]);
    }
  }, [roomId]);

  const loadBalance = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    const res = await fetch("/api/wallet/get", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (res?.ok) {
      const d = await res.json().catch(() => ({})) as { balance_cents?: number };
      setBalanceCents(d.balance_cents ?? 0);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadRoom(), loadPlayers(), loadRound(), loadBalance()]);
  }, [loadRoom, loadPlayers, loadRound, loadBalance]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) { router.replace(`/login?redirect=/games/celo/${roomId}`); return; }
      setSession(s);
      tokenRef.current = s.accessToken;
      setLoading(false);
    });
  }, [router, roomId]);

  useEffect(() => {
    if (!session) return;
    void loadAll();
  }, [session, loadAll]);

  // ── Realtime subscriptions ─────────────────────────────────────────────────
  useEffect(() => {
    const sb = createBrowserClient();
    if (!sb || !session) return;

    const ch = sb
      .channel(`celo-room-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "celo_rooms", filter: `id=eq.${roomId}` }, () => {
        void loadRoom();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "celo_room_players", filter: `room_id=eq.${roomId}` }, () => {
        void loadPlayers();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "celo_rounds", filter: `room_id=eq.${roomId}` }, () => {
        void loadRound();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "celo_player_rolls", filter: `room_id=eq.${roomId}` }, () => {
        void loadRound();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "users", filter: `id=eq.${session.userId}` }, () => {
        void loadBalance();
      })
      .subscribe();

    return () => { sb.removeChannel(ch); };
  }, [session, roomId, loadRoom, loadPlayers, loadRound, loadBalance]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const userId = session?.userId ?? "";
  const amIBanker = room?.banker_id === userId;
  const amIPlayer = myPlayer?.role === "player";
  const isInRoom = myPlayer !== null;

  // Resolved player IDs in current round
  const resolvedIds = new Set(
    playerRolls.filter((r) => r.outcome === "win" || r.outcome === "loss").map((r) => r.user_id)
  );

  // Active players for this round (respects bank_covered)
  const activePlayers = players
    .filter((p) => p.role === "player")
    .filter((p) => !currentRound?.bank_covered || p.user_id === currentRound.covered_by)
    .sort((a, b) => (a.seat_number ?? 0) - (b.seat_number ?? 0));

  const currentTurnPlayer = currentRound?.status === "player_rolling"
    ? activePlayers.find((p) => !resolvedIds.has(p.user_id))
    : null;
  const isMyTurn = currentTurnPlayer?.user_id === userId;

  // Timer: lower bank (60s after banker C-Lo)
  const lowerBankSecondsLeft = room?.banker_celo_at
    ? Math.max(0, 60 - Math.floor((Date.now() - new Date(room.banker_celo_at).getTime()) / 1000))
    : 0;
  const canLowerBank = amIBanker && room?.last_round_was_celo === true && lowerBankSecondsLeft > 0;

  // Timer: become banker (30s after player rolled C-Lo this round)
  const myLastCeloRoll = playerRolls
    .filter((r) => r.user_id === userId && r.player_celo_at !== null)
    .sort((a, b) => new Date(b.player_celo_at!).getTime() - new Date(a.player_celo_at!).getTime())[0];
  const becomeBankerSecondsLeft = myLastCeloRoll?.player_celo_at
    ? Math.max(0, 30 - Math.floor((Date.now() - new Date(myLastCeloRoll.player_celo_at).getTime()) / 1000))
    : 0;
  const canBecomeBanker = amIPlayer && !!myLastCeloRoll && becomeBankerSecondsLeft > 0;

  // ── Action handlers ───────────────────────────────────────────────────────

  async function handleJoin(asSpectator = false) {
    setJoinLoading(true);
    setJoinError(null);
    const { ok, data } = await api("/api/celo/room/join", {
      room_id: roomId,
      role: asSpectator ? "spectator" : "player",
      entry_cents: asSpectator ? undefined : joinEntryCents,
      join_code: room?.room_type === "private" ? joinCode : undefined,
    });
    setJoinLoading(false);
    if (!ok) { setJoinError((data.error as string) ?? "Failed to join"); return; }
    await loadAll();
  }

  async function handleStartRound() {
    setActionLoading("start");
    setError(null);
    const { ok, data } = await api("/api/celo/round/start", { room_id: roomId });
    setActionLoading(null);
    if (!ok) { setError((data.error as string) ?? "Failed to start round"); return; }
    await loadRound();
  }

  async function handleRoll() {
    if (!currentRound) return;
    setActionLoading("roll");
    setIsRolling(true);
    setError(null);
    const { ok, data } = await api("/api/celo/round/roll", { room_id: roomId, round_id: currentRound.id });
    // Let animation play at least 600ms
    await new Promise((r) => setTimeout(r, 600));
    setIsRolling(false);
    setActionLoading(null);
    if (!ok) { setError((data.error as string) ?? "Roll failed"); return; }
    setLastRollResult(data as unknown as RollResponse);
    await loadAll();
  }

  async function handleCoverBank() {
    if (!currentRound) return;
    setActionLoading("cover");
    setError(null);
    const { ok, data } = await api("/api/celo/room/cover-bank", { room_id: roomId, round_id: currentRound.id });
    setActionLoading(null);
    if (!ok) { setError((data.error as string) ?? "Failed to cover bank"); return; }
    await loadAll();
  }

  async function handleLowerBank() {
    if (!room) return;
    setLowerBankLoading(true);
    setError(null);
    const { ok, data } = await api("/api/celo/room/lower-bank", { room_id: roomId, new_bank_cents: newBankCents });
    setLowerBankLoading(false);
    if (!ok) { setError((data.error as string) ?? "Failed to lower bank"); return; }
    setShowLowerBank(false);
    await loadAll();
  }

  async function handleBecomeBanker() {
    if (!currentRound) return;
    setActionLoading("become_banker");
    setError(null);
    const { ok, data } = await api("/api/celo/banker/accept", { room_id: roomId, round_id: currentRound.id });
    setActionLoading(null);
    if (!ok) { setError((data.error as string) ?? "Failed to become banker"); return; }
    await loadAll();
  }

  async function handleCreateSideBet(e: React.FormEvent) {
    e.preventDefault();
    if (!currentRound) return;
    setSbLoading(true);
    setSbError(null);
    const { ok, data } = await api("/api/celo/sidebet/create", {
      room_id: roomId,
      round_id: currentRound.id,
      bet_type: sbType,
      amount_cents: sbAmount,
      specific_point: sbType === "specific_point" ? sbPoint : undefined,
    });
    setSbLoading(false);
    if (!ok) { setSbError((data.error as string) ?? "Failed to create bet"); return; }
    setSbAmount(100);
    await loadRound();
  }

  async function handleAcceptSideBet(betId: string) {
    setError(null);
    const { ok, data } = await api("/api/celo/sidebet/accept", { bet_id: betId });
    if (!ok) { setError((data.error as string) ?? "Failed to accept bet"); return; }
    await loadRound();
    await loadBalance();
  }

  // ── Render: loading ───────────────────────────────────────────────────────
  if (loading || !session) {
    return (
      <div className="min-h-screen bg-[#0e0118] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#F5C842] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-[#0e0118] flex flex-col items-center justify-center gap-4">
        <p className="text-violet-200/70">Room not found.</p>
        <Link href="/games/celo" className="text-sm text-violet-300 underline">← Back to lobby</Link>
      </div>
    );
  }

  // ── Render: join panel ────────────────────────────────────────────────────
  if (!isInRoom) {
    const minBet = room.min_bet_cents;

    return (
      <main className="min-h-screen bg-[#0e0118] text-white relative overflow-x-hidden">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute -left-24 top-16 h-96 w-96 rounded-full bg-violet-700/20 blur-[130px]" />
        </div>
        <div className="relative z-10 mx-auto max-w-md px-4 py-12">
          <Link href="/games/celo" className="text-violet-300/70 text-sm hover:text-[#F5C842] transition-colors mb-8 block">
            ← C-Lo Lobby
          </Link>
          <div className="rounded-2xl border border-[#F5C842]/20 bg-[#12081f]/90 p-6 shadow-2xl shadow-violet-900/40">
            <div className="text-center mb-6">
              <p className="text-4xl mb-2">🎲</p>
              <h1 className="text-xl font-bold text-[#F5C842]">{room.name}</h1>
              <div className="flex justify-center gap-3 mt-3 text-xs text-violet-300/60">
                <span>Bank: <span className="text-[#F5C842] font-mono">${(room.current_bank_cents / 100).toFixed(2)}</span></span>
                <span>Min: <span className="text-white font-mono">${(room.min_bet_cents / 100).toFixed(2)}</span></span>
                <span>{room.platform_fee_pct}% fee</span>
              </div>
            </div>

            {joinError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 mb-4">{joinError}</div>
            )}

            {room.room_type === "private" && (
              <div className="mb-4">
                <label className="text-[10px] uppercase tracking-widest text-violet-400/70">Join Code</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={12}
                  placeholder="Enter room code"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-violet-400/40 outline-none focus:border-[#F5C842]/50 uppercase font-mono text-sm"
                />
              </div>
            )}

            <div className="mb-5">
              <label className="text-[10px] uppercase tracking-widest text-violet-400/70">
                Entry Amount — <span className="text-[#F5C842]">${(joinEntryCents / 100).toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={minBet}
                max={Math.min(room.max_bet_cents, balanceCents)}
                step={minBet}
                value={Math.max(minBet, Math.min(joinEntryCents, room.max_bet_cents))}
                onChange={(e) => setJoinEntryCents(Number(e.target.value))}
                className="mt-2 w-full accent-[#F5C842]"
              />
              <div className="flex justify-between text-[10px] text-violet-400/50 mt-1">
                <span>Min: ${(minBet / 100).toFixed(2)}</span>
                <span>Balance: ${(balanceCents / 100).toFixed(2)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={joinLoading || joinEntryCents < minBet || balanceCents < joinEntryCents}
              onClick={() => handleJoin(false)}
              className="w-full rounded-xl bg-gradient-to-r from-[#7C3AED] to-violet-500 py-3.5 font-semibold text-white shadow-lg shadow-violet-900/40 disabled:opacity-50 transition-all mb-3"
            >
              {joinLoading ? "Joining…" : `Join as Player — $${(joinEntryCents / 100).toFixed(2)}`}
            </button>
            <button
              type="button"
              disabled={joinLoading}
              onClick={() => handleJoin(true)}
              className="w-full rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-violet-300 hover:bg-white/10 transition-all disabled:opacity-50"
            >
              Watch as Spectator (free)
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Render: game view ─────────────────────────────────────────────────────

  const roundStatus = currentRound?.status ?? null;
  const isBankerRolling = roundStatus === "banker_rolling";
  const isPlayerRolling = roundStatus === "player_rolling";
  const roundActive = isBankerRolling || isPlayerRolling;
  const noActiveRound = !currentRound;

  const canStartRound =
    amIBanker &&
    (room.status === "active" || room.status === "waiting") &&
    noActiveRound &&
    players.filter((p) => p.role === "player" && p.bet_cents > 0).length > 0;

  const canCoverBank =
    amIPlayer &&
    isBankerRolling &&
    currentRound &&
    !currentRound.bank_covered &&
    room.banker_id !== userId;

  const canRoll =
    (amIBanker && isBankerRolling) ||
    (amIPlayer && isPlayerRolling && isMyTurn);

  const lastDice = lastRollResult?.dice ?? [];
  const lastResult = lastRollResult?.result;

  return (
    <main className="min-h-screen bg-[#0e0118] text-white relative overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-20 top-10 h-80 w-80 rounded-full bg-violet-700/15 blur-[110px]" />
        <div className="absolute right-0 bottom-20 h-72 w-72 rounded-full bg-[#F5C842]/6 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-4 py-5 pb-24 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <Link href="/games/celo" className="text-violet-300/70 text-sm hover:text-[#F5C842] transition-colors shrink-0">
            ← Lobby
          </Link>
          <div className="text-center min-w-0">
            <h1 className="font-bold text-[#F5C842] truncate text-lg">{room.name}</h1>
            <p className="text-[10px] text-violet-400/60 uppercase tracking-widest">{room.speed}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-violet-400/50">Balance</p>
            <p className="text-sm font-bold text-emerald-400 font-mono">${(balanceCents / 100).toFixed(2)}</p>
          </div>
        </div>

        {/* Bank bar */}
        <div className="rounded-2xl border border-[#F5C842]/20 bg-[#12081f]/80 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-violet-400/60">Current Bank</p>
            <p className="text-3xl font-bold text-[#F5C842] font-mono mt-0.5">
              ${(room.current_bank_cents / 100).toFixed(2)}
            </p>
          </div>
          <div className="text-right text-xs text-violet-300/60 space-y-0.5">
            <p>Min entry <span className="text-white font-mono">${(room.min_bet_cents / 100).toFixed(2)}</span></p>
            <p>Fee <span className="text-white">{room.platform_fee_pct}%</span></p>
            <p>Players <span className="text-white">{players.filter((p) => p.role === "player").length}/{room.max_players}</span></p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="shrink-0 text-red-400/70 hover:text-red-300">✕</button>
          </div>
        )}

        {/* Dice display zone */}
        {(isRolling || lastDice.length > 0) && (
          <div
            className={`rounded-2xl border p-5 text-center space-y-3 ${
              lastResult ? (RESULT_STYLE[lastResult]?.border ?? "border-white/10") : "border-white/10"
            } ${lastResult ? (RESULT_STYLE[lastResult]?.bg ?? "bg-white/5") : "bg-white/[0.02]"}`}
          >
            <DiceDisplay dice={lastDice} rolling={isRolling} result={lastResult} />
            {!isRolling && lastRollResult?.rollName && (
              <div>
                <p className={`text-lg font-bold ${RESULT_STYLE[lastResult ?? "no_count"]?.text ?? "text-white"}`}>
                  {lastRollResult.rollName}
                </p>
                {lastRollResult.bankerPoint && (
                  <p className="text-sm text-violet-300/70 mt-1">
                    Banker&apos;s point: <span className="text-violet-300 font-bold">{lastRollResult.bankerPoint}</span>
                  </p>
                )}
                {lastRollResult.payoutCents !== undefined && lastRollResult.payoutCents > 0 && (
                  <p className="text-sm text-emerald-400 mt-1 font-semibold">
                    +${(lastRollResult.payoutCents / 100).toFixed(2)} payout
                  </p>
                )}
                {lastRollResult.banker_can_lower_bank && canLowerBank && (
                  <p className="text-xs text-[#F5C842] mt-2 animate-pulse">
                    C-Lo! You can lower your bank — {lowerBankSecondsLeft}s left
                  </p>
                )}
                {lastRollResult.player_can_become_banker && canBecomeBanker && (
                  <p className="text-xs text-[#F5C842] mt-2 animate-pulse">
                    C-Lo! You can take over as banker — {becomeBankerSecondsLeft}s left
                  </p>
                )}
              </div>
            )}
            {isRolling && (
              <p className="text-sm text-violet-300/60 animate-pulse">Rolling…</p>
            )}
          </div>
        )}

        {/* Round status bar */}
        {currentRound && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex items-center justify-between gap-3 text-sm">
            <div>
              {isBankerRolling && (
                <span className="text-amber-400">
                  {amIBanker ? "Your turn to roll" : "Waiting for banker to roll"}
                </span>
              )}
              {isPlayerRolling && (
                <span className={isMyTurn ? "text-[#F5C842] font-semibold" : "text-violet-300/70"}>
                  {isMyTurn ? "Your turn to roll!" : `Waiting for player ${currentTurnPlayer?.user_id.slice(0, 6).toUpperCase() ?? "?"}`}
                </span>
              )}
              {currentRound.banker_point && (
                <span className="ml-2 text-xs text-violet-400/70">
                  · Banker&apos;s point: <span className="text-violet-300 font-bold">{currentRound.banker_point}</span>
                </span>
              )}
            </div>
            {currentRound.bank_covered && (
              <span className="text-[10px] text-violet-300/60 bg-violet-500/10 px-2 py-0.5 rounded-full">1v1</span>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          {/* Start round */}
          {canStartRound && (
            <button
              type="button"
              disabled={actionLoading === "start"}
              onClick={handleStartRound}
              className="flex-1 rounded-xl bg-gradient-to-r from-[#7C3AED] to-violet-500 py-4 font-bold text-white shadow-lg shadow-violet-900/40 disabled:opacity-60 transition-all text-sm"
            >
              {actionLoading === "start" ? "Starting…" : "▶ Start Round"}
            </button>
          )}

          {/* Roll dice */}
          {canRoll && (
            <button
              type="button"
              disabled={!!actionLoading}
              onClick={handleRoll}
              className="flex-1 rounded-xl bg-gradient-to-r from-[#F5C842] to-[#eab308] py-4 font-bold text-black shadow-lg shadow-amber-900/30 disabled:opacity-60 transition-all text-sm"
            >
              {actionLoading === "roll" ? "Rolling…" : "🎲 Roll Dice"}
            </button>
          )}

          {/* Cover bank */}
          {canCoverBank && (
            <button
              type="button"
              disabled={!!actionLoading || balanceCents < room.current_bank_cents}
              onClick={handleCoverBank}
              className="flex-1 rounded-xl border border-emerald-500/50 bg-emerald-500/10 py-4 font-semibold text-emerald-400 disabled:opacity-50 transition-all text-sm hover:bg-emerald-500/20"
            >
              {actionLoading === "cover"
                ? "Covering…"
                : `Cover Bank $${(room.current_bank_cents / 100).toFixed(2)}`}
            </button>
          )}

          {/* Lower bank */}
          {canLowerBank && !showLowerBank && (
            <button
              type="button"
              onClick={() => { setShowLowerBank(true); setNewBankCents(room.min_bet_cents); }}
              className="flex-1 rounded-xl border border-[#F5C842]/40 bg-[#F5C842]/10 py-4 font-semibold text-[#F5C842] text-sm hover:bg-[#F5C842]/20 transition-all"
            >
              Lower Bank ({lowerBankSecondsLeft}s)
            </button>
          )}

          {/* Become banker */}
          {canBecomeBanker && (
            <button
              type="button"
              disabled={actionLoading === "become_banker" || balanceCents < room.current_bank_cents}
              onClick={handleBecomeBanker}
              className="flex-1 rounded-xl border border-[#F5C842]/50 bg-[#F5C842]/10 py-4 font-semibold text-[#F5C842] text-sm hover:bg-[#F5C842]/20 transition-all disabled:opacity-50"
            >
              {actionLoading === "become_banker"
                ? "Claiming…"
                : `Become Banker (${becomeBankerSecondsLeft}s)`}
            </button>
          )}

          {/* Waiting state */}
          {!canStartRound && !canRoll && !canCoverBank && !canLowerBank && !canBecomeBanker && noActiveRound && (
            <div className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] py-4 text-center text-sm text-violet-300/50">
              {amIBanker
                ? players.filter((p) => p.role === "player" && p.bet_cents > 0).length === 0
                  ? "Waiting for players to join…"
                  : "Ready — press Start Round"
                : "Waiting for banker to start…"}
            </div>
          )}
        </div>

        {/* Lower bank form */}
        {showLowerBank && canLowerBank && (
          <div className="rounded-2xl border border-[#F5C842]/20 bg-[#12081f]/80 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-[#F5C842]">Lower Bank ({lowerBankSecondsLeft}s remaining)</p>
              <button type="button" onClick={() => setShowLowerBank(false)} className="text-violet-300/50 hover:text-white text-xl leading-none">×</button>
            </div>
            <p className="text-[10px] text-violet-400/60 mb-3">
              New bank — <span className="text-[#F5C842]">${(newBankCents / 100).toFixed(2)}</span>
              {" "}(current: ${(room.current_bank_cents / 100).toFixed(2)})
            </p>
            <input
              type="range"
              min={room.min_bet_cents}
              max={room.current_bank_cents - room.min_bet_cents}
              step={room.min_bet_cents}
              value={newBankCents}
              onChange={(e) => setNewBankCents(Number(e.target.value))}
              className="w-full accent-[#F5C842] mb-4"
            />
            <button
              type="button"
              disabled={lowerBankLoading || newBankCents >= room.current_bank_cents}
              onClick={handleLowerBank}
              className="w-full rounded-xl bg-[#F5C842]/20 border border-[#F5C842]/40 py-3 font-semibold text-[#F5C842] text-sm disabled:opacity-50 hover:bg-[#F5C842]/30 transition-all"
            >
              {lowerBankLoading ? "Lowering…" : `Set Bank to $${(newBankCents / 100).toFixed(2)}`}
            </button>
          </div>
        )}

        {/* Players grid */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-violet-400/50 mb-2">
            Players ({players.filter((p) => p.role !== "spectator").length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {/* Banker seat */}
            {players
              .filter((p) => p.role === "banker")
              .map((p) => (
                <SeatCard
                  key={p.id}
                  player={p}
                  isMe={p.user_id === userId}
                  isBanker={true}
                  isCurrentTurn={isBankerRolling && p.user_id === userId}
                  resolvedRoll={null}
                />
              ))}
            {/* Player seats */}
            {players
              .filter((p) => p.role === "player")
              .sort((a, b) => (a.seat_number ?? 0) - (b.seat_number ?? 0))
              .map((p) => {
                const roll = playerRolls
                  .filter((r) => r.user_id === p.user_id && (r.outcome === "win" || r.outcome === "loss"))
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
                return (
                  <SeatCard
                    key={p.id}
                    player={p}
                    isMe={p.user_id === userId}
                    isBanker={false}
                    isCurrentTurn={currentTurnPlayer?.user_id === p.user_id}
                    resolvedRoll={roll}
                  />
                );
              })}
            {/* Spectators */}
            {players.filter((p) => p.role === "spectator").length > 0 && (
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
                <p className="text-[10px] text-violet-400/40">
                  {players.filter((p) => p.role === "spectator").length} watching
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Side bets panel */}
        {roundActive && (
          <div className="rounded-2xl border border-violet-500/20 bg-[#12081f]/60">
            <button
              type="button"
              onClick={() => setShowSideBets((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-violet-300/80 hover:text-white transition-colors"
            >
              <span>🎯 Side Bets {openSideBets.length > 0 && `(${openSideBets.length} open)`}</span>
              <span className="text-violet-400/50">{showSideBets ? "▲" : "▼"}</span>
            </button>

            {showSideBets && (
              <div className="px-5 pb-5 space-y-4 border-t border-white/[0.05]">

                {/* Open bets to accept */}
                {openSideBets.filter((b) => b.creator_id !== userId).length > 0 && (
                  <div className="space-y-2 pt-4">
                    <p className="text-[10px] uppercase tracking-widest text-violet-400/50">Open Bets</p>
                    {openSideBets
                      .filter((b) => b.creator_id !== userId)
                      .map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-white capitalize">
                              {b.bet_type.replace(/_/g, " ")}
                              {b.specific_point ? ` (${b.specific_point})` : ""}
                            </p>
                            <p className="text-[10px] text-violet-400/60">{b.odds_multiplier}× odds</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-[#F5C842] font-mono">${(b.amount_cents / 100).toFixed(2)}</p>
                            <button
                              type="button"
                              disabled={balanceCents < b.amount_cents}
                              onClick={() => handleAcceptSideBet(b.id)}
                              className="mt-1 text-[10px] rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-400 disabled:opacity-40 hover:bg-emerald-500/20 transition-all"
                            >
                              Accept
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* My open bets */}
                {openSideBets.filter((b) => b.creator_id === userId).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-violet-400/50">My Open Bets</p>
                    {openSideBets
                      .filter((b) => b.creator_id === userId)
                      .map((b) => (
                        <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.01] px-4 py-3">
                          <p className="text-xs text-violet-300/70 capitalize">{b.bet_type.replace(/_/g, " ")}</p>
                          <p className="text-xs font-mono text-[#F5C842]">${(b.amount_cents / 100).toFixed(2)} · {b.odds_multiplier}×</p>
                        </div>
                      ))}
                  </div>
                )}

                {/* Create side bet */}
                <form onSubmit={handleCreateSideBet} className="space-y-3 pt-2 border-t border-white/[0.05]">
                  <p className="text-[10px] uppercase tracking-widest text-violet-400/50 pt-1">Place Side Bet</p>

                  <div>
                    <select
                      value={sbType}
                      onChange={(e) => setSbType(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#1a0a2e] px-3 py-2.5 text-white text-sm outline-none focus:border-[#F5C842]/50"
                    >
                      {SIDE_BET_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label} ({o.odds}×)
                        </option>
                      ))}
                    </select>
                  </div>

                  {sbType === "specific_point" && (
                    <div className="flex gap-2">
                      {[2, 3, 4, 5].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setSbPoint(p)}
                          className={`flex-1 rounded-xl border py-2 text-sm font-bold transition-all ${sbPoint === p ? "border-[#F5C842]/60 bg-[#F5C842]/15 text-[#F5C842]" : "border-white/10 text-violet-300/60"}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-3 items-center">
                    <div className="flex-1">
                      <input
                        type="number"
                        min={100}
                        step={100}
                        max={balanceCents}
                        value={sbAmount}
                        onChange={(e) => setSbAmount(Number(e.target.value))}
                        className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-white text-sm outline-none focus:border-[#F5C842]/50 font-mono"
                        placeholder="Amount (cents)"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sbLoading || sbAmount < 100 || balanceCents < sbAmount}
                      className="rounded-xl border border-[#F5C842]/40 bg-[#F5C842]/10 px-4 py-2.5 text-[#F5C842] text-sm font-semibold disabled:opacity-40 hover:bg-[#F5C842]/20 transition-all"
                    >
                      {sbLoading ? "…" : "Bet"}
                    </button>
                  </div>

                  {sbError && <p className="text-xs text-red-400">{sbError}</p>}
                  <p className="text-[10px] text-violet-400/40">
                    Win: ${(sbAmount * (SIDE_BET_OPTIONS.find((o) => o.value === sbType)?.odds ?? 2) / 100).toFixed(2)} · Min $1.00
                  </p>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Round history / no round */}
        {noActiveRound && !canStartRound && !amIBanker && (
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] px-4 py-5 text-center">
            <p className="text-sm text-violet-300/50">Waiting for the banker to start a round…</p>
          </div>
        )}
      </div>
    </main>
  );
}
