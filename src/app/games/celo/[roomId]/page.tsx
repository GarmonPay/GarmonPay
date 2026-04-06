"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";

const DiceThrow = dynamic(() => import("@/components/celo/DiceThrow"), { ssr: false });

async function authFetch(url: string, body: Record<string, unknown>) {
  const supabase = createBrowserClient();
  if (!supabase) throw new Error("Not authenticated");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function authFetchGet(url: string) {
  const supabase = createBrowserClient();
  if (!supabase) throw new Error("Not authenticated");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

async function authFetchDelete(url: string) {
  const supabase = createBrowserClient();
  if (!supabase) throw new Error("Not authenticated");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

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

type PlayerProfileEmbed = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type Player = {
  id: string;
  user_id: string;
  role: string;
  bet_cents: number;
  entry_sc?: number;
  seat_number: number | null;
  dice_type?: string;
  /** From PostgREST embed (FK user_id → public.users) */
  users?: PlayerProfileEmbed | null;
  /** If FK to profiles exists in DB */
  profiles?: PlayerProfileEmbed | null;
};

type Round = {
  id: string;
  room_id?: string;
  status: string;
  banker_id: string;
  banker_dice: number[] | null;
  banker_dice_name: string | null;
  banker_dice_result: string | null;
  banker_point: number | null;
  banker_rerolls: number;
  prize_pool_sc: number;
  platform_fee_sc: number;
  bank_covered: boolean;
  covered_by: string | null;
  completed_at: string | null;
  current_player_seat?: number | null;
};

type PlayerRoll = {
  id: string;
  room_id?: string;
  user_id: string;
  dice: number[];
  roll_name: string | null;
  roll_result: string | null;
  outcome: string | null;
  payout_sc: number;
  platform_fee_sc: number;
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

type RoundSummaryPayload = {
  playerResults: Array<{
    userId: string;
    outcome: string;
    amountCents: number;
    label: string;
  }>;
  bankerNetCents: number;
  bankerLabel: string;
};

type RollResponse = {
  dice?: number[];
  rollName?: string;
  result?: string;
  isCelo?: boolean;
  outcome?: string;
  payoutCents?: number;
  bankerWinCents?: number;
  newBankSC?: number;
  newBankCents?: number;
  bankerPoint?: number;
  newBankerId?: string;
  banker_can_adjust_bank?: boolean;
  player_can_become_banker?: boolean;
  banker_cost_sc?: number;
  roundComplete?: boolean;
  summary?: RoundSummaryPayload;
  error?: string;
};

type ChatMessage = {
  id: string;
  room_id?: string;
  user_id: string;
  message: string;
  created_at: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────


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

/** Compare Supabase auth user ids to FK uuids (avoids strict === misses from formatting). */
function sameCeloUserId(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** Display name from embedded profile/users or id fallback (replaces UUID fragments in UI). */
function getPlayerBetCents(player: { entry_sc?: number; bet_cents?: number }): number {
  const n = Number(player.entry_sc ?? player.bet_cents ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Display stake for seat cards (supports `entry_sc` or legacy `bet_cents`). */
function getPlayerEntry(player: { entry_sc?: number; bet_cents?: number }): string {
  const amount = getPlayerBetCents(player);
  return `$${(amount / 100).toFixed(2)}`;
}

function getDisplayName(
  player:
    | Player
    | { user_id?: string; profiles?: PlayerProfileEmbed | null; users?: PlayerProfileEmbed | null }
    | null
    | undefined
) {
  if (!player) return "Unknown";
  const p =
    (player as Player).profiles ?? (player as Player).users ?? player;
  if (p && typeof p === "object" && "full_name" in p && (p as PlayerProfileEmbed).full_name?.trim()) {
    return (p as PlayerProfileEmbed).full_name!.trim();
  }
  if (p && typeof p === "object" && "email" in p && (p as PlayerProfileEmbed).email) {
    return (p as PlayerProfileEmbed).email!.split("@")[0];
  }
  if ("user_id" in player && player.user_id) {
    return player.user_id.substring(0, 8).toUpperCase();
  }
  return "Player";
}

function getRoundStatusLine(opts: {
  round: Round | null;
  amIBanker: boolean;
  amIPlayer: boolean;
  currentTurnPlayer: Player | null;
  isMyTurn: boolean;
  noActiveRound: boolean;
}): string {
  const { round, amIBanker, amIPlayer, currentTurnPlayer, isMyTurn, noActiveRound } = opts;
  if (noActiveRound || !round) {
    return amIBanker ? "Start a new round when ready." : "Waiting for banker to start…";
  }
  const st = round.status;
  if (st === "completed") {
    return "Round complete — see results below";
  }
  if (st === "banker_rolling") {
    return amIBanker ? "Roll the dice!" : "Waiting for banker to roll…";
  }
  if (st === "player_rolling") {
    const bp = round.banker_point;
    const name = currentTurnPlayer ? getDisplayName(currentTurnPlayer) : "Player";
    if (amIBanker) {
      return `Waiting for ${name} to roll…`;
    }
    if (amIPlayer && isMyTurn && bp != null) {
      return `YOUR TURN — Beat ${bp}!`;
    }
    if (amIPlayer && !isMyTurn) {
      return `${name} is rolling…`;
    }
    return `Waiting for ${name} to roll…`;
  }
  return amIBanker ? "Start a new round when ready." : "Waiting for banker to start…";
}

// ── Seat display ──────────────────────────────────────────────────────────────

function SeatCard({
  player,
  isMe,
  isBanker,
  isCurrentTurn,
  resolvedRoll,
  phasePlayerRolling,
}: {
  player: Player;
  isMe: boolean;
  isBanker: boolean;
  isCurrentTurn: boolean;
  resolvedRoll: PlayerRoll | null;
  phasePlayerRolling?: boolean;
}) {
  const displayName = getDisplayName(player);
  const label = player.role === "banker" ? "🏦 Banker" : `Seat ${player.seat_number || 1}`;
  const outcome = resolvedRoll?.outcome;
  const hasResolved = outcome === "win" || outcome === "loss";
  const showBankerRollingPulse = !phasePlayerRolling && isCurrentTurn && !hasResolved;

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
          <p className="text-sm font-medium text-white truncate">
            {isMe ? "You" : displayName}
            {isBanker && <span className="ml-1 text-[#F5C842]">👑</span>}
          </p>
        </div>
        <div className="text-right shrink-0">
          {player.role !== "banker" && (
            <p className="text-sm font-bold text-[#F5C842] font-mono">{getPlayerEntry(player)}</p>
          )}
          {outcome === "win" && (
            <span className="text-xs text-emerald-400 font-semibold">
              +${(resolvedRoll!.payout_sc / 100).toFixed(2)} ✓
            </span>
          )}
          {outcome === "loss" && (
            <span className="text-xs text-red-400 font-semibold">Loss ✗</span>
          )}
          {player.role === "player" && phasePlayerRolling && !hasResolved && (
            <span
              className={`text-[10px] flex items-center justify-end gap-1 mt-0.5 ${
                isCurrentTurn ? "text-[#F5C842] font-medium" : "text-violet-400/70"
              }`}
            >
              {isCurrentTurn ? (
                <>
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-[#F5C842] border-t-transparent animate-spin shrink-0" />
                  Rolling…
                </>
              ) : (
                "Waiting…"
              )}
            </span>
          )}
          {showBankerRollingPulse && (
            <span className="text-[10px] text-[#F5C842] animate-pulse block mt-0.5">Rolling…</span>
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

  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [balanceFlash, setBalanceFlash] = useState<"up" | "down" | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [systemFeed, setSystemFeed] = useState<string[]>([]);
  /** Shown above dice during shared realtime animation */
  const [currentRollerName, setCurrentRollerName] = useState("");
  /** True after Roll API succeeds until realtime dice animation sequence finishes */
  const [rollInteractionBusy, setRollInteractionBusy] = useState(false);
  const [roundSummary, setRoundSummary] = useState<RoundSummaryPayload | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const balanceRef = useRef(0);
  const roomChannelRef = useRef<RealtimeChannel | null>(null);
  /** Dedupe dice animations when realtime delivers duplicates */
  const lastAnimKeyRef = useRef<string>("");
  const playersRef = useRef<Player[]>([]);
  const celoBankModalCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Join form state — default to min_bet_cents once room loads
  const [joinEntryCents, setJoinEntryCents] = useState(0);
  useEffect(() => {
    if (room && joinEntryCents === 0) setJoinEntryCents(room.min_bet_cents);
  }, [room, joinEntryCents]);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [deleteRoomLoading, setDeleteRoomLoading] = useState(false);

  // C-Lo become-banker modal state (cover-bank or other offers)
  const [showBecomeBankerModal, setShowBecomeBankerModal] = useState(false);
  const [becomeBankerCostCents, setBecomeBankerCostCents] = useState(0);
  const [becomeBankerDeadline, setBecomeBankerDeadline] = useState<number | null>(null);

  // Banker C-Lo bank / min adjustment modal
  const [showCeloBankModal, setShowCeloBankModal] = useState(false);
  const [adjustedBank, setAdjustedBank] = useState(0);
  const [adjustedMinBet, setAdjustedMinBet] = useState(500);
  const [celoModalBankSC, setCeloModalBankSC] = useState(0);

  // Side bet form state
  const [showSideBets, setShowSideBets] = useState(false);
  const [sbType, setSbType] = useState("celo");
  const [sbAmount, setSbAmount] = useState(100);
  const [sbPoint, setSbPoint] = useState(2);
  const [sbLoading, setSbLoading] = useState(false);
  const [sbError, setSbError] = useState<string | null>(null);

  const [bankAdjustLoading, setBankAdjustLoading] = useState(false);

  // Ticker for countdowns (1s)
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Data loaders ───────────────────────────────────────────────────────────
  const loadRoom = useCallback(async () => {
    const sb = createBrowserClient();
    if (!sb) return;
    const { data } = await sb.from("celo_rooms").select("*").eq("id", roomId).maybeSingle();
    if (data) {
      const raw = data as Record<string, unknown>;
      const n = normalizeCeloRoomRow(raw);
      if (n) {
        setRoom({
          ...n,
          speed: String(raw.speed ?? "regular"),
          last_round_was_celo: Boolean(raw.last_round_was_celo),
          banker_celo_at: (raw.banker_celo_at as string | null) ?? null,
        } as Room);
      }
    }
  }, [roomId]);

  const fetchPlayers = useCallback(async () => {
    try {
      const res = await authFetchGet(`/api/celo/room/${encodeURIComponent(roomId)}/snapshot`);
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          players?: Player[];
          room?: Record<string, unknown>;
        };
        if (data.players) {
          const plist = data.players;
          setPlayers(plist);
          if (session?.userId) {
            setMyPlayer(plist.find((p) => sameCeloUserId(p.user_id, session.userId)) ?? null);
          }
        }
        if (data.room) {
          const raw = data.room;
          const n = normalizeCeloRoomRow(raw);
          if (n) {
            setRoom({
              ...n,
              speed: String(raw.speed ?? "regular"),
              last_round_was_celo: Boolean(raw.last_round_was_celo),
              banker_celo_at: (raw.banker_celo_at as string | null) ?? null,
            } as Room);
          }
        }
        return;
      }
    } catch {
      /* fallback to direct Supabase */
    }
    const sb = createBrowserClient();
    if (!sb) return;
    const { data } = await sb
      .from("celo_room_players")
      .select(
        `
        *,
        users (
          id,
          full_name,
          email
        )
      `
      )
      .eq("room_id", roomId)
      .order("seat_number", { ascending: true });
    const plist = (data as Player[]) ?? [];
    setPlayers(plist);
    if (session?.userId) {
      setMyPlayer(plist.find((p) => sameCeloUserId(p.user_id, session.userId)) ?? null);
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
    try {
      const res = await authFetchGet("/api/wallet/get");
      if (res.ok) {
        const d = (await res.json().catch(() => ({}))) as { balance_cents?: number };
        setBalanceCents(d.balance_cents ?? 0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadChat = useCallback(async () => {
    const sb = createBrowserClient();
    if (!sb) return;
    const { data } = await sb
      .from("celo_chat")
      .select("id,user_id,message,created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(200);
    setChatMessages(((data ?? []) as ChatMessage[]) ?? []);
  }, [roomId]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadRoom(), fetchPlayers(), loadRound(), loadBalance(), loadChat()]);
  }, [loadRoom, fetchPlayers, loadRound, loadBalance, loadChat]);

  const loadRoomRef = useRef(loadRoom);
  const loadPlayersRef = useRef(fetchPlayers);
  const loadRoundRef = useRef(loadRound);
  const loadBalanceRef = useRef(loadBalance);
  const loadChatRef = useRef(loadChat);
  const loadAllRef = useRef(loadAll);
  loadRoomRef.current = loadRoom;
  loadPlayersRef.current = fetchPlayers;
  loadRoundRef.current = loadRound;
  loadBalanceRef.current = loadBalance;
  loadChatRef.current = loadChat;
  loadAllRef.current = loadAll;

  // Polling fallback when realtime is delayed or unavailable (desktop, etc.)
  useEffect(() => {
    if (!roomId) return;
    const poll = setInterval(() => {
      void loadPlayersRef.current();
    }, 5000);
    return () => clearInterval(poll);
  }, [roomId]);

  useEffect(() => {
    const sb = createBrowserClient();
    if (!sb || !roomId) return;
    const poll = setInterval(() => {
      void loadRoundRef.current();
    }, 3000);
    return () => clearInterval(poll);
  }, [roomId]);

  const addSystemMessage = useCallback((line: string) => {
    setSystemFeed((prev) => [...prev.slice(-25), line]);
  }, []);

  useEffect(() => {
    balanceRef.current = balanceCents;
  }, [balanceCents]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    setInitialSyncDone(false);
  }, [roomId]);

  useEffect(() => {
    if (!roundSummary) return;
    const t = window.setTimeout(() => setRoundSummary(null), 5000);
    return () => clearTimeout(t);
  }, [roundSummary]);

  /** If realtime is delayed or missed, never leave the roll button stuck disabled */
  useEffect(() => {
    if (!rollInteractionBusy) return;
    const t = window.setTimeout(() => setRollInteractionBusy(false), 15_000);
    return () => clearTimeout(t);
  }, [rollInteractionBusy]);


  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) { router.replace(`/login?redirect=/games/celo/${roomId}`); return; }
      setSession(s);
      setLoading(false);
    });
  }, [router, roomId]);

  // ── Realtime + presence (initial fetch runs after SUBSCRIBED) ─────────────────
  useEffect(() => {
    const sb = createBrowserClient();
    if (!sb || !session?.userId) return;
    let isMounted = true;
    const uid = session.userId;
    const displayName = session.email?.split("@")[0] ?? "Player";
    lastAnimKeyRef.current = "";

    const fetchInitialRoomData = async () => {
      await loadAllRef.current();
      if (isMounted) setInitialSyncDone(true);
    };

    let presenceSyncTimer: ReturnType<typeof setTimeout> | null = null;

    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const raf2 = async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    };

    const roomChannel = sb
      .channel(`celo-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "celo_room_players",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          if (!isMounted) return;
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (!row || String(row.room_id) !== roomId) return;

          await new Promise((r) => setTimeout(r, 200));
          if (!isMounted) return;

          await loadPlayersRef.current();

          const { data: freshRoom } = await sb.from("celo_rooms").select("*").eq("id", roomId).maybeSingle();
          if (freshRoom && isMounted) {
            const raw = freshRoom as Record<string, unknown>;
            const n = normalizeCeloRoomRow(raw);
            if (n) {
              setRoom({
                ...n,
                speed: String(raw.speed ?? "regular"),
                last_round_was_celo: Boolean(raw.last_round_was_celo),
                banker_celo_at: (raw.banker_celo_at as string | null) ?? null,
              } as Room);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "celo_rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          if (!isMounted) return;
          const row = payload.new as Record<string, unknown> | undefined;
          if (!row || String(row.id) !== roomId) return;
          const n = normalizeCeloRoomRow(row);
          if (n) {
            setRoom({
              ...n,
              speed: String(row.speed ?? "regular"),
              last_round_was_celo: Boolean(row.last_round_was_celo),
              banker_celo_at: (row.banker_celo_at as string | null) ?? null,
            } as Room);
          } else {
            void loadRoomRef.current();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "celo_rounds",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          if (!isMounted) return;
          const newRound = payload.new as Round | null;
          if (!newRound || String(newRound.room_id) !== roomId) return;
          const oldRound = (payload.old ?? {}) as Partial<Round>;

          setCurrentRound((prev) => {
            if (prev && prev.id === newRound.id) return { ...prev, ...newRound };
            if (payload.eventType === "INSERT") return newRound;
            return prev;
          });

          const br = newRound.banker_dice;
          const bankerDiceJustSet =
            Array.isArray(br) &&
            br.length === 3 &&
            (!oldRound.banker_dice ||
              !Array.isArray(oldRound.banker_dice) ||
              oldRound.banker_dice.length !== 3);

          if (bankerDiceJustSet) {
            const animKey = `banker_${newRound.id}_${br.join("")}`;
            if (lastAnimKeyRef.current === animKey) {
              setRollInteractionBusy(false);
              void loadRoundRef.current();
              return;
            }
            lastAnimKeyRef.current = animKey;

            void (async () => {
              setCurrentRollerName("Banker");
              setIsRolling(true);
              setLastRollResult(null);
              await raf2();
              await sleep(2500);
              if (!isMounted) return;
              setIsRolling(false);
              setLastRollResult({
                dice: br as [number, number, number],
                rollName: undefined,
                result: undefined,
                bankerPoint: newRound.banker_point ?? undefined,
              });
              await sleep(300);
              if (!isMounted) return;
              setLastRollResult((prev) =>
                prev
                  ? {
                      ...prev,
                      rollName: newRound.banker_dice_name ?? undefined,
                      result: newRound.banker_dice_result ?? undefined,
                    }
                  : null
              );
              await sleep(1500);
              if (!isMounted) return;
              setCurrentRollerName("");
              setRollInteractionBusy(false);
              void loadRoundRef.current();
            })();
            return;
          }

          if (newRound.status === "completed") {
            setRollInteractionBusy(false);
            setTimeout(() => {
              if (isMounted) void loadRoundRef.current();
            }, 1000);
          } else {
            void loadRoundRef.current();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "celo_player_rolls",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (!isMounted) return;
          const roll = payload.new as PlayerRoll;
          if (!roll || String(roll.room_id) !== roomId) return;

          const animKey = `player_${roll.id}`;
          if (lastAnimKeyRef.current === animKey) {
            setRollInteractionBusy(false);
            void loadRoundRef.current();
            return;
          }
          lastAnimKeyRef.current = animKey;

          void (async () => {
            const roller = playersRef.current.find((p) => p.user_id === roll.user_id);
            setCurrentRollerName(getDisplayName(roller ?? null) || "Player");
            setIsRolling(true);
            setLastRollResult(null);
            await raf2();
            await sleep(2500);
            if (!isMounted) return;
            setIsRolling(false);
            setLastRollResult({
              dice: roll.dice as [number, number, number],
              rollName: undefined,
              result: undefined,
              outcome: undefined,
              payoutCents: roll.payout_sc,
            });
            await sleep(300);
            if (!isMounted) return;
            setLastRollResult((prev) =>
              prev
                ? {
                    ...prev,
                    rollName: roll.roll_name ?? undefined,
                    result: roll.roll_result ?? undefined,
                    outcome: roll.outcome ?? undefined,
                  }
                : null
            );
            await sleep(1500);
            if (!isMounted) return;
            setCurrentRollerName("");
            setRollInteractionBusy(false);

            const { data: roundData } = await sb
              .from("celo_rounds")
              .select("*")
              .eq("room_id", roomId)
              .neq("status", "completed")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (roundData && isMounted) {
              setCurrentRound(roundData as Round);
            }
            void loadRoundRef.current();
          })();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "celo_side_bets",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          if (!isMounted) return;
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (row && String(row.room_id) !== roomId) return;
          await loadRoundRef.current();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "celo_chat",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (!isMounted) return;
          const msg = payload.new as ChatMessage;
          if (!msg?.id) return;
          if (String(msg.room_id ?? "") !== roomId) return;
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "wallet_balances",
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          if (!isMounted) return;
          const next = Number((payload.new as { balance?: number }).balance ?? 0);
          const prevBal = balanceRef.current;
          setBalanceCents(next);
          if (next > prevBal) setBalanceFlash("up");
          else if (next < prevBal) setBalanceFlash("down");
          setTimeout(() => {
            if (isMounted) setBalanceFlash(null);
          }, 1500);
        }
      )
      .subscribe((status) => {
        if (!isMounted) return;
        setRealtimeConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          void (async () => {
            await fetchInitialRoomData();
            if (!isMounted) return;
            await loadPlayersRef.current();
          })();
        }
      });

    roomChannelRef.current = roomChannel;

    const presenceChannel = sb.channel(`presence-celo-${roomId}`, {
      config: { presence: { key: uid } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        if (!isMounted) return;
        const state = presenceChannel.presenceState();
        setOnlineCount(Object.keys(state).length);
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        if (!isMounted) return;
        newPresences.forEach((p) => {
          const meta = (p as unknown as { metas?: Array<{ name?: string }> }).metas?.[0];
          const name = meta?.name ?? "Someone";
          addSystemMessage(`${name} joined the room`);
        });
        if (presenceSyncTimer) clearTimeout(presenceSyncTimer);
        presenceSyncTimer = setTimeout(() => {
          presenceSyncTimer = null;
          if (!isMounted) return;
          void loadPlayersRef.current();
        }, 400);
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        if (!isMounted) return;
        leftPresences.forEach((p) => {
          const meta = (p as unknown as { metas?: Array<{ name?: string }> }).metas?.[0];
          const name = meta?.name ?? "Someone";
          addSystemMessage(`${name} left the room`);
        });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && isMounted) {
          await presenceChannel.track({
            user_id: uid,
            name: displayName,
            joined_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      isMounted = false;
      if (presenceSyncTimer) clearTimeout(presenceSyncTimer);
      roomChannelRef.current = null;
      setRealtimeConnected(false);
      sb.removeChannel(roomChannel);
      sb.removeChannel(presenceChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loaders via refs; only reconnect when room or user changes
  }, [session?.userId, roomId, addSystemMessage]);

  useEffect(() => {
    if (realtimeConnected) return;
    const id = window.setInterval(() => {
      roomChannelRef.current?.subscribe();
    }, 3000);
    return () => clearInterval(id);
  }, [realtimeConnected]);

  useEffect(() => {
    return () => {
      if (celoBankModalCloseTimerRef.current) clearTimeout(celoBankModalCloseTimerRef.current);
    };
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────
  const userId = session?.userId ?? "";
  const amIBanker = myPlayer?.role === "banker" || sameCeloUserId(room?.banker_id, userId);
  const amIPlayer = myPlayer?.role === "player";
  const isInRoom = myPlayer !== null;

  // Resolved player IDs in current round
  const resolvedIds = new Set(
    playerRolls.filter((r) => r.outcome === "win" || r.outcome === "loss").map((r) => r.user_id)
  );

  // Active players for this round (respects bank_covered)
  const activePlayers = players
    .filter((p) => p.role === "player")
    .filter(
      (p) =>
        !currentRound?.bank_covered ||
        sameCeloUserId(p.user_id, currentRound.covered_by as string | null | undefined)
    )
    .sort((a, b) => (a.seat_number ?? 0) - (b.seat_number ?? 0));

  const currentTurnPlayer =
    currentRound?.status === "player_rolling"
      ? (() => {
          const seat = currentRound.current_player_seat;
          if (seat != null) {
            const bySeat = activePlayers.find((p) => p.seat_number === seat);
            if (bySeat) return bySeat;
          }
          return activePlayers.find((p) => !resolvedIds.has(p.user_id)) ?? null;
        })()
      : null;
  const isMyTurn = sameCeloUserId(currentTurnPlayer?.user_id, userId);

  const becomeBankerSecondsLeft = useMemo(() => {
    if (becomeBankerDeadline == null) return 0;
    void tick;
    return Math.max(0, Math.ceil((becomeBankerDeadline - Date.now()) / 1000));
  }, [becomeBankerDeadline, tick]);

  useEffect(() => {
    if (!showBecomeBankerModal) return;
    if (becomeBankerSecondsLeft <= 0) {
      setShowBecomeBankerModal(false);
      setBecomeBankerDeadline(null);
    }
  }, [showBecomeBankerModal, becomeBankerSecondsLeft]);

  // ── Action handlers ───────────────────────────────────────────────────────

  async function handleJoin(asSpectator = false) {
    setJoinLoading(true);
    setJoinError(null);
    let res: Response;
    let data: Record<string, unknown>;
    try {
      res = await authFetch("/api/celo/room/join", {
        room_id: roomId,
        role: asSpectator ? "spectator" : "player",
        entry_cents: asSpectator ? undefined : joinEntryCents,
        join_code: room?.room_type === "private" ? joinCode : undefined,
      });
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      setJoinLoading(false);
      setJoinError("Not authenticated");
      return;
    }
    const ok = res.ok;
    setJoinLoading(false);
    if (!ok) { setJoinError((data.error as string) ?? "Failed to join"); return; }
    await loadAll();
    await fetchPlayers();
  }

  async function handleStartRound() {
    setActionLoading("start");
    setError(null);
    let res: Response;
    let data: Record<string, unknown>;
    try {
      res = await authFetch("/api/celo/round/start", { room_id: roomId });
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      setActionLoading(null);
      setError("Not authenticated");
      return;
    }
    const ok = res.ok;
    setActionLoading(null);
    if (!ok) {
      const msg = (data.error as string) ?? "Failed to start round";
      const det = data.details as string | undefined;
      setError(det ? `${msg}: ${det}` : msg);
      return;
    }
    await loadRound();
  }

  async function handleDeleteRoom() {
    if (!window.confirm("Delete this room? You can only do this while you are alone. This cannot be undone.")) {
      return;
    }
    setDeleteRoomLoading(true);
    setError(null);
    try {
      const res = await authFetchDelete(`/api/celo/room/${encodeURIComponent(roomId)}/delete`);
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to delete room");
        return;
      }
      router.push("/games/celo");
    } catch {
      setError("Not authenticated");
    } finally {
      setDeleteRoomLoading(false);
    }
  }

  async function handleRoll() {
    if (!currentRound) return;
    setActionLoading("roll");
    setRollInteractionBusy(true);
    setError(null);
    let res: Response;
    let data: Record<string, unknown>;
    try {
      res = await authFetch("/api/celo/round/roll", {
        room_id: roomId,
        round_id: currentRound.id,
      });
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      setRollInteractionBusy(false);
      setActionLoading(null);
      setError("Not authenticated");
      return;
    }
    const ok = res.ok;
    setActionLoading(null);
    if (!ok) {
      setRollInteractionBusy(false);
      setError((data.error as string) ?? "Roll failed");
      return;
    }
    const rollData = data as unknown as RollResponse;
    // Dice animation is driven only by Supabase realtime (celo_rounds / celo_player_rolls).
    if (rollData.roundComplete && rollData.summary) {
      setRoundSummary(rollData.summary);
    }
    if (rollData.player_can_become_banker) {
      setBecomeBankerCostCents(
        Number(rollData.banker_cost_sc ?? room?.current_bank_cents ?? 0)
      );
      setBecomeBankerDeadline(Date.now() + 30_000);
      setShowBecomeBankerModal(true);
    }
    if (
      rollData.banker_can_adjust_bank &&
      room &&
      sameCeloUserId(room.banker_id, session?.userId ?? "")
    ) {
      const nb = Number(rollData.newBankSC ?? rollData.newBankCents ?? 0);
      setCeloModalBankSC(nb);
      setAdjustedBank(nb);
      setAdjustedMinBet(room.min_bet_cents || 500);
      setShowCeloBankModal(true);
      if (celoBankModalCloseTimerRef.current) clearTimeout(celoBankModalCloseTimerRef.current);
      celoBankModalCloseTimerRef.current = setTimeout(() => setShowCeloBankModal(false), 60_000);
    }
    await loadAll();
    // rollInteractionBusy clears when realtime animation sequence finishes (or safety timeout below).
  }

  async function handleCoverBank() {
    if (!currentRound) return;
    setActionLoading("cover");
    setError(null);
    let res: Response;
    let data: Record<string, unknown>;
    try {
      res = await authFetch("/api/celo/room/cover-bank", {
        room_id: roomId,
        round_id: currentRound.id,
      });
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      setActionLoading(null);
      setError("Not authenticated");
      return;
    }
    const ok = res.ok;
    setActionLoading(null);
    if (!ok) { setError((data.error as string) ?? "Failed to cover bank"); return; }
    await loadAll();
  }

  async function handleAdjustBank(newBank: number, newMinBet: number) {
    if (!room) return;
    setBankAdjustLoading(true);
    setError(null);
    let res: Response;
    let data: Record<string, unknown>;
    try {
      res = await authFetch("/api/celo/room/lower-bank", {
        room_id: roomId,
        new_bank_sc: newBank,
        new_minimum_sc: newMinBet,
      });
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      setBankAdjustLoading(false);
      setError("Not authenticated");
      return;
    }
    const ok = res.ok;
    setBankAdjustLoading(false);
    if (!ok) {
      setError((data.error as string) ?? "Failed to adjust bank");
      return;
    }
    setShowCeloBankModal(false);
    setRoom((prev) =>
      prev
        ? {
            ...prev,
            current_bank_cents: newBank,
            min_bet_cents: newMinBet,
          }
        : prev
    );
    await loadAll();
  }

  async function handleBecomeBanker() {
    if (!currentRound) return;
    setActionLoading("become_banker");
    setError(null);
    let res: Response;
    let data: Record<string, unknown>;
    try {
      res = await authFetch("/api/celo/banker/accept", {
        room_id: roomId,
        round_id: currentRound.id,
      });
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      setActionLoading(null);
      setError("Not authenticated");
      return;
    }
    const ok = res.ok;
    setActionLoading(null);
    setShowBecomeBankerModal(false);
    setBecomeBankerDeadline(null);
    if (!ok) { setError((data.error as string) ?? "Failed to become banker"); return; }
    await loadAll();
  }

  async function handleCreateSideBet(e: React.FormEvent) {
    e.preventDefault();
    if (!currentRound) return;
    setSbLoading(true);
    setSbError(null);
    let res: Response;
    let data: Record<string, unknown>;
    try {
      res = await authFetch("/api/celo/sidebet/create", {
        room_id: roomId,
        round_id: currentRound.id,
        bet_type: sbType,
        amount_cents: sbAmount,
        specific_point: sbType === "specific_point" ? sbPoint : undefined,
      });
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      setSbLoading(false);
      setSbError("Not authenticated");
      return;
    }
    const ok = res.ok;
    setSbLoading(false);
    if (!ok) { setSbError((data.error as string) ?? "Failed to create bet"); return; }
    setSbAmount(100);
    await loadRound();
  }

  async function handleAcceptSideBet(betId: string) {
    setError(null);
    let res: Response;
    let data: Record<string, unknown>;
    try {
      res = await authFetch("/api/celo/sidebet/accept", { bet_id: betId });
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      setError("Not authenticated");
      return;
    }
    const ok = res.ok;
    if (!ok) { setError((data.error as string) ?? "Failed to accept bet"); return; }
    await loadRound();
    await loadBalance();
  }

  async function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || !session?.userId) return;
    const sb = createBrowserClient();
    if (!sb) return;
    setChatSending(true);
    const { error } = await sb.from("celo_chat").insert({
      room_id: roomId,
      user_id: session.userId,
      message: text.slice(0, 500),
    });
    setChatSending(false);
    if (!error) setChatInput("");
  }

  // ── Render: loading ───────────────────────────────────────────────────────
  if (loading || !session) {
    return (
      <div className="min-h-screen bg-[#0e0118] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#F5C842] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!initialSyncDone) {
    return (
      <div className="min-h-screen bg-[#0e0118] flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-[#F5C842] border-t-transparent animate-spin" />
        <p className="text-xs text-violet-400/60">
          {realtimeConnected ? "Syncing room…" : "Connecting to live channel…"}
        </p>
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
    players.filter((p) => p.role === "player" && getPlayerBetCents(p) > 0).length > 0;

  const canDeleteRoom =
    amIBanker &&
    noActiveRound &&
    players.length === 1 &&
    players[0]?.role === "banker" &&
    sameCeloUserId(players[0].user_id, userId);

  const canCoverBank =
    amIPlayer &&
    isBankerRolling &&
    currentRound &&
    !currentRound.bank_covered &&
    !sameCeloUserId(room.banker_id, userId);

  const canRollBanker = amIBanker && isBankerRolling;
  const canRollPlayer = amIPlayer && isPlayerRolling && isMyTurn;
  const showPlayerRollButton = amIPlayer && isPlayerRolling;

  const lastDice = lastRollResult?.dice ?? [];
  const lastResult = lastRollResult?.result;

  const myDiceType = (myPlayer?.dice_type as "standard" | "gold" | "street" | "midnight") ?? "standard";
  const currentDice: [number, number, number] | null =
    lastRollResult?.dice?.length === 3
      ? (lastRollResult.dice as [number, number, number])
      : null;
  const handleAnimationComplete = () => {};

  const bankerPlayer = players.find((p) => sameCeloUserId(p.user_id, room.banker_id)) ?? null;
  const statusLine = getRoundStatusLine({
    round: currentRound,
    amIBanker,
    amIPlayer,
    currentTurnPlayer,
    isMyTurn,
    noActiveRound,
  });
  const showDiceZone =
    (isRolling || lastDice.length > 0) && !(isPlayerRolling && amIBanker);

  return (
    <main
      className="text-white relative overflow-x-hidden"
      style={{
        minHeight: "100vh",
        background: `
          radial-gradient(ellipse at top, rgba(124,58,237,0.15) 0%, transparent 50%),
          radial-gradient(ellipse at bottom, rgba(245,200,66,0.08) 0%, transparent 50%),
          repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.01) 2px, rgba(255,255,255,0.01) 4px),
          #050208
        `,
        color: "#fff",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      {isRolling && currentRollerName ? (
        <div
          className="pointer-events-none absolute left-1/2 top-5 z-[20] -translate-x-1/2 whitespace-nowrap rounded-full border border-[#F5C842] bg-violet-600/90 px-5 py-2 text-sm font-bold text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          🎲 {currentRollerName} is rolling...
        </div>
      ) : null}
      {roundSummary && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="max-w-md w-full rounded-2xl border border-[#F5C842]/35 bg-[#12081f] p-6 shadow-2xl shadow-black/50">
            <p className="text-center text-sm font-bold text-[#F5C842] tracking-wide mb-4">Round complete</p>
            <ul className="space-y-2 text-sm">
              {roundSummary.playerResults.map((r, i) => {
                const rp = players.find((p) => p.user_id === r.userId);
                return (
                  <li
                    key={`${r.userId}-${i}`}
                    className={`font-mono ${r.outcome === "win" ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {getDisplayName(rp ?? { user_id: r.userId })} — {r.label}
                  </li>
                );
              })}
            </ul>
            <p className="text-center text-xs text-violet-300/80 mt-5 border-t border-white/10 pt-4">
              {roundSummary.bankerLabel}
            </p>
          </div>
        </div>
      )}
      {/* ── C-Lo Banker Offer Modal (BUG 2) ── */}
      {showBecomeBankerModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="max-w-sm w-full rounded-2xl border-2 border-[#F5C842]/50 bg-[#12081f] p-6 shadow-2xl shadow-[#F5C842]/20 text-center space-y-4">
            <p className="text-2xl font-black text-[#F5C842]" style={{ textShadow: "0 0 20px #F5C842aa" }}>
              🎲 C-Lo!
            </p>
            <p className="text-base font-semibold text-white">
              {currentRound?.bank_covered
                ? "You covered the bank and won!"
                : "You rolled 4-5-6!"}
            </p>
            <p className="text-sm text-violet-200/80">Want to become the banker?</p>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 space-y-1">
              <p className="text-xs text-violet-300/60">Bank coverage required</p>
              <p className="text-xl font-bold text-[#F5C842] font-mono">
                ${(becomeBankerCostCents / 100).toFixed(2)}
              </p>
              <p className="text-xs text-violet-300/50">
                Your balance: ${(balanceCents / 100).toFixed(2)}
              </p>
            </div>
            <p className="text-xs text-violet-400/60">
              {becomeBankerSecondsLeft}s remaining
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={actionLoading === "become_banker" || balanceCents < becomeBankerCostCents}
                onClick={handleBecomeBanker}
                className="flex-1 rounded-xl bg-gradient-to-r from-[#F5C842] to-[#eab308] py-3 font-bold text-black disabled:opacity-50 transition-all text-sm"
              >
                {actionLoading === "become_banker" ? "Claiming…" : "Become Banker"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBecomeBankerModal(false);
                  setBecomeBankerDeadline(null);
                }}
                className="flex-1 rounded-xl border border-white/15 bg-white/5 py-3 font-medium text-violet-300 text-sm hover:bg-white/10 transition-all"
              >
                No Thanks
              </button>
            </div>
          </div>
        </div>
      )}

      {showCeloBankModal && room && sameCeloUserId(room.banker_id, userId) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 120,
          }}
        >
          <div
            style={{
              background: "#0D0520",
              border: "2px solid #F5C842",
              borderRadius: 20,
              padding: 32,
              maxWidth: 400,
              width: "90%",
              textAlign: "center",
              boxShadow: "0 0 40px rgba(245,200,66,0.3)",
            }}
          >
            <div style={{ fontSize: 48 }}>🎲</div>
            <h2
              style={{
                color: "#F5C842",
                fontFamily: "Cinzel Decorative, Georgia, serif",
                fontSize: 24,
                margin: "16px 0",
              }}
            >
              C-LO! You Win!
            </h2>

            <p style={{ color: "#aaa", marginBottom: 24 }}>Adjust your bank and minimum bet</p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ color: "#F5C842", fontSize: 12 }}>NEW BANK AMOUNT</label>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 8,
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                {[0.25, 0.5, 0.75, 1].map((fraction) => {
                  const amount = Math.round(celoModalBankSC * fraction);
                  return (
                    <button
                      key={fraction}
                      type="button"
                      onClick={() => setAdjustedBank(amount)}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border:
                          adjustedBank === amount ? "2px solid #F5C842" : "1px solid #333",
                        background:
                          adjustedBank === amount ? "rgba(245,200,66,0.2)" : "transparent",
                        color: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      ${(amount / 100).toFixed(0)}
                    </button>
                  );
                })}
              </div>

              <input
                type="number"
                value={adjustedBank / 100}
                onChange={(e) => setAdjustedBank(Number(e.target.value) * 100)}
                style={{
                  width: "100%",
                  marginTop: 12,
                  padding: 12,
                  background: "#1a0535",
                  border: "1px solid #7C3AED",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 18,
                  textAlign: "center",
                }}
                placeholder="Custom amount"
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ color: "#F5C842", fontSize: 12 }}>NEW MINIMUM BET</label>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 8,
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                {[500, 1000, 2000, 5000, 10000].map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setAdjustedMinBet(min)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border:
                        adjustedMinBet === min ? "2px solid #F5C842" : "1px solid #333",
                      background:
                        adjustedMinBet === min ? "rgba(245,200,66,0.2)" : "transparent",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    ${(min / 100).toFixed(0)}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => void handleAdjustBank(adjustedBank, adjustedMinBet)}
                disabled={bankAdjustLoading}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "linear-gradient(135deg, #F5C842, #D4A017)",
                  color: "#0e0118",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: "bold",
                  fontSize: 16,
                  cursor: bankAdjustLoading ? "wait" : "pointer",
                  opacity: bankAdjustLoading ? 0.7 : 1,
                }}
              >
                {bankAdjustLoading ? "…" : "LOCK IT IN"}
              </button>
              <button
                type="button"
                onClick={() => setShowCeloBankModal(false)}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "transparent",
                  color: "#aaa",
                  border: "1px solid #333",
                  borderRadius: 10,
                  cursor: "pointer",
                }}
              >
                KEEP ${(celoModalBankSC / 100).toFixed(0)}
              </button>
            </div>

            <p style={{ color: "#666", fontSize: 11, marginTop: 12 }}>
              This option expires in 60 seconds
            </p>
          </div>
        </div>
      )}

      {/* ── Underground neon walls + spotlight ── */}
      <div style={{ position: "fixed", left: 0, top: 0, width: 60, height: "100vh", background: "linear-gradient(180deg, rgba(124,58,237,0.4), rgba(245,200,66,0.2), rgba(16,185,129,0.2), rgba(124,58,237,0.4))", filter: "blur(30px)", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", right: 0, top: 0, width: 60, height: "100vh", background: "linear-gradient(180deg, rgba(124,58,237,0.4), rgba(245,200,66,0.2), rgba(16,185,129,0.2), rgba(124,58,237,0.4))", filter: "blur(30px)", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", width: 500, height: 500, background: "radial-gradient(ellipse at top, rgba(245,200,66,0.12) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

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
          <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
            <span
              className={`text-[10px] font-semibold ${realtimeConnected ? "text-emerald-400" : "text-red-400"}`}
            >
              {realtimeConnected ? "● LIVE" : "● RECONNECTING…"}
            </span>
            {onlineCount > 0 && (
              <span className="text-[10px] text-violet-400/70">{onlineCount} online</span>
            )}
            <p className="text-[10px] text-violet-400/50">Balance</p>
            <p
              className={`text-sm font-bold font-mono transition-colors ${
                balanceFlash === "up"
                  ? "text-emerald-300"
                  : balanceFlash === "down"
                    ? "text-red-400"
                    : "text-emerald-400"
              }`}
            >
              ${(balanceCents / 100).toFixed(2)}
            </p>
          </div>
        </div>

        {canDeleteRoom && (
          <div className="flex justify-end -mt-1">
            <button
              type="button"
              disabled={deleteRoomLoading}
              onClick={() => void handleDeleteRoom()}
              className="text-xs text-red-400/90 hover:text-red-300 underline disabled:opacity-50"
            >
              {deleteRoomLoading ? "Deleting room…" : "Delete room"}
            </button>
          </div>
        )}

        {/* Bank bar */}
        <div
          style={{ background: "rgba(13,5,32,0.8)", border: "1px solid rgba(124,58,237,0.5)", borderRadius: 16, padding: 20, backdropFilter: "blur(10px)", boxShadow: "0 0 20px rgba(124,58,237,0.2)" }}
          className="flex items-center justify-between gap-4"
        >
          <div>
            <p className="text-[10px] uppercase tracking-widest text-violet-400/60">Current Bank</p>
            <p className="text-[10px] text-violet-400/55 mt-0.5">
              Banker {getDisplayName(bankerPlayer ?? { user_id: room.banker_id })}
            </p>
            <p
              className="font-bold font-mono mt-0.5"
              style={{ fontSize: 48, fontWeight: "bold", color: "#F5C842", textShadow: "0 0 10px #F5C842, 0 0 20px #F5C842, 0 0 40px rgba(245,200,66,0.5)" }}
            >
              ${(room.current_bank_cents / 100).toFixed(2)}
            </p>
          </div>
          <div className="text-right text-xs text-violet-300/60 space-y-0.5">
            <p>Min entry <span className="text-white font-mono">${(room.min_bet_cents / 100).toFixed(2)}</span></p>
            <p>Fee <span className="text-white">{room.platform_fee_pct}%</span></p>
            <p>
              Players{" "}
              <span className="text-white">
                {players.filter((p) => p.role !== "spectator").length}/{room.max_players}
              </span>
            </p>
          </div>
        </div>

        {/* Banker point — player phase */}
        {isPlayerRolling && currentRound && currentRound.banker_point != null && (
          <>
            {amIBanker ? (
              <div
                style={{ background: "rgba(245,200,66,0.15)", border: "1px solid #F5C842", borderRadius: 12, padding: 16 }}
                className="text-center space-y-2 shadow-lg shadow-[#F5C842]/20"
              >
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#F5C842]/80 font-semibold">
                  BANKER POINT: {currentRound.banker_point}
                </p>
                <p
                  className="font-black font-mono text-[#F5C842] leading-none"
                  style={{ fontSize: 72, textShadow: "0 0 24px #F5C842, 0 0 48px #F5C842aa" }}
                >
                  {currentRound.banker_point}
                </p>
                {currentRound.banker_dice_name && (
                  <p className="text-lg font-semibold text-white/95">{currentRound.banker_dice_name}</p>
                )}
                <p className="text-sm text-violet-200/90 pt-1">
                  Waiting for{" "}
                  <span className="text-white font-medium">
                    {currentTurnPlayer ? getDisplayName(currentTurnPlayer) : "the next player"}
                  </span>{" "}
                  to roll…
                </p>
              </div>
            ) : amIPlayer && isMyTurn ? (
              <div
                className="rounded-2xl border-2 border-[#F5C842]/60 p-5 text-center space-y-2 shadow-[0_0_32px_rgba(245,200,66,0.25)]"
                style={{
                  background: "linear-gradient(180deg, rgba(245,200,66,0.18) 0%, rgba(18,8,31,0.95) 100%)",
                }}
              >
                <p
                  className="text-2xl font-black tracking-tight text-[#F5C842]"
                  style={{ textShadow: "0 0 20px #F5C842aa" }}
                >
                  YOUR TURN!
                </p>
                <p className="text-sm font-semibold text-white/90">
                  Beat {currentRound.banker_point} to win!
                </p>
                <p
                  className="font-black font-mono text-[#F5C842] leading-none pt-1"
                  style={{ fontSize: 64, textShadow: "0 0 28px #F5C842, 0 0 56px #F5C84299" }}
                >
                  {currentRound.banker_point}
                </p>
                {currentRound.banker_dice_name && (
                  <p className="text-base font-medium text-violet-200/90">{currentRound.banker_dice_name}</p>
                )}
              </div>
            ) : (
              <div
                style={{ background: "rgba(245,200,66,0.12)", border: "1px solid #F5C842", borderRadius: 12, padding: 16 }}
                className="text-center space-y-1 shadow-lg shadow-[#F5C842]/15"
              >
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#F5C842]/70">Banker point</p>
                <p
                  className="font-black font-mono text-[#F5C842] leading-none"
                  style={{ fontSize: 56, textShadow: "0 0 20px #F5C842, 0 0 40px #F5C842aa" }}
                >
                  {currentRound.banker_point}
                </p>
                {currentRound.banker_dice_name && (
                  <p className="text-sm font-semibold text-white/85">{currentRound.banker_dice_name}</p>
                )}
                <p className="text-sm text-violet-200/85 pt-1">
                  {currentTurnPlayer
                    ? `${getDisplayName(currentTurnPlayer)} is rolling…`
                    : "Waiting for next player…"}
                </p>
              </div>
            )}
          </>
        )}

        {systemFeed.length > 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 max-h-20 overflow-y-auto text-[10px] text-violet-400/80 space-y-0.5">
            {systemFeed.slice(-5).map((line, i) => (
              <p key={`${line}-${i}`}>{line}</p>
            ))}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="shrink-0 text-red-400/70 hover:text-red-300">✕</button>
          </div>
        )}

        {/* Dice display zone */}
        {showDiceZone && (
          <div className="space-y-2">
            <DiceThrow
              rolling={isRolling}
              dice={currentDice}
              diceType={myDiceType}
              onAnimationComplete={handleAnimationComplete}
            />
            {!isRolling && lastRollResult?.rollName && (
              <div className="text-center space-y-1">
                <p className={`text-lg font-bold ${RESULT_STYLE[lastResult ?? "no_count"]?.text ?? "text-white"}`}>
                  {lastRollResult.rollName}
                </p>
                {lastRollResult.bankerPoint && (
                  <p className="text-sm text-violet-300/70">
                    Banker&apos;s point: <span className="text-violet-300 font-bold">{lastRollResult.bankerPoint}</span>
                  </p>
                )}
                {lastRollResult.payoutCents !== undefined && lastRollResult.payoutCents > 0 && (
                  <p className="text-sm text-emerald-400 font-semibold">
                    +${(lastRollResult.payoutCents / 100).toFixed(2)} payout
                  </p>
                )}
                {lastRollResult.banker_can_adjust_bank && showCeloBankModal && (
                  <p className="text-xs text-[#F5C842] animate-pulse">
                    C-Lo! Use the bank adjustment modal — offer expires in 60s
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Round status bar */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex items-center justify-between gap-3 text-sm">
          <div>
            <span
              className={
                isPlayerRolling && amIPlayer && isMyTurn
                  ? "text-[#F5C842] font-semibold"
                  : isBankerRolling && amIBanker
                    ? "text-amber-300 font-medium"
                    : "text-violet-200/90"
              }
            >
              {statusLine}
            </span>
          </div>
          {currentRound?.bank_covered && (
            <span className="text-[10px] text-violet-300/60 bg-violet-500/10 px-2 py-0.5 rounded-full">1v1</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          {/* Start round */}
          {canStartRound && (
            <button
              type="button"
              disabled={actionLoading === "start"}
              onClick={handleStartRound}
              style={{
                flex: 1,
                padding: "16px",
                background: "linear-gradient(135deg, #F5C842, #D4A017)",
                color: "#0e0118",
                border: "none",
                borderRadius: 12,
                fontSize: 18,
                fontWeight: "bold",
                cursor: actionLoading === "start" ? "not-allowed" : "pointer",
                fontFamily: "Courier New, monospace",
                letterSpacing: 2,
                opacity: actionLoading === "start" ? 0.6 : 1,
                boxShadow: "0 0 24px rgba(245,200,66,0.4)",
              }}
            >
              {actionLoading === "start" ? "Starting…" : "🎲 START ROUND"}
            </button>
          )}

          {/* Banker roll */}
          {canRollBanker && (
            <button
              type="button"
              disabled={!!actionLoading || rollInteractionBusy}
              onClick={handleRoll}
              className="flex-1 rounded-xl bg-gradient-to-r from-[#F5C842] to-[#eab308] py-4 font-bold text-black shadow-lg shadow-amber-900/30 disabled:opacity-60 transition-all text-sm"
            >
              {actionLoading === "roll" || rollInteractionBusy ? "Rolling…" : "🎲 Roll Dice"}
            </button>
          )}

          {amIBanker && isPlayerRolling && (
            <div className="flex-1 rounded-xl border border-[#F5C842]/25 bg-[#F5C842]/10 py-4 text-center text-sm font-medium text-[#F5C842]/90">
              Players are rolling…
            </div>
          )}

          {/* Player roll — always visible to players in rolling phase; gold only on your turn */}
          {showPlayerRollButton && (
            <button
              type="button"
              disabled={!canRollPlayer || !!actionLoading || rollInteractionBusy}
              onClick={handleRoll}
              className={`flex-1 rounded-xl py-4 font-bold shadow-lg transition-all text-sm ${
                canRollPlayer
                  ? "bg-gradient-to-r from-[#F5C842] to-[#eab308] text-black shadow-amber-900/30"
                  : "border border-white/10 bg-white/5 text-violet-400/80 shadow-none cursor-not-allowed opacity-70"
              } disabled:opacity-50`}
            >
              {actionLoading === "roll" || rollInteractionBusy
                ? "Rolling…"
                : canRollPlayer
                  ? "🎲 ROLL DICE"
                  : currentTurnPlayer
                    ? `${getDisplayName(currentTurnPlayer)} is rolling…`
                    : "Waiting…"}
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

          {/* Waiting state */}
          {!canStartRound &&
            !canRollBanker &&
            !(amIBanker && isPlayerRolling) &&
            !showPlayerRollButton &&
            !canCoverBank &&
            noActiveRound && (
            <div className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] py-4 text-center text-sm text-violet-300/50">
              {amIBanker
                ? players.filter((p) => p.role === "player" && getPlayerBetCents(p) > 0).length === 0
                  ? "Waiting for players to join…"
                  : "Ready — press Start Round"
                : "Waiting for banker to start…"}
            </div>
          )}
        </div>

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
                  isMe={sameCeloUserId(p.user_id, userId)}
                  isBanker={true}
                  isCurrentTurn={isBankerRolling && sameCeloUserId(p.user_id, userId)}
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
                    isMe={sameCeloUserId(p.user_id, userId)}
                    isBanker={false}
                    isCurrentTurn={sameCeloUserId(currentTurnPlayer?.user_id, p.user_id)}
                    resolvedRoll={roll}
                    phasePlayerRolling={isPlayerRolling}
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
                {openSideBets.filter((b) => !sameCeloUserId(b.creator_id, userId)).length > 0 && (
                  <div className="space-y-2 pt-4">
                    <p className="text-[10px] uppercase tracking-widest text-violet-400/50">Open Bets</p>
                    {openSideBets
                      .filter((b) => !sameCeloUserId(b.creator_id, userId))
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
                {openSideBets.filter((b) => sameCeloUserId(b.creator_id, userId)).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-violet-400/50">My Open Bets</p>
                    {openSideBets
                      .filter((b) => sameCeloUserId(b.creator_id, userId))
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

        {/* Live chat */}
        <div className="rounded-2xl border border-white/[0.07] bg-[#12081f]/80 overflow-hidden">
          <p className="text-[10px] uppercase tracking-widest text-violet-400/50 px-4 pt-3">Room chat</p>
          <div className="max-h-40 overflow-y-auto px-4 py-2 space-y-1.5 text-xs">
            {chatMessages.length === 0 ? (
              <p className="text-violet-500/40 text-center py-2">No messages yet</p>
            ) : (
              chatMessages.map((m) => (
                <div key={m.id} className="text-violet-200/90">
                  <span className="text-violet-500/60 font-mono text-[10px]">
                    {sameCeloUserId(m.user_id, userId)
                      ? "You"
                      : getDisplayName(players.find((pl) => pl.user_id === m.user_id) ?? { user_id: m.user_id })}
                    :
                  </span>{" "}
                  <span className="break-words">{m.message}</span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleSendChat} className="flex gap-2 border-t border-white/[0.06] p-3">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Message…"
              maxLength={500}
              className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-violet-500/40 outline-none focus:border-[#F5C842]/40"
            />
            <button
              type="submit"
              disabled={chatSending || !chatInput.trim()}
              className="rounded-xl bg-[#F5C842]/20 border border-[#F5C842]/40 px-4 py-2 text-xs font-semibold text-[#F5C842] disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
