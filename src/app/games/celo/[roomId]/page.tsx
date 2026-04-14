"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useState, useCallback, useRef, useMemo, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { celoFirstRow } from "@/lib/celo-first-row";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";
import { celoSeatsEqual } from "@/lib/celo-room-rules";
import { celoPlayerStakeCents } from "@/lib/celo-player-stake";
import type { CeloRollStartedPayload } from "@/lib/celo-roll-broadcast";
import { DiceDisplay } from "@/components/celo/DiceDisplay";
import VoiceChat from "@/components/celo/VoiceChat";
import { Cinzel_Decorative } from "next/font/google";

type DiceUiPhase = "idle" | "rolling" | "revealing" | "completed";
import { buildCeloRollStartedPayload } from "@/lib/celo-roll-broadcast";
import { scheduleCeloRollSequence } from "@/lib/celo-roll-animation-client";
import { markCeloPublicLobbyStale } from "@/lib/celo-public-lobby-client";
import { formatGpayAmount } from "@/lib/gpay-coins-branding";
import { useCoins } from "@/hooks/useCoins";

const cinzelRoom = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

function waitNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function formatScLine(sc: number): string {
  return formatGpayAmount(Math.max(0, Math.floor(Number(sc))));
}

function celoRollNameVisual(name: string): { className: string; style: CSSProperties } {
  const raw = name.trim();
  const n = raw.toUpperCase();
  const scaleIn: CSSProperties = { animation: "celoRollNameScaleIn 0.4s ease-out" };
  if (/\bC-?\s*LO\b/i.test(raw) || n.includes("C-LO") || n === "CLO") {
    return {
      className: cinzelRoom.className,
      style: {
        ...scaleIn,
        fontSize: 56,
        color: "#F5C842",
        textShadow: "0 0 10px #F5C842, 0 0 20px #F5C842, 0 0 40px #F5C842",
        lineHeight: 1.05,
        textAlign: "center",
      },
    };
  }
  if (n.includes("SHIT") || n.includes("DICK")) {
    return {
      className: "",
      style: {
        fontSize: 44,
        fontWeight: 800,
        color: "#EF4444",
        textShadow: "0 0 20px #EF4444",
        animation: "celoRollNameShake 0.4s ease-out",
        textAlign: "center",
      },
    };
  }
  if (n.includes("HAND") || n.includes("CRACK") || raw.includes("💥")) {
    return {
      className: "",
      style: {
        ...scaleIn,
        fontSize: 48,
        fontWeight: 800,
        color: "#F5C842",
        textShadow: "0 0 30px #F5C842",
        textAlign: "center",
      },
    };
  }
  if (n.includes("POLICE") || n.includes("POUND")) {
    return {
      className: "",
      style: {
        ...scaleIn,
        fontSize: 44,
        fontWeight: 800,
        color: "#3B82F6",
        textShadow: "0 0 20px #3B82F6",
        textAlign: "center",
      },
    };
  }
  if (n.includes("ZOE") || n.includes("HAITIAN")) {
    return {
      className: "",
      style: {
        ...scaleIn,
        fontSize: 44,
        fontWeight: 800,
        color: "#10B981",
        textShadow: "0 0 20px #10B981",
        textAlign: "center",
      },
    };
  }
  if (n.includes("TRIP")) {
    return {
      className: "",
      style: {
        ...scaleIn,
        fontSize: 44,
        fontWeight: 800,
        color: "#A855F7",
        textShadow: "0 0 20px #A855F7",
        textAlign: "center",
      },
    };
  }
  return {
    className: cinzelRoom.className,
    style: {
      ...scaleIn,
      fontSize: 44,
      color: "#F5C842",
      textShadow: "0 0 16px rgba(245,200,66,0.5)",
      textAlign: "center",
    },
  };
}

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

// ── Types ──────────────────────────────────────────────────────────────────────

type Room = {
  id: string;
  name: string;
  creator_id: string;
  status: string;
  banker_id: string;
  room_type: string;
  max_players: number;
  min_bet_cents: number;
  max_bet_cents: number;
  current_bank_cents: number;
  banker_reserve_cents: number;
  platform_fee_pct: number;
  speed: string;
  last_round_was_celo: boolean;
  banker_celo_at: string | null;
  /** Banker-declared rule: covering player short stop = auto loss */
  no_short_stop?: boolean;
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
  /** Server UTC start for synchronized banker roll animation */
  roll_animation_start_at?: string | null;
  roll_animation_duration_ms?: number | null;
};

type PlayerRoll = {
  id: string;
  round_id: string;
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
  roll_animation_start_at?: string | null;
  point?: number | null;
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
  status?: string;
  currentPlayerSeat?: number | null;
  isCelo?: boolean;
  outcome?: string;
  payoutCents?: number;
  /** API may return cents as payoutSC */
  payoutSC?: number;
  feeSC?: number;
  /** Player's point when result is `point` */
  point?: number;
  playerPoint?: number;
  nextPlayerSeat?: number | null;
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
  animationPayload?: CeloRollStartedPayload;
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
  return (
    String(a).trim().toLowerCase().replace(/-/g, "") === String(b).trim().toLowerCase().replace(/-/g, "")
  );
}

/** Stake in cents from row (join writes both; 0 default on entry_sc must not hide bet_cents). */
function getEntryAmount(player: { entry_sc?: number; bet_cents?: number }): number {
  return celoPlayerStakeCents(player);
}

/** Alias for round / action logic */
function getPlayerBetCents(player: { entry_sc?: number; bet_cents?: number }): number {
  return getEntryAmount(player);
}

/** Display stake for seat cards */
function getPlayerEntry(player: { entry_sc?: number; bet_cents?: number }): string {
  return formatScLine(getEntryAmount(player));
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

/** Lobby / between-rounds copy (banker vs player; uses seated players + stakes). */
function getLobbyStatusLine(opts: {
  isBanker: boolean;
  activePlayers: Player[];
  playersWithBets: Player[];
}): string {
  const { isBanker, activePlayers, playersWithBets } = opts;
  if (isBanker) {
    if (activePlayers.length === 0) return "Waiting for players to join…";
    if (playersWithBets.length === 0) return "Players joined but no bets placed yet";
    return `Ready! ${playersWithBets.length} player(s) ready`;
  }
  return "Waiting for banker to start…";
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
    return "";
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

function getCeloRoomStatusLine(opts: {
  noActiveRound: boolean;
  round: Round | null;
  roomStatus?: string;
  isBanker: boolean;
  amIPlayer: boolean;
  currentTurnPlayer: Player | null;
  isMyTurn: boolean;
  activePlayers: Player[];
  playersWithBets: Player[];
}): string {
  const {
    noActiveRound,
    round,
    roomStatus,
    isBanker,
    amIPlayer,
    currentTurnPlayer,
    isMyTurn,
    activePlayers,
    playersWithBets,
  } = opts;
  if (roomStatus === "rolling" && !round) {
    return isBanker ? "Round started — loading table…" : "Round in progress…";
  }
  if (noActiveRound || !round) {
    return getLobbyStatusLine({ isBanker, activePlayers, playersWithBets });
  }
  return getRoundStatusLine({
    round,
    amIBanker: isBanker,
    amIPlayer,
    currentTurnPlayer,
    isMyTurn,
    noActiveRound: false,
  });
}

// ── Seat display ──────────────────────────────────────────────────────────────

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0] + parts[1]![0]).toUpperCase();
  const s = parts[0] ?? "?";
  return s.length >= 2 ? s.slice(0, 2).toUpperCase() : s.toUpperCase().padEnd(2, "•");
}

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
  const label = player.role === "banker" ? "Banker" : `Seat ${player.seat_number || 1}`;
  const outcome = resolvedRoll?.outcome;
  const hasResolved = outcome === "win" || outcome === "loss";
  const showBankerRollingPulse = !phasePlayerRolling && isCurrentTurn && !hasResolved;
  const ini = initialsFromName(isMe ? "You" : displayName);

  const baseCard: CSSProperties = {
    background: "rgba(13,5,32,0.85)",
    borderRadius: 12,
    padding: 12,
    backdropFilter: "blur(10px)",
    minWidth: 120,
    border: "1px solid rgba(124,58,237,0.4)",
  };

  if (isBanker) {
    baseCard.border = "1px solid #F5C842";
    baseCard.boxShadow = "0 0 15px rgba(245,200,66,0.2)";
  }
  if (isCurrentTurn && !isBanker) {
    baseCard.border = "1px solid #10B981";
    baseCard.boxShadow = "0 0 15px rgba(16,185,129,0.3)";
    baseCard.animation = "celoSeatPulse 2s ease-in-out infinite";
  }

  return (
    <div style={baseCard}>
      <div className="flex flex-col items-center text-center gap-2">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white shrink-0"
          style={{
            background: isBanker ? "linear-gradient(135deg,#F5C842,#b45309)" : "linear-gradient(135deg,#7C3AED,#4c1d95)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          {ini}
        </div>
        <div className="min-w-0 w-full">
          <p className="text-[10px] uppercase tracking-wider text-violet-400/80">{label}</p>
          <p className="text-sm font-semibold text-white truncate">
            {isMe ? "You" : displayName}
            {isBanker ? <span className="ml-1">👑</span> : null}
          </p>
        </div>
        <div className="w-full text-center">
          {player.role !== "banker" && (
            <p className="text-xs font-bold text-[#F5C842] font-mono">{getPlayerEntry(player)}</p>
          )}
          {outcome === "win" && (
            <span className="text-[11px] text-emerald-400 font-bold">
              WIN +{formatScLine(resolvedRoll!.payout_sc)}
            </span>
          )}
          {outcome === "loss" && <span className="text-[11px] text-red-400 font-bold">LOSS</span>}
          {player.role === "player" && phasePlayerRolling && !hasResolved && (
            <span
              className={`text-[10px] flex items-center justify-center gap-1 mt-1 ${
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
            <span className="text-[10px] text-[#F5C842] animate-pulse block mt-1">Rolling…</span>
          )}
        </div>
      </div>
      {resolvedRoll?.roll_name && (
        <p className="text-[9px] text-violet-300/50 mt-2 truncate text-center">{resolvedRoll.roll_name}</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CeloRoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const router = useRouter();
  const { sweepsCoins, refresh: refreshCoins } = useCoins();

  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [playerRolls, setPlayerRolls] = useState<PlayerRoll[]>([]);
  const [openSideBets, setOpenSideBets] = useState<SideBet[]>([]);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [balanceFlash, setBalanceFlash] = useState<"up" | "down" | null>(null);
  const prevSweepsRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rolling animation state (server-synced)
  const [isRolling, setIsRolling] = useState(false);
  const [diceUiPhase, setDiceUiPhase] = useState<DiceUiPhase>("idle");
  const [dicePhaseStatusText, setDicePhaseStatusText] = useState("");
  const [lastRollResult, setLastRollResult] = useState<RollResponse | null>(null);
  /** Dice faces for RealisticDice (null while tumbling). */
  const [currentDice, setCurrentDice] = useState<number[] | null>(null);
  /** Roll name under felt (synced with reveal). */
  const [feltTableRollName, setFeltTableRollName] = useState<string | null>(null);
  /** Bumps to remount dice so keyframes restart. */
  const [rollAnimEpoch, setRollAnimEpoch] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [systemFeed, setSystemFeed] = useState<string[]>([]);
  /** Shown above dice during shared realtime animation */
  const [currentRollerName, setCurrentRollerName] = useState("");
  /** Dice skin on felt follows whoever is rolling (not the local viewer). */
  const [currentRollerDiceType, setCurrentRollerDiceType] = useState<string>("standard");
  const [noShortStop, setNoShortStop] = useState(false);
  /** True after Roll API succeeds until realtime dice animation sequence finishes */
  const [rollInteractionBusy, setRollInteractionBusy] = useState(false);
  const [roundSummary, setRoundSummary] = useState<RoundSummaryPayload | null>(null);
  const [lastPayoutAmount, setLastPayoutAmount] = useState(0);
  const [showPayoutFlash, setShowPayoutFlash] = useState(false);
  /** Point battle display (player vs banker) after a point roll resolves */
  const [playerPointCompare, setPlayerPointCompare] = useState<number | null>(null);
  const [bankerPointCompare, setBankerPointCompare] = useState<number | null>(null);
  const [showRoundSummaryBanner, setShowRoundSummaryBanner] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const roomChannelRef = useRef<RealtimeChannel | null>(null);
  /** Processed roll_started sync keys (broadcast + postgres fallback) */
  const processedSyncKeysRef = useRef<Set<string>>(new Set());
  const cancelRollAnimRef = useRef<(() => void) | null>(null);
  const lastRollPayloadRef = useRef<CeloRollStartedPayload | null>(null);
  const reconnectAnimAttemptedRef = useRef<string>("");
  const playersRef = useRef<Player[]>([]);
  const celoBankModalCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Postgres INSERT row — merged into UI when realtime player animation reveals */
  const pendingPlayerRollMetaRef = useRef<PlayerRoll | null>(null);
  const currentRoundRef = useRef<Round | null>(null);

  // Join form state — default to min_bet_cents once room loads
  const [joinEntryCents, setJoinEntryCents] = useState(0);
  useEffect(() => {
    if (room && joinEntryCents === 0) setJoinEntryCents(room.min_bet_cents);
  }, [room, joinEntryCents]);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [closeRoomLoading, setCloseRoomLoading] = useState(false);

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
  const [copied, setCopied] = useState(false);
  const [showCreatedShareBanner, setShowCreatedShareBanner] = useState(false);

  // Ticker for countdowns (1s)
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("created") !== "1") return;
    setShowCreatedShareBanner(true);
    router.replace(`/games/celo/${roomId}`, { scroll: false });
  }, [roomId, router]);

  const handleShare = useCallback(async () => {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/games/celo/${roomId}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Join my C-Lo game on GarmonPay!",
          text: `${room?.name || "C-Lo Game"} — Min entry ${(room?.min_bet_cents || 500).toLocaleString()} $GPAY. Join now!`,
          url,
        });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  }, [roomId, room?.name, room?.min_bet_cents]);

  // ── Data loaders ───────────────────────────────────────────────────────────
  const loadRoom = useCallback(async () => {
    const sb = createBrowserClient();
    if (!sb) return;
    const { data: roomRows } = await sb.from("celo_rooms").select("*").eq("id", roomId).limit(1);
    const data = celoFirstRow(roomRows);
    if (data) {
      const raw = data as Record<string, unknown>;
      const n = normalizeCeloRoomRow(raw);
      if (n) {
        setRoom({
          ...n,
          speed: String(raw.speed ?? "regular"),
          last_round_was_celo: Boolean(raw.last_round_was_celo),
          banker_celo_at: (raw.banker_celo_at as string | null) ?? null,
          no_short_stop: Boolean(raw.no_short_stop),
        } as Room);
      }
    }
  }, [roomId]);

  useEffect(() => {
    if (room) setNoShortStop(Boolean(room.no_short_stop));
  }, [room]);

  const fetchPlayers = useCallback(async () => {
    try {
      const res = await authFetchGet(`/api/celo/room/${encodeURIComponent(roomId)}/snapshot`);
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          players?: Player[];
          room?: Record<string, unknown>;
          round?: Round | null;
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
              no_short_stop: Boolean(raw.no_short_stop),
            } as Room);
          }
        }
        if ("round" in data) {
          setCurrentRound(data.round ?? null);
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

  const loadRound = useCallback(async (): Promise<Round | null> => {
    const applyRollsForRound = async (round: Round | null) => {
      const sb = createBrowserClient();
      if (!sb) {
        setPlayerRolls([]);
        setOpenSideBets([]);
        return;
      }
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
    };

    try {
      const res = await authFetchGet(`/api/celo/room/${encodeURIComponent(roomId)}/snapshot`);
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { round?: Round | null };
        const round = data.round ?? null;
        setCurrentRound(round);
        await applyRollsForRound(round);
        return round;
      }
    } catch {
      /* fall through to Supabase */
    }

    const sb = createBrowserClient();
    if (!sb) return null;
    const { data: roundRows, error } = await sb
      .from("celo_rounds")
      .select("*")
      .eq("room_id", roomId)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      console.debug("[celo/ui] loadRound Supabase fallback error", error.message);
    }
    const round = (celoFirstRow(roundRows) as Round | null) ?? null;
    setCurrentRound(round);
    await applyRollsForRound(round);
    return round;
  }, [roomId]);

  const loadBalance = useCallback(() => {
    void refreshCoins();
  }, [refreshCoins]);

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

  useEffect(() => {
    if (!session?.userId || !roomId) return;
    if (myPlayer !== null) return;
    void fetchPlayers();
  }, [session?.userId, roomId, myPlayer, fetchPlayers]);

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

  const processRollStartedPayload = useCallback((payload: CeloRollStartedPayload, source: string) => {
    if (processedSyncKeysRef.current.has(payload.syncKey)) {
      console.log("[celo/client] skip duplicate sync", payload.syncKey, source);
      return;
    }
    processedSyncKeysRef.current.add(payload.syncKey);
    while (processedSyncKeysRef.current.size > 80) {
      const iter = processedSyncKeysRef.current.values();
      const first = iter.next().value as string | undefined;
      if (first) processedSyncKeysRef.current.delete(first);
    }

    cancelRollAnimRef.current?.();
    lastRollPayloadRef.current = payload;
    setPlayerPointCompare(null);
    setBankerPointCompare(null);
    console.log("[celo/client] roll_started", source, {
      syncKey: payload.syncKey,
      roundId: payload.roundId,
      kind: payload.kind,
      serverStartTime: payload.serverStartTime,
      revealAt: payload.revealAt,
    });

    const rollerLabel =
      payload.kind === "banker"
        ? "Banker"
        : getDisplayName(
            playersRef.current.find((p) => sameCeloUserId(p.user_id, payload.rollerUserId)) ?? {
              user_id: payload.rollerUserId ?? "",
            }
          ) || "Player";

    if (payload.rollerUserId) {
      const rollerPl =
        playersRef.current.find((p) => sameCeloUserId(p.user_id, payload.rollerUserId)) ?? null;
      setCurrentRollerDiceType(rollerPl?.dice_type ? String(rollerPl.dice_type) : "standard");
    } else {
      setCurrentRollerDiceType("standard");
    }

    setRollAnimEpoch((e) => e + 1);
    setCurrentDice(null);
    setFeltTableRollName(null);
    setCurrentRollerName(rollerLabel);
    setRollInteractionBusy(true);
    setLastRollResult(null);
    setDiceUiPhase("rolling");
    setDicePhaseStatusText("Rolling…");
    setIsRolling(true);

    cancelRollAnimRef.current = scheduleCeloRollSequence(payload, {
      onRollingStart: () => {
        console.log("[celo/client] animation begin", payload.syncKey);
        setDiceUiPhase("rolling");
        setDicePhaseStatusText("Rolling…");
        setIsRolling(true);
      },
      onRevealStart: (dice) => {
        console.log("[celo/client] reveal begin", payload.syncKey);
        setDiceUiPhase("revealing");
        setDicePhaseStatusText("Revealing result…");
        setIsRolling(false);
        setCurrentDice([...dice]);
        const meta = pendingPlayerRollMetaRef.current;
        pendingPlayerRollMetaRef.current = null;
        if (payload.kind === "player" && meta) {
          const bp = currentRoundRef.current?.banker_point ?? null;
          setLastRollResult({
            dice,
            rollName: meta.roll_name ?? undefined,
            result: meta.roll_result ?? undefined,
            outcome: meta.outcome ?? undefined,
            payoutCents: meta.payout_sc,
            bankerPoint: bp ?? undefined,
            playerPoint: meta.point ?? undefined,
          });
          setFeltTableRollName(meta.roll_name ?? null);
          if (meta.point != null && meta.roll_result === "point") {
            setPlayerPointCompare(meta.point);
            setBankerPointCompare(bp);
          }
        } else {
          setLastRollResult({
            dice,
            rollName: undefined,
            result: undefined,
            bankerPoint: undefined,
          });
        }
        void loadRoundRef.current();
      },
      onRollFinished: () => {
        console.log("[celo/client] roll_finished (sequence)", payload.syncKey);
        setDiceUiPhase("completed");
        setDicePhaseStatusText("Round complete");
        setIsRolling(false);
        setCurrentRollerName("");
        setRollInteractionBusy(false);
        lastRollPayloadRef.current = null;
        void loadRoundRef.current();
        window.setTimeout(() => {
          setDiceUiPhase("idle");
          setDicePhaseStatusText("");
        }, 700);
      },
    });
  }, []);

  /** Postgres/broadcast fallback — same timed sequence for every client (no “only observers” gate). */
  const triggerDiceAnimation = useCallback(
    async (
      rollData: {
        dice: [number, number, number];
        rollName: string | null;
        result?: string;
        userId?: string;
        playerRoll?: PlayerRoll | null;
      },
      rollerLabel: string
    ) => {
      if (rollData.userId) {
        const rollerPl =
          playersRef.current.find((p) => sameCeloUserId(p.user_id, rollData.userId)) ?? null;
        setCurrentRollerDiceType(rollerPl?.dice_type ? String(rollerPl.dice_type) : "standard");
      } else {
        setCurrentRollerDiceType("standard");
      }

      cancelRollAnimRef.current?.();
      cancelRollAnimRef.current = null;
      setRollAnimEpoch((e) => e + 1);
      setIsRolling(true);
      setCurrentDice(null);
      setFeltTableRollName(null);
      setLastRollResult(null);
      setPlayerPointCompare(null);
      setBankerPointCompare(null);
      setDiceUiPhase("rolling");
      setDicePhaseStatusText("Rolling…");
      setRollInteractionBusy(true);
      setCurrentRollerName(rollerLabel);
      await waitNextPaint();
      await new Promise((r) => setTimeout(r, 2500));
      setIsRolling(false);
      setCurrentDice([...rollData.dice]);
      setDiceUiPhase("revealing");
      setDicePhaseStatusText("Revealing result…");
      await new Promise((r) => setTimeout(r, 400));

      const pr = rollData.playerRoll;
      if (pr) {
        setFeltTableRollName(pr.roll_name ?? null);
        const bp = currentRoundRef.current?.banker_point ?? null;
        setLastRollResult({
          dice: rollData.dice,
          rollName: pr.roll_name ?? undefined,
          result: pr.roll_result ?? undefined,
          outcome: pr.outcome ?? undefined,
          payoutCents: pr.payout_sc,
          bankerPoint: bp ?? undefined,
          playerPoint: pr.point ?? undefined,
        });
        if (pr.point != null && pr.roll_result === "point") {
          setPlayerPointCompare(pr.point);
          setBankerPointCompare(bp);
        }
      } else {
        setFeltTableRollName(rollData.rollName ?? null);
        setLastRollResult({
          dice: rollData.dice,
          rollName: rollData.rollName ?? undefined,
          result: rollData.result ?? undefined,
        });
      }

      await new Promise((r) => setTimeout(r, 1500));
      setDiceUiPhase("completed");
      setDicePhaseStatusText("Round complete");
      setRollInteractionBusy(false);
      setCurrentRollerName("");
      window.setTimeout(() => {
        setDiceUiPhase("idle");
        setDicePhaseStatusText("");
      }, 700);
      void loadAllRef.current();
    },
    []
  );

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
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    currentRoundRef.current = currentRound;
  }, [currentRound]);

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
    const t = window.setTimeout(() => {
      setRollInteractionBusy(false);
      setIsRolling(false);
    }, 15_000);
    return () => clearTimeout(t);
  }, [rollInteractionBusy]);

  useEffect(() => {
    console.log("[celo/client] dice UI", {
      phase: diceUiPhase,
      isRolling,
      hasDice: Boolean(lastRollResult?.dice),
      rollName: lastRollResult?.rollName,
    });
  }, [diceUiPhase, isRolling, lastRollResult?.dice, lastRollResult?.rollName]);

  useEffect(() => {
    if (!initialSyncDone || !currentRound) return;
    const roomIdStr = String(currentRound.room_id ?? roomId);

    let payload: CeloRollStartedPayload | null = null;
    if (
      currentRound.roll_animation_start_at &&
      currentRound.banker_dice &&
      currentRound.banker_dice.length === 3
    ) {
      const p = buildCeloRollStartedPayload({
        roomId: roomIdStr,
        roundId: currentRound.id,
        dice: currentRound.banker_dice as [number, number, number],
        kind: "banker",
        rollerUserId: currentRound.banker_id,
        serverStartTime: currentRound.roll_animation_start_at,
      });
      if (Date.now() < Date.parse(p.sequenceEndAt)) payload = p;
    } else {
      for (let i = playerRolls.length - 1; i >= 0; i--) {
        const r = playerRolls[i];
        if (!r.created_at || !r.dice || r.dice.length < 3) continue;
        const p = buildCeloRollStartedPayload({
          roomId: roomIdStr,
          roundId: currentRound.id,
          dice: r.dice as [number, number, number],
          kind: "player",
          playerRollId: r.id,
          rollerUserId: r.user_id,
          serverStartTime: r.created_at,
        });
        if (Date.now() < Date.parse(p.sequenceEndAt)) {
          payload = p;
          break;
        }
      }
    }
    if (!payload) return;
    if (reconnectAnimAttemptedRef.current === payload.syncKey) return;
    reconnectAnimAttemptedRef.current = payload.syncKey;
    console.log("[celo/client] reconnect restore roll animation", payload.syncKey);
    processRollStartedPayload(payload, "reconnect-db");
  }, [initialSyncDone, currentRound, playerRolls, roomId, processRollStartedPayload]);

  useEffect(() => {
    const p = lastRollPayloadRef.current;
    if (!p || !lastRollResult?.dice || lastRollResult.rollName) return;

    if (p.kind === "banker" && currentRound?.id === p.roundId && currentRound.banker_dice_name) {
      setLastRollResult((prev) =>
        prev
          ? {
              ...prev,
              rollName: currentRound.banker_dice_name ?? undefined,
              result: currentRound.banker_dice_result ?? undefined,
              bankerPoint: currentRound.banker_point ?? prev.bankerPoint,
            }
          : prev
      );
    }
    if (p.kind === "player" && p.playerRollId) {
      const pr = playerRolls.find((r) => r.id === p.playerRollId);
      if (pr?.roll_name) {
        setLastRollResult((prev) =>
          prev
            ? {
                ...prev,
                rollName: pr.roll_name ?? undefined,
                result: pr.roll_result ?? undefined,
                outcome: pr.outcome ?? undefined,
                payoutCents: pr.payout_sc,
              }
            : prev
        );
      }
    }
  }, [currentRound, playerRolls, lastRollResult?.dice, lastRollResult?.rollName]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    getSessionAsync().then((s) => {
      // Don't redirect unauthenticated users — show room preview instead
      setSession(s);
      setLoading(false);
    });
  }, [roomId]);

  /** Flash balance indicator when $GPAY balance changes (useCoins keeps sweepsCoins live). */
  useEffect(() => {
    if (prevSweepsRef.current === null) {
      prevSweepsRef.current = sweepsCoins;
      return;
    }
    if (sweepsCoins > prevSweepsRef.current) setBalanceFlash("up");
    else if (sweepsCoins < prevSweepsRef.current) setBalanceFlash("down");
    prevSweepsRef.current = sweepsCoins;
    const t = window.setTimeout(() => setBalanceFlash(null), 2000);
    return () => clearTimeout(t);
  }, [sweepsCoins]);

  // ── Realtime: room channel (no login required — spectators + anon public rooms get dice events)
  useEffect(() => {
    const sb = createBrowserClient();
    if (!sb || !roomId) return;
    let isMounted = true;
    processedSyncKeysRef.current.clear();

    const fetchRoomData = async () => {
      await loadAllRef.current();
      if (isMounted) setInitialSyncDone(true);
    };

    const roomChannel = sb
      .channel(`celo-room-${roomId}`, {
        config: { broadcast: { self: true } },
      })
      .on(
        "broadcast",
        { event: "roll_started" },
        ({ payload }) => {
          void (async () => {
            if (!isMounted) return;
            const p = payload as CeloRollStartedPayload;
            if (!p?.syncKey || String(p.roomId) !== roomId || !Array.isArray(p.finalDice) || p.finalDice.length !== 3) {
              return;
            }
            console.log("[celo/client] ws broadcast roll_started", p.syncKey);
            if (p.kind === "player" && p.playerRollId) {
              const { data: prRow } = await sb
                .from("celo_player_rolls")
                .select("*")
                .eq("id", p.playerRollId)
                .maybeSingle();
              if (!isMounted) return;
              if (prRow) pendingPlayerRollMetaRef.current = prRow as PlayerRoll;
            }
            if (!isMounted) return;
            processRollStartedPayload(p, "realtime-broadcast");
          })();
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
          void (async () => {
            if (!isMounted) return;
            const roll = payload.new as PlayerRoll;
            if (!roll || String(roll.room_id) !== roomId) return;

            const animStart = roll.roll_animation_start_at ?? roll.created_at;
            const syncKey = buildCeloRollStartedPayload({
              roomId,
              roundId: roll.round_id,
              dice: roll.dice as [number, number, number],
              kind: "player",
              playerRollId: roll.id,
              rollerUserId: roll.user_id,
              ...(animStart ? { serverStartTime: animStart } : {}),
            }).syncKey;
            if (processedSyncKeysRef.current.has(syncKey)) {
              pendingPlayerRollMetaRef.current = null;
              await fetchRoomData();
              return;
            }
            processedSyncKeysRef.current.add(syncKey);
            pendingPlayerRollMetaRef.current = roll;
            const rollerLabel =
              getDisplayName(
                playersRef.current.find((p) => sameCeloUserId(p.user_id, roll.user_id)) ?? {
                  user_id: roll.user_id,
                }
              ) || "Player";
            await triggerDiceAnimation(
              {
                dice: roll.dice as [number, number, number],
                rollName: roll.roll_name,
                result: roll.roll_result ?? undefined,
                userId: roll.user_id,
                playerRoll: roll,
              },
              rollerLabel
            );
            pendingPlayerRollMetaRef.current = null;
          })();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "celo_rounds",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          if (!isMounted) return;
          const newRound = payload.new as Round | null;
          if (!newRound || String(newRound.room_id) !== roomId) return;
          setCurrentRound(newRound);
          await fetchRoomData();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
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
            return newRound;
          });

          const br = newRound.banker_dice;
          const prevDice = oldRound.banker_dice;
          const diceChanged =
            Array.isArray(br) &&
            br.length === 3 &&
            JSON.stringify(br) !== JSON.stringify(prevDice ?? null);

          if (diceChanged) {
            const syncKey = buildCeloRollStartedPayload({
              roomId,
              roundId: newRound.id,
              dice: br as [number, number, number],
              kind: "banker",
              rollerUserId: newRound.banker_id,
              ...(newRound.roll_animation_start_at
                ? { serverStartTime: newRound.roll_animation_start_at }
                : {}),
            }).syncKey;
            if (processedSyncKeysRef.current.has(syncKey)) {
              await fetchRoomData();
              return;
            }
            processedSyncKeysRef.current.add(syncKey);
            const bankerUid = newRound.banker_id;
            const rollerLabel =
              getDisplayName(
                playersRef.current.find((p) => sameCeloUserId(p.user_id, bankerUid)) ?? {
                  user_id: bankerUid,
                }
              ) || "Banker";
            await triggerDiceAnimation(
              {
                dice: br as [number, number, number],
                rollName: newRound.banker_dice_name ?? null,
                result: newRound.banker_dice_result ?? undefined,
                userId: bankerUid,
              },
              rollerLabel
            );
          } else if (newRound.status === "completed") {
            setRollInteractionBusy(false);
            void loadBalanceRef.current();
            setTimeout(() => {
              if (isMounted) void loadRoundRef.current();
            }, 1000);
          } else {
            void loadRoundRef.current();
          }
          await fetchRoomData();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "celo_room_players",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          if (!isMounted) return;
          await fetchRoomData();
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
        async (payload) => {
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
              no_short_stop: Boolean(row.no_short_stop),
            } as Room);
          } else {
            void loadRoomRef.current();
          }
          await fetchRoomData();
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
      .subscribe((status) => {
        if (!isMounted) return;
        setRealtimeConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          console.log("[celo/client] room channel subscribed", { roomId });
          void (async () => {
            if (!isMounted) return;
            await fetchRoomData();
          })();
        }
      });

    roomChannelRef.current = roomChannel;

    return () => {
      isMounted = false;
      cancelRollAnimRef.current?.();
      cancelRollAnimRef.current = null;
      roomChannelRef.current = null;
      setRealtimeConnected(false);
      sb.removeChannel(roomChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loaders via refs; room channel only depends on roomId
  }, [roomId, addSystemMessage, processRollStartedPayload, triggerDiceAnimation]);

  // Presence (logged-in users only)
  useEffect(() => {
    const sb = createBrowserClient();
    if (!sb || !session?.userId || !roomId) return;
    let isMounted = true;
    const uid = session.userId;
    const displayName = session.email?.split("@")[0] ?? "Player";
    let presenceSyncTimer: ReturnType<typeof setTimeout> | null = null;

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
      sb.removeChannel(presenceChannel);
    };
  }, [session?.userId, session?.email, roomId, addSystemMessage]);

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

  // Seated players eligible to roll this round (respects bank_covered)
  const roundEligiblePlayers = players
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
            const bySeat = roundEligiblePlayers.find((p) => celoSeatsEqual(p.seat_number, seat));
            if (bySeat) return bySeat;
          }
          return roundEligiblePlayers.find((p) => !resolvedIds.has(p.user_id)) ?? null;
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
    if (!asSpectator && room) {
      const totalCommitted = players
        .filter((p) => p.role === "player")
        .reduce((s, p) => s + celoPlayerStakeCents(p), 0);
      const remainingCover = room.banker_reserve_cents - totalCommitted;
      if (joinEntryCents > remainingCover) {
        setJoinLoading(false);
        setJoinError(
          "Your bet cannot exceed the banker's remaining coverage for this table (total player stakes cannot exceed the reserved bank)."
        );
        return;
      }
    }
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
    markCeloPublicLobbyStale();
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
    await loadAll();
    let r = await loadRound();
    if (!r) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      r = await loadRound();
    }
    if (!r) {
      setError("Round started but state did not sync. Tap Retry or refresh the page.");
    }
  }

  async function handleCloseRoom() {
    if (
      !window.confirm(
        "Are you sure you want to close this room? All players will be refunded their entries."
      )
    ) {
      return;
    }
    setCloseRoomLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/celo/room/close", { room_id: roomId });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to close room");
        window.alert(data.error ?? "Failed to close room");
        return;
      }
      await loadBalanceRef.current();
      markCeloPublicLobbyStale();
      router.push("/games/celo");
    } catch {
      setError("Not authenticated");
      window.alert("Not authenticated");
    } finally {
      setCloseRoomLoading(false);
    }
  }

  async function handleRoll() {
    if (!currentRound) return;
    const wasBankerRolling = currentRound.status === "banker_rolling";
    setActionLoading("roll");
    setRollInteractionBusy(true);
    setLastRollResult(null);
    setError(null);
    let res: Response | undefined;
    let data: Record<string, unknown> = {};
    try {
      res = await authFetch("/api/celo/round/roll", {
        room_id: roomId,
        round_id: currentRound.id,
      });
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      setRollInteractionBusy(false);
      setIsRolling(false);
      setError("Network error — try again");
    } finally {
      setActionLoading(null);
    }
    if (!res || !res.ok) {
      if (res && !res.ok) {
        const errMsg =
          (typeof data.error === "string" && data.error) ||
          (typeof data.message === "string" && data.message) ||
          "Roll failed";
        setRollInteractionBusy(false);
        setIsRolling(false);
        setError(errMsg);
      }
      return;
    }
    const rollData = data as unknown as RollResponse;
    console.log("[ROLL RESPONSE]", rollData);

    /* ── Player phase: payouts / banners only — dice animation comes from realtime INSERT for all clients ── */
    if (
      !wasBankerRolling &&
      Array.isArray(rollData.dice) &&
      rollData.dice.length === 3
    ) {
      const payCents = Number(rollData.payoutSC ?? rollData.payoutCents ?? 0);
      const oc = String(rollData.outcome ?? "");
      if (oc === "win" && payCents > 0) {
        setLastPayoutAmount(payCents);
        setShowPayoutFlash(true);
        window.setTimeout(() => setShowPayoutFlash(false), 3000);
      }

      if (rollData.roundComplete) {
        setShowRoundSummaryBanner(true);
        window.setTimeout(() => setShowRoundSummaryBanner(false), 8000);
      }

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

      void loadAll();
      window.setTimeout(() => void loadBalanceRef.current(), 500);
      window.setTimeout(() => void loadBalanceRef.current(), 2200);
      return;
    }

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
    window.setTimeout(() => void loadBalanceRef.current(), 500);
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

  async function handleToggleNoShortStop() {
    const newVal = !noShortStop;
    setNoShortStop(newVal);
    const sb = createBrowserClient();
    if (!sb) return;
    const { error } = await sb.from("celo_rooms").update({ no_short_stop: newVal }).eq("id", roomId);
    if (error) setError(error.message);
    else void loadRoom();
  }

  async function handleShortStop(target: "banker" | "player") {
    if (!currentRound) return;
    setError(null);
    try {
      const res = await authFetch("/api/celo/round/short-stop", {
        room_id: roomId,
        round_id: currentRound.id,
        target,
      });
      const data = (await res.json().catch(() => ({}))) as {
        result?: string;
        message?: string;
        error?: string;
      };
      setIsRolling(false);
      setCurrentDice(null);
      if (!res.ok) {
        setError(data.error ?? data.message ?? "Short stop failed");
        return;
      }
      if (data.result === "auto_loss") {
        setFeltTableRollName("SHORT STOP DENIED! ❌ AUTO LOSS");
        setLastRollResult((prev) =>
          prev
            ? { ...prev, result: "instant_loss", rollName: "SHORT STOP DENIED" }
            : { result: "instant_loss", rollName: "SHORT STOP DENIED" }
        );
      } else {
        setFeltTableRollName("✋ SHORT STOP — NO COUNT! Reroll!");
        setLastRollResult((prev) =>
          prev ? { ...prev, result: "no_count" } : { result: "no_count" }
        );
      }
      await loadAll();
    } catch {
      setError("Short stop failed");
    }
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
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e0118] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#F5C842] border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Render: unauthenticated preview (BUG 1) ───────────────────────────────
  if (!session) {
    const previewBankerName = room ? `${room.name}` : "C-Lo Room";
    const previewBank = room ? formatScLine(room.current_bank_cents) : "—";
    const previewMin = room ? formatScLine(room.min_bet_cents) : "—";
    const previewPlayers = players.filter((p) => p.role !== "spectator").length;
    const previewMax = room?.max_players ?? "?";
    const redirectParam = encodeURIComponent(`/games/celo/${roomId}`);

    return (
      <div className="min-h-screen bg-[#050208] text-white flex flex-col items-center justify-center px-4 py-12"
        style={{ background: "radial-gradient(ellipse at top, rgba(124,58,237,0.18) 0%, transparent 60%), #050208" }}
      >
        <div className="mb-8 text-center">
          <p className="text-4xl mb-3">🎲</p>
          <p className="text-xs uppercase tracking-[0.3em] text-[#F5C842]/60 mb-1">GarmonPay</p>
          <p className="text-2xl font-bold text-white">C-Lo Street Dice</p>
        </div>

        <div className="w-full max-w-sm rounded-2xl border border-[#F5C842]/25 bg-[#0d0520]/90 p-6 space-y-5"
          style={{ boxShadow: "0 0 40px rgba(124,58,237,0.2)", backdropFilter: "blur(12px)" }}
        >
          <div className="text-center">
            <p className="text-lg font-bold text-[#F5C842]">{previewBankerName}</p>
            {room && (
              <p className="text-xs text-violet-400/60 mt-1">
                {room.room_type === "private" ? "🔒 Private Room" : "🌐 Public Room"}
              </p>
            )}
          </div>

          {room && (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-white/5 border border-white/[0.07] p-3">
                <p className="text-[10px] uppercase tracking-widest text-violet-400/60">Bank</p>
                <p className="text-base font-bold text-[#F5C842] font-mono mt-1">{previewBank}</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/[0.07] p-3">
                <p className="text-[10px] uppercase tracking-widest text-violet-400/60">Min Entry</p>
                <p className="text-base font-bold text-white font-mono mt-1">{previewMin}</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/[0.07] p-3">
                <p className="text-[10px] uppercase tracking-widest text-violet-400/60">Players</p>
                <p className="text-base font-bold text-white font-mono mt-1">{previewPlayers}/{previewMax}</p>
              </div>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <Link
              href={`/login?redirect=${redirectParam}`}
              className="block w-full rounded-xl bg-gradient-to-r from-[#F5C842] to-[#eab308] py-3.5 text-center font-bold text-black text-sm shadow-lg shadow-amber-900/30"
            >
              Login to Join
            </Link>
            <Link
              href={`/register?redirect=${redirectParam}`}
              className="block w-full rounded-xl border border-[#7C3AED]/50 bg-[#7C3AED]/15 py-3.5 text-center font-semibold text-violet-300 text-sm hover:bg-[#7C3AED]/25 transition-all"
            >
              Sign Up &amp; Join
            </Link>
          </div>

          <p className="text-center text-xs text-violet-400/50">
            Already have an account?{" "}
            <Link href={`/login?redirect=${redirectParam}`} className="text-[#F5C842] hover:underline">
              Login to join instantly
            </Link>
          </p>
        </div>

        <Link href="/games/celo" className="mt-6 text-xs text-violet-400/50 hover:text-violet-300 transition-colors">
          ← View all C-Lo rooms
        </Link>
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
    const joinBanker = players.find((p) => p.role === "banker");
    const joinBankerTitle = `${getDisplayName(joinBanker ?? { user_id: room.banker_id })}'s C-Lo Room`;
    const joinPlayerCount = players.filter((p) => p.role !== "spectator").length;
    const totalCommittedStakes = players
      .filter((p) => p.role === "player")
      .reduce((s, p) => s + celoPlayerStakeCents(p), 0);
    const remainingCover = Math.max(0, room.banker_reserve_cents - totalCommittedStakes);
    const joinEntryCap = Math.min(room.max_bet_cents, sweepsCoins, remainingCover);
    const entryChipMults = [1, 2, 5, 10];

    return (
      <div className="min-h-screen bg-[#0e0118] text-white relative overflow-x-hidden">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute -left-24 top-16 h-96 w-96 rounded-full bg-violet-700/20 blur-[130px]" />
        </div>
        <div className="relative z-10 mx-auto max-w-md px-4 py-12">
          <div className="flex items-start justify-between gap-3 mb-6">
            <Link href="/games/celo" className="text-violet-300/70 text-sm hover:text-[#F5C842] transition-colors">
              ← C-Lo Lobby
            </Link>
            <button
              type="button"
              onClick={() => void handleShare()}
              style={{
                padding: "6px 14px",
                background: copied ? "rgba(16,185,129,0.2)" : "rgba(124,58,237,0.2)",
                border: `1px solid ${copied ? "#10B981" : "#7C3AED"}`,
                borderRadius: 8,
                color: copied ? "#10B981" : "#A855F7",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: "bold",
                fontFamily: "Courier New, monospace",
              }}
            >
              {copied ? "✓ COPIED!" : "🔗 SHARE"}
            </button>
          </div>
          <div className="rounded-2xl border border-[#F5C842]/20 bg-[#12081f]/90 p-6 shadow-2xl shadow-violet-900/40">
            <div className="text-center mb-6">
              <p className="text-4xl mb-2">🎲</p>
              <h1 className="text-xl font-bold text-[#F5C842]">{joinBankerTitle}</h1>
              <p className="text-sm text-violet-200/80 mt-1">{room.name}</p>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-xs text-violet-300/70">
                <span>
                  Min entry:{" "}
                  <span className="text-white font-mono">{formatScLine(room.min_bet_cents)}</span>
                </span>
                <span>
                  Players:{" "}
                  <span className="text-white font-mono">
                    {joinPlayerCount}/{room.max_players}
                  </span>
                </span>
                <span>
                  Bank:{" "}
                  <span className="text-[#F5C842] font-mono">{formatScLine(room.current_bank_cents)}</span>
                </span>
                <span>{room.platform_fee_pct}% fee</span>
              </div>
              <p className="text-center text-[11px] text-violet-300/80 font-mono mt-3">
                Lobby room code:{" "}
                <span className="text-[#F5C842] font-semibold">{room.id.slice(0, 8).toUpperCase()}</span>
              </p>
            </div>

            {joinError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 mb-4">{joinError}</div>
            )}

            {room.room_type === "private" && (
              <div className="mb-4">
                <label className="text-[10px] uppercase tracking-widest text-violet-400/70">Private join password</label>
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

            <div className="mb-3 flex flex-wrap gap-2 justify-center">
              {entryChipMults.map((m) => {
                const cents = minBet * m;
                if (cents > room.max_bet_cents) return null;
                const capped = Math.min(cents, sweepsCoins, room.max_bet_cents, remainingCover);
                if (capped < minBet) return null;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setJoinEntryCents(capped)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition-colors ${
                      joinEntryCents === capped
                        ? "bg-[#F5C842]/25 text-[#F5C842] border border-[#F5C842]/50"
                        : "bg-white/5 text-violet-200 border border-white/10 hover:bg-white/10"
                    }`}
                  >
                    {formatScLine(cents)}
                  </button>
                );
              })}
            </div>

            <div className="mb-5">
              <label className="text-[10px] uppercase tracking-widest text-violet-400/70">
                Entry Amount — <span className="text-[#F5C842]">{formatScLine(joinEntryCents)}</span>
              </label>
              <input
                type="range"
                min={minBet}
                max={joinEntryCap < minBet ? minBet : Math.max(minBet, joinEntryCap)}
                step={minBet}
                value={
                  joinEntryCap < minBet
                    ? minBet
                    : Math.max(minBet, Math.min(joinEntryCents, joinEntryCap))
                }
                onChange={(e) => setJoinEntryCents(Number(e.target.value))}
                className="mt-2 w-full accent-[#F5C842]"
              />
              <div className="flex justify-between text-[10px] text-violet-400/50 mt-1 gap-2">
                <span>Min: {formatScLine(minBet)}</span>
                <span className="text-right">Your balance: {formatGpayAmount(sweepsCoins)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={
                joinLoading ||
                joinEntryCents < minBet ||
                sweepsCoins < joinEntryCents ||
                joinEntryCents > joinEntryCap
              }
              onClick={() => handleJoin(false)}
              className="w-full rounded-xl bg-gradient-to-r from-[#eab308] via-[#F5C842] to-[#eab308] py-3.5 font-bold text-[#0e0118] shadow-lg shadow-amber-900/30 disabled:opacity-50 transition-all mb-3"
            >
              {joinLoading ? "Joining…" : `JOIN FOR ${formatScLine(joinEntryCents)}`}
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
      </div>
    );
  }

  // ── Render: game view ─────────────────────────────────────────────────────

  const roundStatus = currentRound?.status ?? null;
  const isBankerRolling = roundStatus === "banker_rolling";
  const isPlayerRolling = roundStatus === "player_rolling";
  const roundActive = isBankerRolling || isPlayerRolling;
  const noActiveRound = !currentRound;

  const seatedPlayers = players.filter((p) => p.role === "player");
  /** Players with money on the table (`entry_sc` / `bet_cents`, cents). */
  const playersWithEntries = seatedPlayers.filter((p) => getEntryAmount(p) > 0);
  const playersWithBets = playersWithEntries;

  /** Banker can start when at least one player has a stake and no round is in progress (`POST /api/celo/round/start` also allows `waiting`). */
  const roomOpenForStart = room.status === "active" || room.status === "waiting";
  const canStartRound =
    amIBanker &&
    roomOpenForStart &&
    noActiveRound &&
    playersWithEntries.length > 0 &&
    !isBankerRolling &&
    !isPlayerRolling;

  const canCoverBank =
    amIPlayer &&
    isBankerRolling &&
    currentRound &&
    !currentRound.bank_covered &&
    !sameCeloUserId(room.banker_id, userId);

  const canRollBanker = amIBanker && isBankerRolling && playersWithBets.length > 0;
  const canRollPlayer = amIPlayer && isPlayerRolling && isMyTurn;
  const showPlayerRollButton = amIPlayer && isPlayerRolling;

  const isHeadToHead = Boolean(currentRound?.bank_covered);
  const isCoveringPlayer = Boolean(
    currentRound?.covered_by && sameCeloUserId(String(currentRound.covered_by), userId)
  );
  const canShortStopBanker =
    isRolling && isHeadToHead && isCoveringPlayer && isBankerRolling;
  const canShortStopPlayer = isRolling && isHeadToHead && amIBanker && isPlayerRolling;

  const lastResult = lastRollResult?.result;

  /**
   * Values on dice when not tumbling; null = tumbling / hidden faces in AnimatedDice.
   * `currentDice` holds faces during player local sequence before `lastRollResult` is set.
   * While in player_rolling, never fall back to `banker_dice` — that would show the wrong faces.
   */
  const hasThreeDiceFaces =
    lastRollResult?.dice?.length === 3 || currentDice?.length === 3;

  const hideFinalDiceFaces =
    isRolling ||
    diceUiPhase === "rolling" ||
    (diceUiPhase === "revealing" && !hasThreeDiceFaces);

  const simpleDiceValues: number[] | null = hideFinalDiceFaces
    ? null
    : lastRollResult?.dice?.length === 3
      ? lastRollResult.dice
      : currentDice?.length === 3
        ? currentDice
        : rollInteractionBusy && diceUiPhase === "idle"
          ? null
          : !isPlayerRolling && currentRound?.banker_dice?.length === 3
            ? [...currentRound.banker_dice]
            : null;

  const bankerPlayer = players.find((p) => sameCeloUserId(p.user_id, room.banker_id)) ?? null;
  const statusLine = getCeloRoomStatusLine({
    noActiveRound,
    round: currentRound,
    roomStatus: room.status,
    isBanker: amIBanker,
    amIPlayer,
    currentTurnPlayer,
    isMyTurn,
    activePlayers: seatedPlayers,
    playersWithBets,
  });

  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    console.debug("[celo/ui] bankerControls", {
      roomStatus: room.status,
      roundStatus: currentRound?.status ?? null,
      noActiveRound,
      canStartRound,
      canRollBanker,
      amIBanker,
      playersWithBets: playersWithBets.length,
    });
  }

  const roundLabelShort = currentRound?.id ? currentRound.id.slice(0, 6).toUpperCase() : "—";

  const diceValues: [number, number, number] | null =
    simpleDiceValues && simpleDiceValues.length === 3
      ? [simpleDiceValues[0]!, simpleDiceValues[1]!, simpleDiceValues[2]!]
      : null;
  const rollAnimKey = rollAnimEpoch;

  const watchingCount = Math.max(
    onlineCount,
    players.filter((p) => p.role === "spectator").length
  );

  return (
    <div
      className="text-white relative"
      style={{
        minHeight: "100vh",
        background: "#05010F",
        position: "relative",
        overflow: "hidden",
        color: "#fff",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
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
              <p className="text-xl font-bold text-[#F5C842] font-mono">{formatScLine(becomeBankerCostCents)}</p>
              <p className="text-xs text-violet-300/50">Your balance: {formatGpayAmount(sweepsCoins)}</p>
            </div>
            <p className="text-xs text-violet-400/60">
              {becomeBankerSecondsLeft}s remaining
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={actionLoading === "become_banker" || sweepsCoins < becomeBankerCostCents}
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
                      {formatScLine(amount)}
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
                    {formatScLine(min)}
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
                KEEP {formatScLine(celoModalBankSC)}
              </button>
            </div>

            <p style={{ color: "#666", fontSize: 11, marginTop: 12 }}>
              This option expires in 60 seconds
            </p>
          </div>
        </div>
      )}

      {/* Street scene: brick / concrete + neon */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 28px, rgba(255,255,255,0.04) 28px, rgba(255,255,255,0.04) 29px), repeating-linear-gradient(90deg, transparent, transparent 72px, rgba(255,255,255,0.025) 72px, rgba(255,255,255,0.025) 73px), linear-gradient(180deg, #05010F 0%, #0a0618 45%, #05010F 100%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 right-0 z-0 h-40"
        style={{
          background:
            "radial-gradient(ellipse 90% 120% at 50% -20%, rgba(124,58,237,0.45), transparent 55%)",
          boxShadow: "inset 0 -30px 60px rgba(124,58,237,0.08)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 bottom-0 z-0 w-28 sm:w-36"
        style={{
          background: "linear-gradient(90deg, rgba(245,200,66,0.18), rgba(245,200,66,0.04), transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed right-0 top-0 bottom-0 z-0 w-28 sm:w-36"
        style={{
          background: "linear-gradient(270deg, rgba(245,200,66,0.18), rgba(245,200,66,0.04), transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-0 h-24"
        style={{
          background: "linear-gradient(to top, rgba(16,185,129,0.22), rgba(16,185,129,0.06), transparent)",
        }}
      />

      {/* TOP BAR — 56px fixed */}
      <header
        className="fixed top-0 left-0 right-0 z-[60] flex h-14 items-stretch border-b border-violet-500/25 px-2 sm:px-4"
        style={{
          background: "rgba(5,1,15,0.94)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center pr-2">
          <Link
            href="/games/celo"
            className="text-[10px] text-violet-400 hover:text-[#F5C842] sm:text-xs"
          >
            ← Lobby
          </Link>
          <button
            type="button"
            onClick={() => void handleShare()}
            className="text-left text-[9px] text-violet-500 hover:text-violet-300"
          >
            {copied ? "✓ Link" : "Share"}
          </button>
        </div>
        <h1
          className={`${cinzelRoom.className} flex min-w-0 flex-[1.2] items-center justify-center px-1 text-center text-base font-bold leading-tight text-[#F5C842] sm:text-lg`}
          style={{ textShadow: "0 0 20px rgba(245,200,66,0.35)" }}
        >
          <span className="truncate">{room.name}</span>
        </h1>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center border-x border-violet-500/20 px-1">
          <span className="text-[9px] uppercase tracking-wider text-violet-400">Bank</span>
          <span className="font-mono text-sm font-bold tabular-nums text-[#F5C842] sm:text-base">
            {formatScLine(room.current_bank_cents)}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-end justify-center pl-2 text-right">
          <p className="text-[10px] text-violet-400">
            Round{" "}
            <span className="font-mono font-semibold text-violet-300">#{roundLabelShort}</span>
          </p>
          <p className="text-[10px] text-violet-500">
            <span style={{ color: realtimeConnected ? "#10B981" : "#EF4444" }} className="mr-1">
              {realtimeConnected ? "●" : "○"}
            </span>
            {watchingCount} watching
          </p>
        </div>
      </header>

      <div
        className="relative z-10 mx-auto max-w-[min(1400px,100%)] space-y-3 px-3 pb-[calc(200px+env(safe-area-inset-bottom,0px))] pt-[56px] sm:px-4"
      >
        {showPayoutFlash && (
          <div
            style={{
              position: "fixed",
              top: "30%",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(16,185,129,0.95)",
              border: "2px solid #10B981",
              borderRadius: 16,
              padding: "20px 40px",
              textAlign: "center",
              zIndex: 200,
              animation: "fadeInUp 0.5s ease-out",
            }}
          >
            <div
              style={{
                fontSize: 36,
                fontWeight: "bold",
                color: "#fff",
              }}
            >
              +{formatScLine(lastPayoutAmount)}
            </div>
            <div style={{ color: "#D1FAE5", fontSize: 14 }}>Added to your balance</div>
          </div>
        )}

        {showRoundSummaryBanner && (
          <div
            className="fixed left-1/2 top-1/3 z-[199] -translate-x-1/2 rounded-xl border border-[#F5C842]/40 bg-[#0e0118]/95 px-6 py-4 text-center shadow-xl"
            role="status"
          >
            <p className="text-sm font-bold text-[#F5C842]">Round complete</p>
            <p className="mt-1 text-xs text-violet-300/80">Table updating…</p>
          </div>
        )}

        {showCreatedShareBanner && isInRoom && room && (
          <div
            style={{
              background: "rgba(124,58,237,0.1)",
              border: "1px solid rgba(124,58,237,0.3)",
              borderRadius: 12,
              padding: 20,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            <p style={{ color: "#aaa", fontSize: 13, marginBottom: 8 }}>
              Share this link to invite players:
            </p>
            <p style={{ color: "#888", fontSize: 12, marginBottom: 12 }}>
              Lobby room code:{" "}
              <span style={{ color: "#F5C842", fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>
                {room.id.slice(0, 8).toUpperCase()}
              </span>
            </p>
            <div
              style={{
                background: "#0D0520",
                borderRadius: 8,
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  color: "#F5C842",
                  fontSize: 12,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {typeof window !== "undefined" ? `${window.location.origin}/games/celo/${roomId}` : ""}
              </span>
              <button
                type="button"
                onClick={() => void handleShare()}
                style={{
                  padding: "6px 12px",
                  background: "#7C3AED",
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                }}
              >
                {copied ? "✓ Copied" : "Copy Link"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  const u = typeof window !== "undefined" ? `${window.location.origin}/games/celo/${roomId}` : "";
                  const text = `Join my C-Lo game on GarmonPay! Min ${(room.min_bet_cents || 500).toLocaleString()} $GPAY entry. ${u}`;
                  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
                }}
                style={{
                  padding: "8px 16px",
                  background: "#1DA1F2",
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: "bold",
                }}
              >
                Share on Twitter
              </button>
              <button
                type="button"
                onClick={() => {
                  const u = typeof window !== "undefined" ? `${window.location.origin}/games/celo/${roomId}` : "";
                  const text = `Join my C-Lo game on GarmonPay! ${u}`;
                  window.open("https://www.tiktok.com/", "_blank");
                  void navigator.clipboard.writeText(text).catch(() => {});
                }}
                style={{
                  padding: "8px 16px",
                  background: "#000",
                  border: "1px solid #fff",
                  borderRadius: 8,
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: "bold",
                }}
              >
                Share on TikTok
              </button>
            </div>
          </div>
        )}

        {amIBanker && noActiveRound && (
          <div className="flex justify-end mt-3">
            <button
              type="button"
              disabled={closeRoomLoading}
              onClick={() => void handleCloseRoom()}
              style={{
                padding: "10px 20px",
                background: "transparent",
                border: "1px solid #EF4444",
                borderRadius: 8,
                color: "#EF4444",
                cursor: closeRoomLoading ? "wait" : "pointer",
                fontSize: 13,
                fontWeight: "bold",
              }}
              className="disabled:opacity-50 hover:bg-red-500/10 transition-colors"
            >
              {closeRoomLoading ? "Closing…" : "🗑️ Close Room"}
            </button>
          </div>
        )}

        <p className="text-[10px] text-center text-violet-400/70">
          Min {formatScLine(room.min_bet_cents)} · Fee {room.platform_fee_pct}% · Players{" "}
          {players.filter((p) => p.role !== "spectator").length}/{room.max_players} · Banker{" "}
          {getDisplayName(bankerPlayer ?? { user_id: room.banker_id })}
        </p>

        {statusLine ? (
          <p
            className={`text-center text-xs sm:text-sm px-2 ${
              isPlayerRolling && amIPlayer && isMyTurn
                ? "text-[#F5C842] font-semibold"
                : isBankerRolling && amIBanker
                  ? "text-amber-300/95 font-medium"
                  : "text-violet-200/85"
            }`}
          >
            {statusLine}
          </p>
        ) : null}

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
          {/* LEFT ~65% — dice street table */}
          <div className="min-w-0 flex-1 space-y-4 lg:max-w-[65%]">
        {/* Underground table — neon + felt + 3D dice */}
        <div className="flex flex-col items-center relative" style={{ zIndex: 1 }}>
          <div className="mb-3 flex w-full max-w-xl flex-wrap justify-center gap-2">
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
          </div>
          <p
            className={`${cinzelRoom.className} mb-2 text-center select-none`}
            style={{
              fontSize: 48,
              color: "#7C3AED",
              textShadow:
                "0 0 5px #7C3AED, 0 0 10px #7C3AED, 0 0 20px #7C3AED, 0 0 40px #7C3AED, 0 0 80px #7C3AED",
              letterSpacing: 8,
              lineHeight: 1,
            }}
          >
            C-LO
          </p>
          {(dicePhaseStatusText ||
            (isRolling && currentRollerName ? `🎲 ${currentRollerName} is rolling…` : "")) && (
            <p className="text-center text-xs font-semibold text-[#F5C842]/95 mb-2 px-2" role="status">
              {dicePhaseStatusText ||
                (isRolling && currentRollerName ? `🎲 ${currentRollerName} is rolling…` : "")}
            </p>
          )}
          <div
            className="flex w-full justify-center items-center px-2"
            style={{ padding: 20, position: "relative", zIndex: 1 }}
          >
            <div
              className="flex flex-col items-center justify-center rounded-3xl w-full max-w-[min(100%,360px)] aspect-[4/3] sm:min-h-[280px]"
              style={{
                background:
                  "radial-gradient(ellipse at center, #12101f 0%, #0a0814 55%, #05030c 100%)",
                border: "2px solid rgba(124,58,237,0.55)",
                boxShadow:
                  "0 0 32px rgba(124,58,237,0.35), inset 0 0 48px rgba(0,0,0,0.65)",
              }}
            >
              <DiceDisplay
                dice={diceValues}
                rolling={hideFinalDiceFaces}
                animKey={rollAnimKey}
                diceColor={currentRollerDiceType || "standard"}
                size={52}
              />
            </div>
          </div>
          {!isRolling && (feltTableRollName || lastRollResult?.rollName) ? (
            (() => {
              const rn = feltTableRollName ?? lastRollResult?.rollName ?? "";
              const vis = celoRollNameVisual(rn);
              return (
                <div className={`mt-3 px-2 ${vis.className}`} style={vis.style}>
                  {rn}
                </div>
              );
            })()
          ) : null}
          {!isRolling &&
          lastRollResult &&
          (lastRollResult.bankerPoint != null ||
            (lastRollResult.payoutCents !== undefined && lastRollResult.payoutCents > 0) ||
            lastRollResult.banker_can_adjust_bank) ? (
            <div className="text-center space-y-1 mt-2 w-full max-w-md">
              {lastRollResult.bankerPoint != null && (
                <p className="text-sm text-violet-300/80">
                  Banker&apos;s point:{" "}
                  <span className="text-violet-200 font-bold">{lastRollResult.bankerPoint}</span>
                </p>
              )}
              {lastRollResult.payoutCents !== undefined && lastRollResult.payoutCents > 0 && (
                <p className="text-sm text-emerald-400 font-semibold">
                  +{formatScLine(lastRollResult.payoutCents)} payout
                </p>
              )}
              {lastRollResult.banker_can_adjust_bank && showCeloBankModal && (
                <p className="text-xs text-[#F5C842] animate-pulse">
                  C-Lo! Use the bank adjustment modal — offer expires in 60s
                </p>
              )}
            </div>
          ) : null}

          {isPlayerRolling && currentRound && currentRound.banker_point != null && (
            <div className="mt-5 w-full max-w-md text-center space-y-2 border-t border-white/10 pt-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-[#F5C842]/75 font-semibold">
                Banker point
              </p>
              <p
                className="font-black font-mono text-[#F5C842] leading-none"
                style={{ fontSize: "clamp(2.5rem, 10vw, 3.5rem)", textShadow: "0 0 24px #F5C842, 0 0 48px #F5C842aa" }}
              >
                {currentRound.banker_point}
              </p>
              {currentRound.banker_dice_name && (
                <p className="text-sm font-medium text-violet-200/90">{currentRound.banker_dice_name}</p>
              )}
              {amIBanker ? (
                <p className="text-sm text-violet-200/90">
                  Waiting for{" "}
                  <span className="text-white font-medium">
                    {currentTurnPlayer ? getDisplayName(currentTurnPlayer) : "the next player"}
                  </span>{" "}
                  to roll…
                </p>
              ) : amIPlayer && isMyTurn ? (
                <p className="text-base font-bold text-[#F5C842]" style={{ textShadow: "0 0 12px rgba(245,200,66,0.4)" }}>
                  YOUR TURN — Beat {currentRound.banker_point}!
                </p>
              ) : (
                <p className="text-sm text-violet-200/85">
                  {currentTurnPlayer
                    ? `${getDisplayName(currentTurnPlayer)} is rolling…`
                    : "Waiting for next player…"}
                </p>
              )}
            </div>
          )}

          {isPlayerRolling &&
            playerPointCompare != null &&
            bankerPointCompare != null &&
            lastRollResult?.result === "point" && (
              <div
                style={{
                  textAlign: "center",
                  marginTop: 16,
                  padding: 16,
                  background: "rgba(0,0,0,0.4)",
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 24,
                  }}
                >
                  <div style={{ textAlign: "center" }}>
                    <div style={{ color: "#888", fontSize: 11 }}>YOUR POINT</div>
                    <div
                      style={{
                        fontSize: 48,
                        fontWeight: "bold",
                        color:
                          playerPointCompare > bankerPointCompare
                            ? "#10B981"
                            : "#EF4444",
                      }}
                    >
                      {playerPointCompare ?? "?"}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 24,
                      color: "#F5C842",
                      fontWeight: "bold",
                    }}
                  >
                    VS
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ color: "#888", fontSize: 11 }}>BANKER POINT</div>
                    <div
                      style={{
                        fontSize: 48,
                        fontWeight: "bold",
                        color: "#F5C842",
                      }}
                    >
                      {bankerPointCompare ?? "?"}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 20,
                    fontWeight: "bold",
                    color:
                      playerPointCompare > bankerPointCompare
                        ? "#10B981"
                        : "#EF4444",
                  }}
                >
                  {playerPointCompare > bankerPointCompare
                    ? "🏆 YOU WIN!"
                    : playerPointCompare < bankerPointCompare
                      ? "❌ BANKER WINS"
                      : "🤝 TIE — BANKER WINS"}
                </div>
              </div>
            )}

          {!isRolling &&
            lastRollResult &&
            (lastRollResult.outcome === "win" || lastRollResult.outcome === "loss") &&
            lastRollResult.result !== "point" && (
              <p
                className={`mt-3 text-center text-lg font-bold ${
                  lastRollResult.outcome === "win" ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {lastRollResult.outcome === "win"
                  ? "✓ You win this bet"
                  : "✗ Banker wins this bet"}
              </p>
            )}
        </div>

        {/* Player seats — below felt */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-violet-400/50 mb-2">
            Players ({players.filter((p) => p.role !== "spectator").length})
          </p>
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3 [transform:perspective(400px)_rotateX(4deg)]">
            {players
              .filter((p) => p.role === "player")
              .sort((a, b) => (a.seat_number ?? 0) - (b.seat_number ?? 0))
              .map((p) => {
                const roll =
                  playerRolls
                    .filter((r) => r.user_id === p.user_id && (r.outcome === "win" || r.outcome === "loss"))
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ??
                  null;
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
            {players.filter((p) => p.role === "spectator").length > 0 && (
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
                <p className="text-[10px] text-violet-400/40">
                  {players.filter((p) => p.role === "spectator").length} watching
                </p>
              </div>
            )}
          </div>
        </div>

        {systemFeed.length > 0 && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-950/40 px-3 py-2.5 max-h-24 overflow-y-auto text-[11px] text-violet-100/90 space-y-1.5 leading-snug">
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

        {currentRound?.bank_covered ? (
          <div className="flex justify-center">
            <span className="text-[10px] text-violet-200/80 bg-violet-500/15 px-2.5 py-1 rounded-full border border-violet-500/20">
              1v1
            </span>
          </div>
        ) : null}

        {amIBanker && noActiveRound && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              background: "rgba(124,58,237,0.1)",
              border: "1px solid rgba(124,58,237,0.3)",
              borderRadius: 10,
              marginBottom: 12,
            }}
          >
            <div>
              <div
                style={{
                  color: "#fff",
                  fontWeight: "bold",
                  fontSize: 14,
                }}
              >
                🚫 No Short Stop Rule
              </div>
              <div style={{ color: "#888", fontSize: 11, marginTop: 2 }}>
                Player short stops your roll = auto loss
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleToggleNoShortStop()}
              style={{
                width: 54,
                height: 28,
                borderRadius: 14,
                background: noShortStop ? "#7C3AED" : "#374151",
                border: "none",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
              }}
              aria-pressed={noShortStop}
              aria-label="Toggle no short stop rule"
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "#fff",
                  position: "absolute",
                  top: 3,
                  left: noShortStop ? 29 : 3,
                  transition: "left 0.2s",
                }}
              />
            </button>
          </div>
        )}
          </div>

          <aside className="flex w-full min-w-0 shrink-0 flex-col gap-4 lg:w-[35%] lg:max-w-[35%]">
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
                            <p className="text-xs font-bold text-[#F5C842] font-mono">{formatScLine(b.amount_cents)}</p>
                            <button
                              type="button"
                              disabled={sweepsCoins < b.amount_cents}
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
                          <p className="text-xs font-mono text-[#F5C842]">
                            {formatScLine(b.amount_cents)} · {b.odds_multiplier}×
                          </p>
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
                        max={sweepsCoins}
                        value={sbAmount}
                        onChange={(e) => setSbAmount(Number(e.target.value))}
                        className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-white text-sm outline-none focus:border-[#F5C842]/50 font-mono"
                        placeholder="Amount (cents)"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sbLoading || sbAmount < 100 || sweepsCoins < sbAmount}
                      className="rounded-xl border border-[#F5C842]/40 bg-[#F5C842]/10 px-4 py-2.5 text-[#F5C842] text-sm font-semibold disabled:opacity-40 hover:bg-[#F5C842]/20 transition-all"
                    >
                      {sbLoading ? "…" : "Bet"}
                    </button>
                  </div>

                  {sbError && <p className="text-xs text-red-400">{sbError}</p>}
                  <p className="text-[10px] text-violet-400/40">
                    Win:{" "}
                    {formatScLine(
                      sbAmount * (SIDE_BET_OPTIONS.find((o) => o.value === sbType)?.odds ?? 2)
                    )}{" "}
                    · Min 100 $GPAY ($1.00)
                  </p>
                </form>
              </div>
            )}
          </div>
        )}

        <VoiceChat roomId={roomId} />

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
      </aside>
        </div>
      </div>

      {/* Fixed bottom action bar — lifted above mobile tab nav */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          minHeight: 80,
          marginBottom: 60,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          background: "rgba(5,1,15,0.96)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(124,58,237,0.35)",
        }}
      >
        <div className="mx-auto flex min-h-[80px] max-w-[min(1400px,100%)] flex-col justify-center gap-2 px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-violet-300/90">
            <span className="font-mono text-emerald-400/95">
              Balance {formatGpayAmount(sweepsCoins)}
              {balanceFlash === "up" ? " ↑" : balanceFlash === "down" ? " ↓" : ""}
            </span>
            {myPlayer && myPlayer.role === "player" ? (
              <span>
                Entry{" "}
                <span className="font-mono font-semibold text-[#F5C842]">{getPlayerEntry(myPlayer)}</span>
              </span>
            ) : (
              <span className="text-violet-500/80">Spectator / banker view</span>
            )}
          </div>
          {canRollPlayer && currentRound?.banker_point != null && (
            <p
              className="text-center text-sm font-bold"
              style={{
                color: "#F5C842",
                animation: "celoYourTurnFlash 1.2s ease-in-out infinite",
              }}
            >
              YOUR TURN — Beat {currentRound.banker_point}!
            </p>
          )}

          {amIBanker && room.status === "rolling" && !currentRound && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 py-3.5 px-3 flex flex-col sm:flex-row items-center justify-center gap-2 text-sm text-amber-100/90">
              <span>Syncing round…</span>
              <button
                type="button"
                onClick={() => void loadRound()}
                className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25"
              >
                Retry sync
              </button>
            </div>
          )}

          <div className="flex flex-col gap-3 w-full">
            {canStartRound && (
              <button
                type="button"
                disabled={actionLoading === "start"}
                onClick={handleStartRound}
                style={{
                  width: "100%",
                  padding: "16px 32px",
                  background: "linear-gradient(135deg, #7C3AED, #5B21B6)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  fontSize: 18,
                  fontWeight: "bold",
                  cursor: actionLoading === "start" ? "not-allowed" : "pointer",
                  letterSpacing: 1,
                  opacity: actionLoading === "start" ? 0.6 : 1,
                  boxShadow: "0 0 24px rgba(124,58,237,0.45)",
                }}
              >
                {actionLoading === "start" ? "Starting…" : "START ROUND"}
              </button>
            )}

            {canRollBanker && (
              <button
                type="button"
                disabled={!currentRound || !!actionLoading || rollInteractionBusy}
                onClick={handleRoll}
                className="mx-auto w-full max-md:max-w-[280px] max-md:min-h-[56px] max-md:text-lg"
                style={{
                  width: "100%",
                  padding: "16px 32px",
                  background: "#F5C842",
                  color: "#000",
                  border: "none",
                  borderRadius: 12,
                  fontSize: 18,
                  fontWeight: "bold",
                  cursor:
                    !currentRound || !!actionLoading || rollInteractionBusy ? "not-allowed" : "pointer",
                  opacity: !currentRound || !!actionLoading || rollInteractionBusy ? 0.6 : 1,
                  boxShadow: "0 0 20px rgba(245,200,66,0.35)",
                }}
              >
                {actionLoading === "roll" || rollInteractionBusy ? "Rolling…" : "ROLL DICE"}
              </button>
            )}

            {amIBanker && isPlayerRolling && (
              <div className="rounded-xl border border-[#F5C842]/25 bg-[#F5C842]/10 py-4 text-center text-sm font-medium text-[#F5C842]/90">
                Players are rolling…
              </div>
            )}

            {showPlayerRollButton && (
              <button
                type="button"
                disabled={!currentRound || !canRollPlayer || !!actionLoading || rollInteractionBusy}
                onClick={handleRoll}
                className="mx-auto w-full max-md:max-w-[280px] max-md:min-h-[56px] max-md:text-lg"
                style={{
                  width: "100%",
                  padding: "16px 32px",
                  borderRadius: 12,
                  fontSize: 18,
                  fontWeight: "bold",
                  border: canRollPlayer ? "none" : "1px solid rgba(255,255,255,0.1)",
                  background: canRollPlayer ? "#F5C842" : "rgba(255,255,255,0.05)",
                  color: canRollPlayer ? "#000" : "rgba(156,163,175,0.95)",
                  cursor:
                    !currentRound || !canRollPlayer || !!actionLoading || rollInteractionBusy
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    !currentRound || !canRollPlayer || !!actionLoading || rollInteractionBusy ? 0.7 : 1,
                  boxShadow: canRollPlayer ? "0 0 20px rgba(245,200,66,0.35)" : "none",
                }}
              >
                {actionLoading === "roll" || rollInteractionBusy
                  ? "Rolling…"
                  : canRollPlayer
                    ? "ROLL DICE"
                    : currentTurnPlayer
                      ? `${getDisplayName(currentTurnPlayer)} is rolling…`
                      : "Waiting…"}
              </button>
            )}

            {canCoverBank && (
              <button
                type="button"
                disabled={!!actionLoading || sweepsCoins < room.current_bank_cents}
                onClick={handleCoverBank}
                className="w-full rounded-xl border border-emerald-500/50 bg-emerald-500/10 py-4 font-semibold text-emerald-400 disabled:opacity-50 transition-all text-sm hover:bg-emerald-500/20"
              >
                {actionLoading === "cover"
                  ? "Covering…"
                  : `Cover Bank ${formatScLine(room.current_bank_cents)}`}
              </button>
            )}

            {!canStartRound &&
              !canRollBanker &&
              !(amIBanker && isPlayerRolling) &&
              !showPlayerRollButton &&
              !canCoverBank &&
              noActiveRound &&
              amIBanker &&
              room.status !== "rolling" && (
                <div className="rounded-xl border border-violet-500/15 bg-violet-950/30 py-3.5 px-3 text-center text-sm text-violet-200/85">
                  {seatedPlayers.length === 0
                    ? "Waiting for players to join…"
                    : playersWithBets.length === 0
                      ? "Waiting for players to place entries…"
                      : "Ready — press Start Round"}
                </div>
              )}
          </div>
        </div>
      </div>

      {(canShortStopBanker || canShortStopPlayer) && (
        <button
          type="button"
          onClick={() => void handleShortStop(canShortStopBanker ? "banker" : "player")}
          style={{
            position: "fixed",
            bottom: "calc(156px + env(safe-area-inset-bottom, 0px))",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "18px 48px",
            background: "linear-gradient(135deg, #EF4444, #DC2626)",
            border: "3px solid #FCA5A5",
            borderRadius: 99,
            color: "#fff",
            fontSize: 22,
            fontWeight: "bold",
            cursor: "pointer",
            zIndex: 200,
            boxShadow: "0 0 40px rgba(239,68,68,0.7)",
            letterSpacing: 3,
            animation: "shortStopPulse 0.4s ease-in-out infinite alternate",
          }}
        >
          ✋ SHORT STOP
        </button>
      )}
    </div>
  );
}
