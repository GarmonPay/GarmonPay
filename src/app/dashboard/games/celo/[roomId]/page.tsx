"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Cinzel_Decorative, DM_Sans } from "next/font/google";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";
import { gpcToUsdDisplay } from "@/lib/coins";
import {
  clampDie,
  computeCeloVisualDiceMode,
  extractDiceFromRoll,
  getVisibleDiceFromServer,
  isRealDiceValues,
  realDiceTripletFromUnknown,
  resolveCeloFeltDice,
  shouldClobberFeltTripletOnFetch,
} from "@/lib/celo-room-dice";
import {
  isRoomPauseActive,
  isRoomPauseBlockingActions,
} from "@/lib/celo-pause";
import DiceFace, { type DiceType } from "@/components/celo/DiceFace";
import RollNameDisplay from "@/components/celo/RollNameDisplay";
import { CeloRoomChatPanel, type ChatRow } from "@/components/celo/CeloRoomChatPanel";
import {
  CELO_CHAT_SELECT_WITH_USER,
  CELO_ROOM_PLAYERS_USER_EMBED,
  CELO_USER_PROFILE_FIELDS,
  countSeatedCeloPlayerRoles,
  countStakedEntryPlayers,
  normalizeCeloPlayerRow,
  normalizeCeloUserId,
  type CeloEntryPlayerFields,
} from "@/lib/celo-player-state";
import { resolveDisplayName, type UserDisplayProfile } from "@/lib/display-name";
import { alertCeloUnauthorized, fetchCeloApi, getFreshAccessToken } from "@/lib/celo-api-fetch";
import {
  applyCeloStateUpdate,
  type CeloMergeOptions,
  type CeloMergeSource,
} from "@/lib/celo/celoStateMerge";
import { CELO_PLAYER_ROLL_TIMEOUT_MS } from "@/lib/celo-player-roll-constants";

const CELO_DEBUG = process.env.NODE_ENV === "development";
/** Wait after dice settle before roll-name reveal (ms). */
const CELO_ROLL_RESULT_REVEAL_DELAY_MS = 500;
/** Wait before settlement card reveal (ms). */
const CELO_SETTLEMENT_REVEAL_DELAY_MS = 3000;
/*
ALL ROOM STATE UPDATES MUST GO THROUGH applyCeloStateUpdate()
NO EXCEPTIONS (realtime, fetch, join, roll)
*/

const cinzel = Cinzel_Decorative({ subsets: ["latin"], weight: ["400", "700"] });
const dm = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700"] });

type Room = {
  id: string;
  name: string;
  status: string;
  banker_id: string | null;
  /** True when the bank hit zero and no banker is assigned (see server migration). */
  bank_busted?: boolean | null;
  max_players: number;
  current_bank_sc: number | null;
  current_bank_cents: number | null;
  minimum_entry_sc: number | null;
  min_bet_cents: number | null;
  last_round_was_celo: boolean;
  banker_celo_at: string | null;
  total_rounds: number;
  abandoned_at?: string | null;
  abandonment_fee_charged?: boolean | null;
  paused_at?: string | null;
  pause_expires_at?: string | null;
  paused_by?: string | null;
  pause_reason?: string | null;
};

type Player = CeloEntryPlayerFields;

type Round = {
  id: string;
  room_id: string;
  round_number: number;
  status: string;
  prize_pool_sc: number | null;
  banker_point: number | null;
  current_player_seat: number | null;
  /** Some server flows set the active roller by user id; use with current_player_seat. */
  roller_user_id?: string | null;
  player_celo_offer: boolean;
  player_celo_expires_at: string | null;
  /** Point-tie round: stakes were refunded, no main winner. */
  push?: boolean;
  /** Set when the banker has rolled; source of truth for their dice in this round. */
  banker_dice?: unknown;
  /** Shared static triplet (1–6) until the banker commits `banker_dice`; server-generated at round insert. */
  idle_preview_dice?: unknown;
  banker_dice_name?: string | null;
  banker_dice_result?: string | null;
  banker_roll_in_flight?: boolean | null;
  roll_processing?: boolean | null;
  roll_animation_start_at?: string | null;
  roll_animation_duration_ms?: number | null;
  platform_fee_sc?: number | null;
  /** UTC instant by which the current seat must submit a roll (`player_rolling`). */
  player_roll_deadline_at?: string | null;
};

function celoUidShort(uid: string): string {
  const c = uid.replace(/-/g, "");
  return (c.slice(0, 6) || "??????").toUpperCase();
}

/** Uppercase seat label for banners — prefers profile fields, else short user id. */
function celoBannerSeatLabel(players: Player[], uid: string | null | undefined): string {
  const id = String(uid ?? "").trim();
  if (!id) return "???";
  const row = players.find(
    (p) => normalizeCeloUserId(p.user_id) === normalizeCeloUserId(id)
  );
  const label = resolveDisplayName(
    row
      ? {
          full_name: row.full_name,
          username: row.username,
          email: row.email ?? null,
        }
      : null,
    id
  ).trim();
  if (label) return label.toUpperCase();
  return celoUidShort(id);
}

function firstSeatedPlayerUserId(players: Player[]): string | null {
  const rows = players
    .filter((p) => String(p.role ?? "").toLowerCase() === "player")
    .sort((a, b) => (a.seat_number ?? 999) - (b.seat_number ?? 999));
  return rows[0]?.user_id ?? null;
}

function ucCulture(s: string): string {
  return s.trim().toUpperCase();
}

/** Inactive dice slot — no fake pips before a server roll. */
function CeloDiceEmptyState({ diceSize }: { diceSize: number }) {
  const delayCls = ["", "delay-150", "delay-300"] as const;
  return (
    <div
      className="flex items-center justify-center gap-2 opacity-60 md:gap-3"
      aria-hidden
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`animate-pulse rounded-md bg-neutral-800/90 shadow-inner ring-1 ring-white/10 ${delayCls[i]}`}
          style={{ width: diceSize, height: diceSize }}
        />
      ))}
    </div>
  );
}

function estimatedBankerTakeSc(round: Round): number | null {
  const pool = round.prize_pool_sc;
  if (typeof pool !== "number" || !Number.isFinite(pool)) return null;
  const fee = round.platform_fee_sc;
  const f = typeof fee === "number" && Number.isFinite(fee) ? fee : 0;
  return Math.max(0, Math.floor(pool - f));
}

type CeloResultBannerModel = {
  title: string;
  kind: "push" | "win";
  /** Confetti + winner chrome — false for push */
  celebrate: boolean;
  winnerSide: "banker" | "player" | null;
  winnerUserId: string | null;
  loserUserId: string | null;
  /** True when every seated player wins (e.g. banker instant_loss). */
  multiPlayerWin?: boolean;
  /** Net win for the winning seat when known (player payout from roll row, or est. banker take). */
  winAmountSc: number | null;
  bankerLabel: string;
  playerLabel: string;
  headlineWinnerLabel: string;
  detailLine: string;
  bankerTriplet: [number, number, number] | null;
  bankerRollName: string | null;
  playerTriplet: [number, number, number] | null;
  playerRollName: string | null;
  showPlayerRow: boolean;
};

type RollRowForBanner = {
  outcome: string | null;
  roll_name?: string | null;
  roll_result?: string | null;
  point?: number | null;
  dice?: unknown;
  user_id?: string | null;
  payout_sc?: number | null;
};

/** Outcome line + dice for the result overlay (`rolls` newest-first). */
function buildCeloResultBannerContent(
  round: Round,
  rolls: RollRowForBanner[],
  players: Player[],
  roomBankerId: string | null
): CeloResultBannerModel {
  const bankerUid = roomBankerId?.trim() ? String(roomBankerId) : null;
  const bankerTag = bankerUid ? celoBannerSeatLabel(players, bankerUid) : "BANKER";

  const bRes = String(round.banker_dice_result ?? "");
  const bName = String(round.banker_dice_name ?? "").trim();
  const bPt = round.banker_point;
  const nameOr = (s: string, fallback: string) =>
    s.trim().length ? s.trim() : fallback;

  const bankerTriplet = realDiceTripletFromUnknown(round.banker_dice);
  const decisive = rolls.find((r) =>
    ["win", "loss", "push"].includes(String(r.outcome ?? "").toLowerCase())
  );
  const playerTriplet = decisive?.dice
    ? realDiceTripletFromUnknown(decisive.dice)
    : null;
  const pRollName = String(decisive?.roll_name ?? "").trim();

  const rollerUid =
    decisive?.user_id?.trim() ||
    (round.roller_user_id ? String(round.roller_user_id) : null);
  const playerTag = rollerUid
    ? celoBannerSeatLabel(players, rollerUid)
    : firstSeatedPlayerUserId(players)
      ? celoBannerSeatLabel(players, firstSeatedPlayerUserId(players))
      : "PLAYER";

  if (round.push === true || decisive?.outcome === "push") {
    const pt =
      typeof bPt === "number"
        ? bPt
        : typeof decisive?.point === "number"
          ? decisive.point
          : "?";
    const pushPlayerUid =
      decisive?.user_id?.trim() ||
      (round.roller_user_id ? String(round.roller_user_id) : null);
    const pushPlayerTag = pushPlayerUid
      ? celoBannerSeatLabel(players, pushPlayerUid)
      : playerTag;
    const detail = `PUSH — ${bankerTag} and ${pushPlayerTag} both rolled ${pt}`;
    return {
      title: `${detail}. Stakes refunded.`,
      kind: "push",
      celebrate: false,
      winnerSide: null,
      winnerUserId: null,
      loserUserId: null,
      multiPlayerWin: false,
      winAmountSc: null,
      bankerLabel: bankerTag,
      playerLabel: pushPlayerTag,
      headlineWinnerLabel: "PUSH",
      detailLine: detail,
      bankerTriplet,
      bankerRollName: bName || null,
      playerTriplet,
      playerRollName: pRollName || null,
      showPlayerRow: playerTriplet != null,
    };
  }

  if (bRes === "instant_win" && bankerUid) {
    const take = estimatedBankerTakeSc(round);
    return {
      title: `${bankerTag} WINS — ${ucCulture(nameOr(bName, "?"))}`,
      kind: "win",
      celebrate: true,
      winnerSide: "banker",
      winnerUserId: bankerUid,
      loserUserId: null,
      multiPlayerWin: false,
      winAmountSc: take,
      bankerLabel: bankerTag,
      playerLabel: playerTag,
      headlineWinnerLabel: bankerTag,
      detailLine: ucCulture(nameOr(bName, "?")),
      bankerTriplet,
      bankerRollName: bName || null,
      playerTriplet: null,
      playerRollName: null,
      showPlayerRow: false,
    };
  }
  if (bRes === "instant_loss" && bankerUid) {
    const rep =
      firstSeatedPlayerUserId(players) ?? rollerUid ?? decisive?.user_id ?? null;
    const winTag = rep ? celoBannerSeatLabel(players, rep) : "PLAYERS";
    const winUid = rep;
    return {
      title: `${winTag} WINS — Banker rolled ${nameOr(bName, "?")}`,
      kind: "win",
      celebrate: true,
      winnerSide: "player",
      winnerUserId: winUid,
      loserUserId: bankerUid,
      multiPlayerWin: true,
      winAmountSc: null,
      bankerLabel: bankerTag,
      playerLabel: playerTag,
      headlineWinnerLabel: winTag,
      detailLine: `Banker rolled ${ucCulture(nameOr(bName, "?"))}`,
      bankerTriplet,
      bankerRollName: bName || null,
      playerTriplet: null,
      playerRollName: null,
      showPlayerRow: false,
    };
  }

  const decisiveRollResult = String(decisive?.roll_result ?? "").toLowerCase();

  if (
    bRes === "point" &&
    decisive &&
    decisive.point != null &&
    bPt != null &&
    decisiveRollResult === "point"
  ) {
    const bp = bPt;
    const pp = decisive.point;
    const bpN = Math.floor(Number(bp));
    const ppN = Math.floor(Number(pp));
    /** Point-vs-point: show numeric points (e.g. "5 beats 4"), not slang roll names ("Pound beats Zoe"). */
    const pointBeatDetailWin = `${ppN} beats ${bpN}`;
    const pay = Math.floor(Number(decisive.payout_sc ?? 0));
    if (String(decisive.outcome).toLowerCase() === "win" && bankerUid) {
      const wUid = decisive.user_id?.trim()
        ? String(decisive.user_id)
        : rollerUid;
      const hl = celoBannerSeatLabel(
        players,
        wUid ?? rollerUid ?? decisive.user_id
      );
      return {
        title: `${playerTag} WINS — ${pointBeatDetailWin}`,
        kind: "win",
        celebrate: true,
        winnerSide: "player",
        winnerUserId: wUid,
        loserUserId: bankerUid,
        multiPlayerWin: false,
        winAmountSc: pay > 0 ? pay : null,
        bankerLabel: bankerTag,
        playerLabel: playerTag,
        headlineWinnerLabel: hl,
        detailLine: pointBeatDetailWin,
        bankerTriplet,
        bankerRollName: bName || null,
        playerTriplet,
        playerRollName: pRollName || null,
        showPlayerRow: playerTriplet != null,
      };
    }
    if (String(decisive.outcome).toLowerCase() === "loss" && bankerUid) {
      const lUid = decisive.user_id?.trim()
        ? String(decisive.user_id)
        : rollerUid;
      const take = estimatedBankerTakeSc(round);
      const pointBeatDetailLoss = `${bpN} beats ${ppN}`;
      return {
        title: `${bankerTag} WINS — ${pointBeatDetailLoss}`,
        kind: "win",
        celebrate: true,
        winnerSide: "banker",
        winnerUserId: bankerUid,
        loserUserId: lUid ?? null,
        multiPlayerWin: false,
        winAmountSc: take,
        bankerLabel: bankerTag,
        playerLabel: playerTag,
        headlineWinnerLabel: bankerTag,
        detailLine: pointBeatDetailLoss,
        bankerTriplet,
        bankerRollName: bName || null,
        playerTriplet,
        playerRollName: pRollName || null,
        showPlayerRow: playerTriplet != null,
      };
    }
  }

  if (
    decisive &&
    String(decisive.outcome).toLowerCase() === "win" &&
    String(decisive.roll_result ?? "").toLowerCase() === "instant_win" &&
    bankerUid
  ) {
    const wUid = decisive.user_id?.trim()
      ? String(decisive.user_id)
      : rollerUid;
    const pay = Math.floor(Number(decisive.payout_sc ?? 0));
    const hl = celoBannerSeatLabel(players, wUid ?? rollerUid);
    return {
      title: `${playerTag} WINS — ${nameOr(pRollName, "?")}`,
      kind: "win",
      celebrate: true,
      winnerSide: "player",
      winnerUserId: wUid,
      loserUserId: bankerUid,
      multiPlayerWin: false,
      winAmountSc: pay > 0 ? pay : null,
      bankerLabel: bankerTag,
      playerLabel: playerTag,
      headlineWinnerLabel: hl,
      detailLine: ucCulture(nameOr(pRollName, "?")),
      bankerTriplet,
      bankerRollName: bName || null,
      playerTriplet,
      playerRollName: pRollName || null,
      showPlayerRow: playerTriplet != null,
    };
  }
  if (
    decisive &&
    String(decisive.outcome).toLowerCase() === "loss" &&
    String(decisive.roll_result ?? "").toLowerCase() === "instant_loss" &&
    bankerUid
  ) {
    const lUid = decisive.user_id?.trim()
      ? String(decisive.user_id)
      : rollerUid;
    const take = estimatedBankerTakeSc(round);
    return {
      title: `${bankerTag} WINS — Player rolled ${nameOr(pRollName, "?")}`,
      kind: "win",
      celebrate: true,
      winnerSide: "banker",
      winnerUserId: bankerUid,
      loserUserId: lUid ?? null,
      multiPlayerWin: false,
      winAmountSc: take,
      bankerLabel: bankerTag,
      playerLabel: playerTag,
      headlineWinnerLabel: bankerTag,
      detailLine: `Player rolled ${ucCulture(nameOr(pRollName, "?"))}`,
      bankerTriplet,
      bankerRollName: bName || null,
      playerTriplet,
      playerRollName: pRollName || null,
      showPlayerRow: playerTriplet != null,
    };
  }

  return {
    title: `Round complete${pRollName ? ` — ${pRollName}` : ""}`,
    kind: "win",
    celebrate: false,
    winnerSide: null,
    winnerUserId: null,
    loserUserId: null,
    multiPlayerWin: false,
    winAmountSc: null,
    bankerLabel: bankerTag,
    playerLabel: playerTag,
    headlineWinnerLabel: "TABLE",
    detailLine: pRollName ? ucCulture(pRollName) : "Round complete",
    bankerTriplet,
    bankerRollName: bName || null,
    playerTriplet,
    playerRollName: pRollName || null,
    showPlayerRow: playerTriplet != null,
  };
}

function bankVal(r: Room) {
  return r.current_bank_sc ?? r.current_bank_cents ?? 0;
}
function minVal(r: Room) {
  return Math.max(500, r.minimum_entry_sc ?? r.min_bet_cents ?? 500);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function sortCeloPlayersBySeat(list: Player[]): Player[] {
  return [...list].sort((a, b) => {
    const an = a.seat_number;
    const bn = b.seat_number;
    if (an == null && bn == null) return 0;
    if (an == null) return 1;
    if (bn == null) return -1;
    return an - bn;
  });
}

const CELO_PLAYER_FETCH_SELECT = `*,${CELO_ROOM_PLAYERS_USER_EMBED}`;

function normalizeChatRow(raw: unknown): ChatRow {
  const r = raw as Record<string, unknown>;
  const uRaw = r.users;
  const u = (Array.isArray(uRaw) ? uRaw[0] : uRaw) as Record<string, unknown> | null | undefined;
  const str = (v: unknown) => {
    const s = String(v ?? "").trim();
    return s.length ? s : null;
  };
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    message: String(r.message ?? ""),
    created_at: String(r.created_at ?? ""),
    is_system: Boolean(r.is_system),
    display_name: u ? str((u as { display_name?: unknown }).display_name) : null,
    full_name: u ? str(u.full_name) : null,
    username: u ? str(u.username) : null,
    email: u ? str(u.email) : null,
    avatar_url: u ? str(u.avatar_url) : null,
  };
}

function mergePlayerProfile(prev: Player | undefined, next: Player): Player {
  if (!prev) return next;
  return {
    ...next,
    full_name: next.full_name ?? prev.full_name ?? null,
    username: next.username ?? prev.username ?? null,
    email: next.email ?? prev.email ?? null,
    avatar_url: next.avatar_url ?? prev.avatar_url ?? null,
  };
}

export default function CeloRoomPage() {
  const params = useParams();
  const roomId = String(params.roomId ?? "");
  const router = useRouter();
  const supabase = useMemo(() => createBrowserClient(), []);
  const [me, setMe] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [myBalance, setMyBalance] = useState(0);
  const [rollName, setRollName] = useState<string | null>(null);
  const [rollPoint, setRollPoint] = useState<number | null>(null);
  const [dice, setDice] = useState<number[] | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rollingAction, setRollingAction] = useState(false);
  const [startRoundSubmitting, setStartRoundSubmitting] = useState(false);
  const [pauseTick, setPauseTick] = useState(0);
  const [pauseUiBusy, setPauseUiBusy] = useState(false);
  const [pauseVoteBusy, setPauseVoteBusy] = useState(false);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [pauseVoteCount, setPauseVoteCount] = useState(0);
  const [connection, setConnection] = useState<"connecting" | "live" | "offline">("connecting");
  const [myDiceType, setMyDiceType] = useState<DiceType>("standard");
  const [diceModal, setDiceModal] = useState(false);
  const [showLower, setShowLower] = useState(false);
  const [showBanker, setShowBanker] = useState(false);
  /** One-shot message when the table bank is stopped and a new banker is seated. */
  const [bankStopBannerText, setBankStopBannerText] = useState<string | null>(null);
  const shownBankStopMessagesRef = useRef<Set<string>>(new Set());
  const prevBankerIdForStopMsgRef = useRef<string | null>(null);
  const prevBankScForStopMsgRef = useRef<number>(0);
  const [showCeloTakeover, setShowCeloTakeover] = useState(false);
  const [celoTakeoverError, setCeloTakeoverError] = useState<string | null>(null);
  const [celoTakeoverExpiresAt, setCeloTakeoverExpiresAt] = useState<string | null>(null);
  const [celoTakeoverRoundId, setCeloTakeoverRoundId] = useState<string | null>(null);
  const [celoTakeoverSec, setCeloTakeoverSec] = useState<number | null>(null);
  const celoTimeoutPassSentRef = useRef(false);
  const resultBannerDataRef = useRef<{ roundId: string } | null>(null);
  /** Survives brief realtime lag when `round.banker_dice` arrives after `player_rolling`. */
  const lastBankerTripletRef = useRef<number[] | null>(null);
  /** Last authoritative dice triplet for this room session (continuity between rounds). */
  const lastRealTripletRef = useRef<[number, number, number] | null>(null);
  const [lastRealTriplet, setLastRealTriplet] = useState<
    [number, number, number] | null
  >(null);
  const [abandonmentNotice, setAbandonmentNotice] = useState<string | null>(
    null
  );
  const noCountRevealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const shownRollResultIdsRef = useRef<Set<string>>(new Set());
  const shownSettlementResultIdsRef = useRef<Set<string>>(new Set());
  const pendingRollRevealIdRef = useRef<string | null>(null);
  const rollResultRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const pendingSettlementIdRef = useRef<string | null>(null);
  const settlementBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const bannerDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const confettiFiredForRoundRef = useRef<string | null>(null);
  const [resultBannerData, setResultBannerData] = useState<{
    roundId: string;
  } | null>(null);
  const [resultBannerModel, setResultBannerModel] =
    useState<CeloResultBannerModel | null>(null);
  resultBannerDataRef.current = resultBannerData;
  const [lowerAmt, setLowerAmt] = useState(0);
  const [entryAmount, setEntryAmount] = useState(1000);
  const [panelOpen, setPanelOpen] = useState(true);
  const [chat, setChat] = useState("");
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [myProfile, setMyProfile] = useState<UserDisplayProfile | null>(null);
  const [roomFetchError, setRoomFetchError] = useState<string | null>(null);
  const [startRoundError, setStartRoundError] = useState<string | null>(null);
  const [uiReady, setUiReady] = useState(false);
  /** At least one full `fetchAll` has applied; avoids stale copy before players load. */
  const [playersSnapshotReady, setPlayersSnapshotReady] = useState(false);
  const [diceSize, setDiceSize] = useState(60);
  const [joinHint, setJoinHint] = useState<string | null>(null);
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const joinInFlightRef = useRef(false);
  const postEntryInFlightRef = useRef(false);
  const [rollError, setRollError] = useState<string | null>(null);
  const [latestRollDebug, setLatestRollDebug] = useState<unknown>(null);
  /** Newest-first rows for `round.id` from `/api/celo/room/state` or Supabase (server-authoritative dice). */
  const [roundPlayerRolls, setRoundPlayerRolls] = useState<Record<string, unknown>[]>(
    []
  );
  /** Brief UX hold after a no_count reroll so players read the message before tumbling again. */
  const [noCountReveal, setNoCountReveal] = useState<{
    dice: number[];
    rollName: string;
  } | null>(null);
  /** Current seat has a final win/loss row this round (server); drives player-phase tumble for all clients. */
  const [currentPlayerResolvedRoll, setCurrentPlayerResolvedRoll] = useState(false);
  const [lowerBankError, setLowerBankError] = useState<string | null>(null);
  const [bankerAcceptError, setBankerAcceptError] = useState<string | null>(null);
  const [newBankerSetupBusy, setNewBankerSetupBusy] = useState(false);
  const [newBankerSetupError, setNewBankerSetupError] = useState<string | null>(null);
  const [newBankerSetupName, setNewBankerSetupName] = useState("");
  const [newBankerSetupMinEntry, setNewBankerSetupMinEntry] = useState(500);
  const [newBankerSetupFunding, setNewBankerSetupFunding] = useState(500);
  const [newBankerSetupMaxPlayers, setNewBankerSetupMaxPlayers] = useState(10);
  const [lastFetchInfo, setLastFetchInfo] = useState<{
    url: string;
    status: string;
    body: string;
    error: string;
  }>({ url: "", status: "", body: "", error: "" });
  const [rollFetchInfo, setRollFetchInfo] = useState<{
    url: string;
    status: string;
    body: string;
    error: string;
  }>({ url: "", status: "", body: "", error: "" });
  const rollingRef = useRef(false);
  const rollingActionRef = useRef(false);
  const fetchTokenRef = useRef(0);
  /** Latest realtime mutation time; fetch results older than this must not apply. */
  const lastRealtimeUpdateRef = useRef(0);
  /** Start time of the in-flight fetchAll (for stale guards across awaits). */
  const fetchStartedAtRef = useRef(0);
  const roomRef = useRef<Room | null>(null);
  const playersRef = useRef<Player[]>([]);
  const roundRef = useRef<Round | null>(null);
  const chatDraftRef = useRef("");
  const rollWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollFetchAbortRef = useRef<AbortController | null>(null);
  const diceRef = useRef<number[] | null>(null);
  const feltTiedToRoundIdRef = useRef<string | null>(null);
  /** Avoid clearing dice on first hydration; only reset when switching to a different round id. */
  const prevRoundIdForDiceRef = useRef<string | null>(null);
  /** Last roll response takeover lineage for debug logs (server sends ids on bank stop). */
  const lastBankTakeoverMetaRef = useRef<{
    oldBankerId: string | null;
    newBankerId: string | null;
  } | null>(null);
  const ROLL_ANIM_MIN_MS = 1800;
  /** Roll API: 30s product clock + bank animation / network slack. */
  const ROLL_HARD_TIMEOUT_MS = CELO_PLAYER_ROLL_TIMEOUT_MS + 25_000;

  useEffect(() => {
    return () => {
      if (rollWatchdogRef.current) {
        clearTimeout(rollWatchdogRef.current);
        rollWatchdogRef.current = null;
      }
      rollFetchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);
  useEffect(() => {
    roundRef.current = round;
  }, [round]);

  useEffect(() => {
    chatDraftRef.current = chat;
  }, [chat]);

  useEffect(() => {
    rollingRef.current = rolling;
  }, [rolling]);
  useEffect(() => {
    rollingActionRef.current = rollingAction;
  }, [rollingAction]);

  useEffect(() => {
    diceRef.current = dice;
  }, [dice]);

  const scheduleRollResultReveal = useCallback(
    (resultId: string, callback: () => void, log?: { settlementId?: string | null }) => {
      if (shownRollResultIdsRef.current.has(resultId)) return;
      if (pendingRollRevealIdRef.current === resultId) return;
      pendingRollRevealIdRef.current = resultId;
      if (rollResultRevealTimerRef.current) {
        clearTimeout(rollResultRevealTimerRef.current);
      }
      rollResultRevealTimerRef.current = setTimeout(() => {
        rollResultRevealTimerRef.current = null;
        pendingRollRevealIdRef.current = null;
        if (shownRollResultIdsRef.current.has(resultId)) return;
        shownRollResultIdsRef.current.add(resultId);
        const curRound = roundRef.current;
        const diceTrip = realDiceTripletFromUnknown(diceRef.current);
        console.log("[C-Lo result timing]", {
          roomId,
          roundId: curRound?.id,
          roundStatus: curRound?.status,
          resultId,
          settlementId: log?.settlementId ?? null,
          diceSettled: !!diceTrip,
          delayMs: CELO_ROLL_RESULT_REVEAL_DELAY_MS,
          shownRollResults: Array.from(shownRollResultIdsRef.current),
          shownSettlements: Array.from(shownSettlementResultIdsRef.current),
        });
        callback();
      }, CELO_ROLL_RESULT_REVEAL_DELAY_MS);
    },
    [roomId]
  );

  const scheduleSettlementBannerReveal = useCallback(
    (settlementId: string, roundId: string, onShow: () => void) => {
      if (shownSettlementResultIdsRef.current.has(settlementId)) return;
      if (pendingSettlementIdRef.current === settlementId) return;
      pendingSettlementIdRef.current = settlementId;
      if (settlementBannerTimerRef.current) {
        clearTimeout(settlementBannerTimerRef.current);
      }
      settlementBannerTimerRef.current = setTimeout(() => {
        settlementBannerTimerRef.current = null;
        pendingSettlementIdRef.current = null;
        if (shownSettlementResultIdsRef.current.has(settlementId)) return;
        const still = roundRef.current;
        if (
          !still ||
          still.id !== roundId ||
          String(still.status ?? "").toLowerCase() !== "completed"
        ) {
          return;
        }
        const diceTrip = realDiceTripletFromUnknown(diceRef.current);
        console.log("[C-Lo result timing]", {
          roomId,
          roundId: still.id,
          roundStatus: still.status,
          resultId: null,
          settlementId,
          diceSettled: !!diceTrip,
          delayMs: CELO_SETTLEMENT_REVEAL_DELAY_MS,
          shownRollResults: Array.from(shownRollResultIdsRef.current),
          shownSettlements: Array.from(shownSettlementResultIdsRef.current),
        });
        shownSettlementResultIdsRef.current.add(settlementId);
        onShow();
      }, CELO_SETTLEMENT_REVEAL_DELAY_MS);
    },
    [roomId]
  );

  const rememberRealFeltDice = useCallback((t: [number, number, number]) => {
    lastRealTripletRef.current = t;
    setLastRealTriplet(t);
    setDice([t[0], t[1], t[2]]);
  }, []);

  const bumpOptimisticAsRealtime = useCallback(() => {
    lastRealtimeUpdateRef.current = Date.now();
    if (CELO_DEBUG) {
      console.log("[C-Lo] optimistic update treated as realtime");
    }
  }, []);

  /** Single funnel: merge with React's latest `room` via functional setState, then players/round from same merge. */
  const commitCeloAggregateMerge = useCallback(
    (
      incoming: Partial<{
        updated_at?: string | null;
        room: Record<string, unknown> | null | undefined;
        players: Player[];
        currentRound: Record<string, unknown> | null | undefined;
      }>,
      source: CeloMergeSource,
      opts?: CeloMergeOptions,
      /** When set (e.g. RT player handler), use this list as merge "prev" instead of playersRef. */
      playersForMerge?: Player[]
    ) => {
      let merged:
        | ReturnType<
            typeof applyCeloStateUpdate<
              Record<string, unknown>,
              Player,
              Record<string, unknown>
            >
          >
        | undefined;
      const playersBase = playersForMerge ?? playersRef.current;
      flushSync(() => {
        setRoom((prevRoom) => {
          merged = applyCeloStateUpdate(
            {
              room: (prevRoom as unknown as Record<string, unknown> | null) ?? null,
              players: playersBase,
              currentRound: roundRef.current as unknown as Record<
                string,
                unknown
              > | null,
            },
            incoming,
            source,
            opts
          );
          return (merged!.room ?? null) as Room | null;
        });
      });
      if (!merged) return;
      setPlayers(merged.players as Player[]);
      setRound(merged.currentRound as Round | null);
    },
    []
  );

  const fetchAll = useCallback(async () => {
    if (!supabase || !roomId) return;
    const myToken = ++fetchTokenRef.current;
    const fetchStartedAt = Date.now();
    fetchStartedAtRef.current = fetchStartedAt;
    setRoomFetchError(null);

    const isStaleFetch = (): boolean => {
      if (myToken !== fetchTokenRef.current) return true;
      if (fetchStartedAt < lastRealtimeUpdateRef.current) return true;
      return false;
    };

    const [stateRes, chatRes] = await Promise.all([
      fetchCeloApi(
        supabase,
        `/api/celo/room/state?room_id=${encodeURIComponent(roomId)}`,
        { method: "GET" }
      ),
      supabase
        .from("celo_chat")
        .select(CELO_CHAT_SELECT_WITH_USER)
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(50),
    ]);

    if (isStaleFetch()) {
      console.log("[C-Lo] skipping stale fetch");
      return;
    }

    let incomingRoom: Record<string, unknown> | null | undefined = undefined;
    let playerRows: Player[] = [];
    let activeRound: Round | null = null;
    let roomForLog: Room | null = null;
    type RoomStateApiBody = {
      room?: Record<string, unknown>;
      players?: unknown[];
      activeRound?: Record<string, unknown> | null;
      pauseVotes?: {
        requestCount?: number;
        approveCount?: number;
        requested?: boolean;
      };
      playerRolls?: unknown[];
    };
    let roomStateJson: RoomStateApiBody | null = null;

    if (!stateRes.ok) {
      const errText = await stateRes.text();
      if (stateRes.status === 401) {
        setRoomFetchError("Session expired. Please log in again.");
      } else {
        setRoomFetchError(errText.slice(0, 200) || "Could not load room state");
      }
      const [roomRes, playersRes, roundsRes] = await Promise.all([
        supabase.from("celo_rooms").select("*").eq("id", roomId).maybeSingle(),
        supabase
          .from("celo_room_players")
          .select(CELO_PLAYER_FETCH_SELECT)
          .eq("room_id", roomId)
          .order("seat_number", { ascending: true }),
        supabase
          .from("celo_rounds")
          .select("*")
          .eq("room_id", roomId)
          .in("status", ["banker_rolling", "player_rolling", "betting"])
          .order("round_number", { ascending: false })
          .limit(1),
      ]);
      if (isStaleFetch()) return;
      if (roomRes.data) {
        incomingRoom = roomRes.data as unknown as Record<string, unknown>;
        roomForLog = roomRes.data as Room;
      } else if (roomRes.error) incomingRoom = null;
      playerRows = ((playersRes.data ?? []) as unknown[]).map(
        (row) => normalizeCeloPlayerRow(row) as Player
      );
      const ar = (roundsRes.data as Round[] | null) ?? [];
      activeRound = ar[0] ?? null;
      setPauseRequested(false);
      setPauseVoteCount(0);
      const rs = String((incomingRoom as { status?: string })?.status ?? "");
      if (
        !activeRound &&
        (rs === "rolling" || rs === "active") &&
        roomRes.data &&
        roundsRes.error == null
      ) {
        const { data: lastDone } = await supabase
          .from("celo_rounds")
          .select("*")
          .eq("room_id", roomId)
          .eq("status", "completed")
          .order("round_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (isStaleFetch()) return;
        if (lastDone) activeRound = lastDone as unknown as Round;
      }
    } else {
      roomStateJson = (await stateRes.json()) as RoomStateApiBody;
      if (roomStateJson.room) {
        incomingRoom = roomStateJson.room;
        roomForLog = roomStateJson.room as unknown as Room;
      }
      playerRows = ((roomStateJson.players ?? []) as unknown[]).map(
        (row) => normalizeCeloPlayerRow(row) as Player
      );
      activeRound =
        roomStateJson.activeRound == null
          ? null
          : (roomStateJson.activeRound as unknown as Round);
      const requestVotes = Math.max(
        0,
        Math.floor(Number(roomStateJson.pauseVotes?.requestCount ?? 0))
      );
      const approveVotes = Math.max(
        0,
        Math.floor(Number(roomStateJson.pauseVotes?.approveCount ?? 0))
      );
      setPauseRequested(
        roomStateJson.pauseVotes?.requested === true ||
          requestVotes > 0 ||
          approveVotes > 0
      );
      setPauseVoteCount(approveVotes);
    }

    if (isStaleFetch()) {
      console.log("[C-Lo] skipping stale fetch");
      return;
    }

    if (lastRealtimeUpdateRef.current > fetchStartedAtRef.current) {
      console.log("[C-Lo] skipping stale fetch (realtime newer than fetch start)");
      return;
    }

    const roomStatusStr =
      incomingRoom != null
        ? String((incomingRoom as { status?: string }).status ?? "")
        : "";
    if (
      (roomStatusStr === "rolling" || roomStatusStr === "active") &&
      !activeRound
    ) {
      const { data: r2 } = await supabase
        .from("celo_rounds")
        .select("*")
        .eq("room_id", roomId)
        .neq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (isStaleFetch()) return;
      const st = String((r2 as { status?: string } | null)?.status ?? "");
      if (
        r2 &&
        (st === "banker_rolling" || st === "player_rolling" || st === "betting")
      ) {
        activeRound = r2 as unknown as Round;
      }
    }

    if (
      (roomStatusStr === "rolling" || roomStatusStr === "active") &&
      !activeRound &&
      supabase
    ) {
      const { data: lastCompleted } = await supabase
        .from("celo_rounds")
        .select("*")
        .eq("room_id", roomId)
        .eq("status", "completed")
        .order("round_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (isStaleFetch()) return;
      if (lastCompleted) activeRound = lastCompleted as unknown as Round;
    }

    if (isStaleFetch()) return;

    if (lastRealtimeUpdateRef.current > fetchStartedAtRef.current) {
      console.log("[C-Lo] skipping stale fetch (realtime after repair)");
      return;
    }

    const bankerForCount =
      roomForLog?.banker_id ??
      (incomingRoom as { banker_id?: string } | null | undefined)?.banker_id ??
      null;
    const stakedN = countStakedEntryPlayers(playerRows, bankerForCount);
    const roomStatForStart = String(
      (incomingRoom as { status?: string } | null | undefined)?.status ?? ""
    );
    const canStartComputed =
      incomingRoom != null &&
      me != null &&
      normalizeCeloUserId(
        (incomingRoom as { banker_id?: string }).banker_id
      ) === normalizeCeloUserId(me) &&
      activeRound == null &&
      ["waiting", "active", "entry_phase"].includes(roomStatForStart) &&
      stakedN >= 1;

    console.log("[C-Lo] room status", roomStatusStr);
    console.log("[C-Lo] players count", playerRows.length);
    console.log("[C-Lo] banker id", bankerForCount);
    console.log("[C-Lo] current user id", me);
    console.log("[C-Lo] current round", activeRound?.id ?? null, activeRound?.status ?? null);
    console.log("[C-Lo] canStartRound", canStartComputed);

    let hasCurrentPlayerFinal = false;
    if (
      activeRound?.status === "player_rolling" &&
      activeRound.current_player_seat != null &&
      playerRows.length
    ) {
      const seat = activeRound.current_player_seat;
      const uid = playerRows.find(
        (p) =>
          p.role === "player" && Number(p.seat_number) === Number(seat)
      )?.user_id;
      if (uid && activeRound.id) {
        const { data: prRow } = await supabase
          .from("celo_player_rolls")
          .select("id")
          .eq("round_id", activeRound.id)
          .eq("user_id", uid)
          .in("outcome", ["win", "loss", "push"])
          .limit(1)
          .maybeSingle();
        if (isStaleFetch()) {
          console.log("[C-Lo] skipping stale fetch");
          return;
        }
        hasCurrentPlayerFinal = !!prRow;
      }
    }
    if (isStaleFetch()) {
      console.log("[C-Lo] skipping stale fetch");
      return;
    }

    if (lastRealtimeUpdateRef.current > fetchStartedAtRef.current) {
      console.log("[C-Lo] skipping stale fetch (realtime after async work)");
      return;
    }

    let playerRollsSnapshot: Record<string, unknown>[] = Array.isArray(
      roomStateJson?.playerRolls
    )
      ? ((roomStateJson?.playerRolls ?? []) as Record<string, unknown>[])
      : [];
    if (!stateRes.ok && activeRound?.id) {
      const { data: prData } = await supabase
        .from("celo_player_rolls")
        .select("id, round_id, room_id, user_id, dice, outcome, created_at")
        .eq("round_id", activeRound.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (isStaleFetch()) {
        console.log("[C-Lo] skipping stale fetch");
        return;
      }
      playerRollsSnapshot = (prData ?? []) as Record<string, unknown>[];
    }
    setRoundPlayerRolls(playerRollsSnapshot);

    commitCeloAggregateMerge(
      {
        room: incomingRoom !== undefined ? incomingRoom : undefined,
        players: playerRows,
        currentRound:
          activeRound === null
            ? null
            : (activeRound as unknown as Record<string, unknown>),
      },
      "fetch",
      { playersSnapshot: true }
    );

    if (isStaleFetch()) {
      console.log("[C-Lo] skipping stale fetch");
      return;
    }

    setCurrentPlayerResolvedRoll(hasCurrentPlayerFinal);

    setMessages(
      ((chatRes.data as unknown[]) ?? []).map((row) => normalizeChatRow(row))
    );
    if (chatRes.error && CELO_DEBUG) console.warn("[C-Lo room] chat", chatRes.error);

    if (isStaleFetch()) {
      console.log("[C-Lo] skipping stale fetch");
      return;
    }

    if (activeRound?.id && !rollingRef.current) {
      if (isStaleFetch()) {
        console.log("[C-Lo] skipping stale fetch");
        return;
      }
      const rRow = activeRound as Round;
      const rollerUidForFetch =
        rRow.roller_user_id?.trim() != null && String(rRow.roller_user_id).trim() !== ""
          ? String(rRow.roller_user_id)
          : rRow.current_player_seat != null
            ? playerRows.find(
                (p) =>
                  p.role === "player" &&
                  Number(p.seat_number) === Number(rRow.current_player_seat)
              )?.user_id ?? null
            : null;
      const serverDiceMeta = getVisibleDiceFromServer(
        activeRound as unknown as Record<string, unknown>,
        playerRollsSnapshot,
        { rollerUserId: rollerUidForFetch }
      );
      const t = serverDiceMeta.triplet;
      const applyTriplet = t;
      const serverHasBankerTriplet = !!realDiceTripletFromUnknown(
        (activeRound as Round).banker_dice
      );
      if (applyTriplet) {
        rememberRealFeltDice(applyTriplet);
        feltTiedToRoundIdRef.current = null;
      } else {
        const clobber = shouldClobberFeltTripletOnFetch({
          rollingActionInProgress: rollingActionRef.current,
          activeStatus: activeRound.status,
          serverHasBankerTriplet,
          hasPlayerFinalWinLoss: hasCurrentPlayerFinal,
          hasLocalFeltTriplet: realDiceTripletFromUnknown(diceRef.current) != null,
          localFeltTiedToThisRound: feltTiedToRoundIdRef.current === activeRound.id,
        });
        if (clobber) {
          const keep = lastRealTripletRef.current;
          if (keep) {
            setDice([keep[0], keep[1], keep[2]]);
          } else {
            setDice(null);
          }
          feltTiedToRoundIdRef.current = null;
        } else if (CELO_DEBUG) {
          console.log(
            "[C-Lo] fetch: preserved felt (see shouldClobberFeltTripletOnFetch comment)",
            {
              status: activeRound.status,
              serverHasBankerTriplet,
              tiedRound: feltTiedToRoundIdRef.current,
              roundId: activeRound.id,
            }
          );
        }
      }
    } else if (
      !activeRound &&
      !rollingActionRef.current &&
      !resultBannerDataRef.current
    ) {
      if (isStaleFetch()) {
        console.log("[C-Lo] skipping stale fetch");
        return;
      }
      const keep = lastRealTripletRef.current;
      if (keep) {
        setDice([keep[0], keep[1], keep[2]]);
      } else {
        const { data: lastDone } = await supabase
          .from("celo_rounds")
          .select("id, banker_dice")
          .eq("room_id", roomId)
          .eq("status", "completed")
          .order("round_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (isStaleFetch()) {
          console.log("[C-Lo] skipping stale fetch");
          return;
        }
        let hydrated: [number, number, number] | null = null;
        if (lastDone && (lastDone as { id?: string }).id) {
          const rid = String((lastDone as { id: string }).id);
          const { data: lastPr } = await supabase
            .from("celo_player_rolls")
            .select("dice")
            .eq("round_id", rid)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (isStaleFetch()) {
            console.log("[C-Lo] skipping stale fetch");
            return;
          }
          const t = resolveCeloFeltDice(
            lastPr?.dice,
            (lastDone as { banker_dice?: unknown }).banker_dice
          );
          if (t) hydrated = t;
        }
        if (hydrated) {
          rememberRealFeltDice(hydrated);
        } else {
          setDice(null);
        }
      }
      feltTiedToRoundIdRef.current = null;
    }

    if (isStaleFetch()) {
      console.log("[C-Lo] skipping stale fetch");
      return;
    }

    setPlayersSnapshotReady(true);

    if (CELO_DEBUG && !isStaleFetch()) {
      console.log("[C-Lo room] sync", {
        roomId,
        room: roomForLog ?? incomingRoom,
        activeRound: activeRound?.id,
        players: playerRows.length,
        staked: countStakedEntryPlayers(playerRows, bankerForCount),
        diceComponent: "mounted",
        chatMounted: true,
        fetchToken: myToken,
      });
    }
  }, [supabase, roomId, commitCeloAggregateMerge, me, rememberRealFeltDice]);

  /** Server applies the same banker-win + platform-fee settlement as a normal loss. */
  useEffect(() => {
    if (!supabase || !room?.id || !round?.id) return;
    if (round.status !== "player_rolling" || !round.player_roll_deadline_at) return;
    const deadlineMs = new Date(String(round.player_roll_deadline_at)).getTime();
    if (!Number.isFinite(deadlineMs)) return;
    const delay = Math.max(0, deadlineMs - Date.now()) + 300;
    if (delay > 600_000) return;
    const tid = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetchCeloApi(supabase, "/api/celo/round/roll", {
            method: "POST",
            body: JSON.stringify({
              room_id: room.id,
              round_id: round.id,
              action: "timeout_forfeit",
            }),
          });
          if (res.ok) {
            await fetchAll();
            return;
          }
          const txt = await res.text();
          let err = "";
          try {
            err = String((JSON.parse(txt) as { error?: string }).error ?? "");
          } catch {
            err = txt.slice(0, 80);
          }
          const el = err.toLowerCase();
          if (
            CELO_DEBUG &&
            !el.includes("not expired") &&
            !el.includes("in progress") &&
            !el.includes("not available")
          ) {
            console.warn("[C-Lo] player roll timeout POST", res.status, err);
          }
        } catch (e) {
          if (CELO_DEBUG) console.warn("[C-Lo] player roll timeout fetch", e);
        }
      })();
    }, delay);
    return () => window.clearTimeout(tid);
  }, [
    supabase,
    room?.id,
    round?.id,
    round?.status,
    round?.player_roll_deadline_at,
    fetchAll,
    room,
  ]);

  useEffect(() => {
    if (!showCeloTakeover || !celoTakeoverExpiresAt) {
      setCeloTakeoverSec(null);
      return;
    }
    const expMs = new Date(celoTakeoverExpiresAt).getTime();
    const tick = () => {
      setCeloTakeoverSec(
        Math.max(0, Math.floor((expMs - Date.now()) / 1000))
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [showCeloTakeover, celoTakeoverExpiresAt]);

  useEffect(() => {
    if (!showCeloTakeover || !celoTakeoverRoundId || !room || !supabase) return;
    if (celoTakeoverSec !== 0) return;
    if (celoTimeoutPassSentRef.current) return;
    celoTimeoutPassSentRef.current = true;
    void (async () => {
      await fetchCeloApi(supabase, "/api/celo/banker-takeover", {
        method: "POST",
        body: JSON.stringify({
          room_id: room.id,
          round_id: celoTakeoverRoundId,
          accept: false,
        }),
      });
      setShowCeloTakeover(false);
      setCeloTakeoverExpiresAt(null);
      setCeloTakeoverRoundId(null);
      void fetchAll();
    })();
  }, [
    celoTakeoverSec,
    showCeloTakeover,
    celoTakeoverRoundId,
    room,
    supabase,
    fetchAll,
  ]);

  const sendRoomChat = useCallback(async () => {
    const text = chatDraftRef.current.trim();
    if (!supabase || !me || !room || !text) return;
    const message = text.slice(0, 500);
    const { data, error } = await supabase
      .from("celo_chat")
      .insert({ room_id: room.id, user_id: me, message })
      .select(CELO_CHAT_SELECT_WITH_USER)
      .single();
    if (error) {
      if (CELO_DEBUG) console.warn("[C-Lo room] chat send", error);
      return;
    }
    setChat("");
    const row = normalizeChatRow(data);
    const enriched: ChatRow = {
      ...row,
      display_name: row.display_name ?? myProfile?.display_name ?? null,
      full_name: row.full_name ?? myProfile?.full_name ?? null,
      username: row.username ?? myProfile?.username ?? null,
      email: row.email ?? myProfile?.email ?? null,
      avatar_url: row.avatar_url ?? myProfile?.avatar_url ?? null,
    };
    setMessages((prev) => {
      if (prev.some((m) => m.id === enriched.id)) return prev;
      return [...prev, enriched];
    });
    lastRealtimeUpdateRef.current = Date.now();
  }, [supabase, me, room, myProfile]);

  const refreshRoomPlayers = useCallback(async (force = false) => {
    if (!supabase || !roomId) return;
    const fetchStartedAt = Date.now();
    const { data, error } = await supabase
      .from("celo_room_players")
      .select(CELO_PLAYER_FETCH_SELECT)
      .eq("room_id", roomId)
      .order("seat_number", { ascending: true });
    if (error || !data) return;
    if (!force && lastRealtimeUpdateRef.current > fetchStartedAt + 500) {
      if (CELO_DEBUG) {
        console.log("[C-Lo] skipping refreshRoomPlayers (realtime while fetching players)");
      }
      return;
    }
    const rows = ((data as unknown[]) ?? []).map((row) => normalizeCeloPlayerRow(row) as Player);
    commitCeloAggregateMerge(
      {
        players: rows as unknown as Player[],
        updated_at: new Date().toISOString(),
      },
      "fetch",
      { playersSnapshot: true }
    );
    setPlayersSnapshotReady(true);
  }, [supabase, roomId, commitCeloAggregateMerge]);

  useEffect(() => {
    void (async () => {
      const s = await getSessionAsync();
      if (!s) {
        router.replace("/login?next=" + encodeURIComponent(`/dashboard/games/celo/${roomId}`));
        return;
      }
      setMe(s.userId);
      if (supabase) {
        const { data: u } = await supabase
          .from("users")
          .select("gpay_coins")
          .eq("id", s.userId)
          .maybeSingle();
        setMyBalance(
          Math.max(0, Math.floor((u as { gpay_coins?: number } | null)?.gpay_coins ?? 0))
        );
      }
      await fetchAll();
      setUiReady(true);
    })();
  }, [router, roomId, supabase, fetchAll]);

  useEffect(() => {
    if (!supabase) return;
    const nextPath =
      "/login?next=" + encodeURIComponent(`/dashboard/games/celo/${roomId}`);
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        router.replace(nextPath);
        return;
      }
      if (event === "TOKEN_REFRESHED" && !session) {
        router.replace(nextPath);
      }
    });
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase, router, roomId]);

  useEffect(() => {
    if (!supabase || !me) {
      setMyProfile(null);
      return;
    }
    void supabase
      .from("users")
      .select(CELO_USER_PROFILE_FIELDS)
      .eq("id", me)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setMyProfile(data as UserDisplayProfile);
      });
  }, [supabase, me]);

  useEffect(() => {
    if (!CELO_DEBUG) return;
    console.log("[C-Lo room] state", {
      roomId,
      roomStatus: room?.status,
      round: round?.id,
      roundStatus: round?.status,
      playerRows: players.length,
      hasDice: !!dice,
    });
  }, [roomId, room?.status, round?.id, round?.status, players.length, dice]);

  useEffect(() => {
    if (!CELO_DEBUG) return;
    console.log("[RT] players", players.length);
  }, [players.length]);

  useEffect(() => {
    if (!supabase || !roomId) return;
    const ch = supabase
      .channel(`celo_room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          lastRealtimeUpdateRef.current = Date.now();
          const rowNew = (payload as { new?: Record<string, unknown> }).new;
          if (CELO_DEBUG) {
            console.log("[RT] room update", rowNew);
          }
          if (rowNew && String(rowNew.id ?? "") === roomId) {
            const prevSt = String(roomRef.current?.status ?? "").toLowerCase();
            const nextSt = String(rowNew.status ?? "").toLowerCase();
            const clearStaleResultBanner =
              ((prevSt === "waiting" || prevSt === "entry_phase") &&
                (nextSt === "active" || nextSt === "rolling")) ||
              (prevSt === "active" && nextSt === "rolling");
            if (clearStaleResultBanner) {
              setResultBannerData(null);
            }
            commitCeloAggregateMerge(
              {
                room: rowNew,
                updated_at: new Date().toISOString(),
              },
              "realtime"
            );
          }
          void fetchAll();
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
        (payload) => {
          lastRealtimeUpdateRef.current = Date.now();
          if (CELO_DEBUG) {
            console.log(
              "[RT] celo_room_players",
              (payload as { eventType?: string }).eventType,
              payload
            );
          }
          setPlayersSnapshotReady(true);
          void refreshRoomPlayers(true);
          void fetchAll();
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
        (payload) => {
          lastRealtimeUpdateRef.current = Date.now();
          const p = payload as {
            eventType?: string;
            new?: Record<string, unknown> | null;
            old?: Record<string, unknown> | null;
          };
          const n = p.new as Partial<Round> | null | undefined;
          const rowOld = p.old;
          if (CELO_DEBUG) {
            console.log("[RT] round update", n ?? rowOld);
          }

          if (p.eventType === "DELETE" && rowOld?.id) {
            const oid = String(rowOld.id);
            const prevR = roundRef.current;
            if (prevR?.id === oid) {
              commitCeloAggregateMerge(
                {
                  currentRound: null,
                  updated_at: new Date().toISOString(),
                },
                "realtime"
              );
            }
            void fetchAll();
            return;
          }

          if (n?.id && typeof n.id === "string" && String(n.room_id ?? "") === roomId) {
            const active = new Set(["banker_rolling", "player_rolling", "betting"]);
            const prevR = roundRef.current;
            let incomingRound: Round | undefined;
            if (!prevR || prevR.id === n.id) {
              incomingRound = { ...(prevR ?? {}), ...n } as Round;
            } else if (
              p.eventType === "INSERT" &&
              active.has(String(n.status ?? ""))
            ) {
              incomingRound = { ...n } as Round;
            }

            if (incomingRound !== undefined) {
              commitCeloAggregateMerge(
                {
                  currentRound: incomingRound as unknown as Record<string, unknown>,
                  updated_at: new Date().toISOString(),
                },
                "realtime"
              );
            }

            if (n.status === "player_rolling") {
              setCurrentPlayerResolvedRoll(false);
            }
            if (n.status === "banker_rolling") {
              if (n.banker_roll_in_flight === true) {
                setDice(null);
                if (CELO_DEBUG) {
                  console.log(
                    "[C-Lo room] realtime: banker_roll_in_flight=true → tumble until resolve"
                  );
                }
              } else if (n.banker_dice == null) {
                if (realDiceTripletFromUnknown(n.idle_preview_dice)) {
                  setDice(null);
                } else {
                  const k = lastRealTripletRef.current;
                  if (k) setDice([k[0], k[1], k[2]]);
                  else setDice(null);
                }
              }
              if (
                n.banker_dice != null &&
                (p.eventType === "UPDATE" || p.eventType === "INSERT") &&
                n.banker_roll_in_flight !== true
              ) {
                const trip = realDiceTripletFromUnknown(n.banker_dice);
                if (trip) rememberRealFeltDice(trip);
                if (rollingRef.current) {
                  setRolling(false);
                }
              }
            }
          }
          void fetchAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_player_rolls", filter: `room_id=eq.${roomId}` },
        (payload) => {
          lastRealtimeUpdateRef.current = Date.now();
          const et = (payload as { eventType: string }).eventType;
          const n = (payload as {
            new: {
              dice?: unknown;
              outcome?: string;
              roll_name?: string;
              user_id?: string;
            } | null;
          }).new;
          if (CELO_DEBUG) {
            console.log("[C-Lo room] realtime celo_player_rolls", et, n ?? (payload as { old?: unknown }).old);
            console.log("[C-Lo room] dice sync: player_rolls event → merge triplet if present");
          }
          const rowNew = (payload as { new?: Record<string, unknown> | null }).new;
          const activeRid = roundRef.current?.id;
          if (
            (et === "INSERT" || et === "UPDATE") &&
            rowNew &&
            activeRid &&
            String(rowNew.round_id ?? "") === activeRid
          ) {
            setRoundPlayerRolls((prev) => {
              const id = String(rowNew.id ?? "");
              const rest = id
                ? prev.filter((r) => String((r as { id?: string }).id) !== id)
                : prev;
              return [rowNew, ...rest];
            });
          }
          if ((et === "INSERT" || et === "UPDATE") && n?.dice) {
            const t = realDiceTripletFromUnknown(n.dice);
            if (t) {
              rememberRealFeltDice(t);
              if (
                n.outcome === "win" ||
                n.outcome === "loss" ||
                n.outcome === "push"
              ) {
                setCurrentPlayerResolvedRoll(true);
              }
              if (rollingRef.current) {
                setRolling(false);
              }
              const rName = String(n.roll_name ?? "").trim();
              const uid = n.user_id != null ? String(n.user_id).trim() : "";
              if (
                rName &&
                uid &&
                (n.outcome === "win" ||
                  n.outcome === "loss" ||
                  n.outcome === "push")
              ) {
                const rid = roundRef.current?.id;
                if (rid) {
                  const resultId = `${rid}:player:${uid}:${t[0]}-${t[1]}-${t[2]}`;
                  const pointRaw = (n as { point?: unknown }).point;
                  const rollPt =
                    typeof pointRaw === "number" && Number.isFinite(pointRaw)
                      ? pointRaw
                      : null;
                  scheduleRollResultReveal(resultId, () => {
                    setRollPoint(rollPt);
                    setRollName(rName);
                  });
                }
              }
            }
          }
          void fetchAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_chat", filter: `room_id=eq.${roomId}` },
        () => {
          lastRealtimeUpdateRef.current = Date.now();
          void fetchAll();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          setConnection("offline");
      });
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [
    supabase,
    roomId,
    fetchAll,
    refreshRoomPlayers,
    commitCeloAggregateMerge,
    rememberRealFeltDice,
    scheduleRollResultReveal,
  ]);

  /** If the roll fetch path misses the JSON body, still clear local rolling when this round row updates. */
  useEffect(() => {
    if (!supabase || !round?.id) return;
    const rid = round.id;
    const ch = supabase
      .channel(`celo_round_active:${rid}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "celo_rounds",
          filter: `id=eq.${rid}`,
        },
        (payload) => {
          const n = (payload as { new?: Record<string, unknown> | null }).new;
          if (!n) return;
          lastRealtimeUpdateRef.current = Date.now();
          if (n.banker_dice != null && n.banker_roll_in_flight !== true) {
            const trip = realDiceTripletFromUnknown(n.banker_dice);
            if (trip) rememberRealFeltDice(trip);
            if (rollingRef.current) {
              if (CELO_DEBUG) {
                console.log(
                  "[C-Lo] round-scoped RT: cleared rolling from celo_rounds update"
                );
              }
              setRolling(false);
            }
            if (rollingActionRef.current) {
              setRollingAction(false);
            }
          }
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, round?.id, rememberRealFeltDice]);

  useEffect(() => {
    if (typeof document === "undefined" || !roomId) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void fetchAll();
    };
    const onFocus = () => {
      void fetchAll();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", onFocus);
    const t = window.setInterval(refresh, 10_000);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(t);
    };
  }, [fetchAll, roomId]);

  useEffect(() => {
    const setFrom = () => {
      setDiceSize(
        typeof window !== "undefined" && window.innerWidth >= 1024
          ? 78
          : window.innerWidth >= 768
            ? 70
            : 58
      );
    };
    setFrom();
    window.addEventListener("resize", setFrom);
    return () => window.removeEventListener("resize", setFrom);
  }, []);

  const myRow = players.find(
    (p) => me != null && normalizeCeloUserId(p.user_id) === normalizeCeloUserId(me)
  );
  /** Sole banker source for UI: `celo_rooms.banker_id` only (never player.role / seat). */
  const roomBankerIdForUi = room?.banker_id?.trim()
    ? String(room.banker_id)
    : null;
  const myRoleLc = String(myRow?.role ?? "").toLowerCase();
  const isBanker =
    me != null &&
    room?.banker_id != null &&
    normalizeCeloUserId(me) === normalizeCeloUserId(room.banker_id);
  const isCurrentBanker =
    me != null &&
    room?.banker_id != null &&
    normalizeCeloUserId(me) === normalizeCeloUserId(room.banker_id);
  const isPlayer = myRoleLc === "player";
  const isSpec = myRoleLc === "spectator";
  const minE = room ? minVal(room) : 1000;
  const maxStakeSc = room ? bankVal(room) : 0;

  const celoEntryPresetAmounts = useMemo(() => {
    if (!room || maxStakeSc <= 0) return [];
    return Array.from(
      new Set(
        [
          minE,
          minE * 2,
          minE * 5,
          Math.min(maxStakeSc, 2500),
          maxStakeSc,
        ].filter((x) => x >= minE && x <= maxStakeSc && x > 0)
      )
    ).sort((a, b) => a - b);
  }, [room, minE, maxStakeSc]);

  const celoMobileQuick1 = useMemo(() => {
    if (minE <= 1000 && maxStakeSc >= 1000) return 1000;
    return celoEntryPresetAmounts[0] ?? minE;
  }, [minE, maxStakeSc, celoEntryPresetAmounts]);

  const celoMobileQuick2 = useMemo(() => {
    if (minE <= 2000 && maxStakeSc >= 2000 && 2000 !== celoMobileQuick1) return 2000;
    const alt = celoEntryPresetAmounts.find((x) => x !== celoMobileQuick1);
    if (alt != null) return alt;
    return maxStakeSc > celoMobileQuick1
      ? maxStakeSc
      : Math.min(celoMobileQuick1 * 2, maxStakeSc);
  }, [celoEntryPresetAmounts, celoMobileQuick1, maxStakeSc, minE]);

  /** Second quick-bet column when it would duplicate the first (mobile 3-col row). */
  const celoMobileQuick2Ui = useMemo(() => {
    if (celoMobileQuick2 !== celoMobileQuick1) return celoMobileQuick2;
    const alt = celoEntryPresetAmounts.find((x) => x !== celoMobileQuick1);
    return alt ?? maxStakeSc;
  }, [celoEntryPresetAmounts, celoMobileQuick1, celoMobileQuick2, maxStakeSc]);

  useEffect(() => {
    if (!room) return;
    const m = minVal(room);
    const cap = bankVal(room);
    setEntryAmount((e) => {
      const x = Math.floor(Number(e));
      if (!Number.isFinite(x)) return m;
      if (x < m) return m;
      if (cap > 0 && x > cap) return cap;
      return x;
    });
  }, [room]);

  useEffect(() => {
    if (!room || !isCurrentBanker) return;
    const min = Math.max(500, minVal(room));
    const maxPlayers = [2, 4, 6, 10].includes(Number(room.max_players))
      ? Number(room.max_players)
      : 10;
    setNewBankerSetupName(String(room.name ?? ""));
    setNewBankerSetupMinEntry(min);
    setNewBankerSetupFunding(min);
    setNewBankerSetupMaxPlayers(maxPlayers);
  }, [room?.id, room?.name, room?.minimum_entry_sc, room?.max_players, isCurrentBanker]);

  const prize = round?.prize_pool_sc ?? 0;
  const inProgress = !!(
    round &&
    ["banker_rolling", "player_rolling", "betting"].includes(round.status)
  );
  const roomStatusLc = String(room?.status ?? "").toLowerCase();
  /** Full bank won / bust: successor banker assigned, bank at 0 — not generic “waiting”. */
  const isBankTakeoverUi =
    !!room &&
    !inProgress &&
    (roomStatusLc === "bank_takeover" ||
      (room.bank_busted === true &&
        bankVal(room) <= 0 &&
        room.banker_id != null &&
        String(room.banker_id).trim() !== ""));
  const roomPausedBlocking = isRoomPauseBlockingActions(room);
  const roomPauseActive = isRoomPauseActive(room);
  const hasActiveRound = !!(
    round &&
    ["banker_rolling", "player_rolling", "betting"].includes(
      String(round.status ?? "").toLowerCase()
    )
  );
  const needsBankSetup = Boolean(
    room &&
      isCurrentBanker &&
      Number(room.current_bank_sc ?? room.current_bank_cents ?? 0) <= 0 &&
      (room.bank_busted === true || roomStatusLc === "bank_takeover") &&
      roomStatusLc !== "cancelled" &&
      roomStatusLc !== "closed"
  );

  useEffect(() => {
    if (!room) return;
    console.log("[C-Lo banker source of truth]", {
      roomId,
      roomBankerId: room?.banker_id,
      currentUserId: me,
      players: players.map((p) => ({
        user_id: p.user_id,
        seat: p.seat_number,
        oldRole: p.role,
        isBadgeBanker:
          room.banker_id != null &&
          normalizeCeloUserId(p.user_id) ===
            normalizeCeloUserId(room.banker_id),
      })),
    });
  }, [roomId, room, me, players]);

  useEffect(() => {
    console.log("[C-Lo pause controls]", {
      userId: me,
      bankerId: room?.banker_id,
      isCurrentBanker,
      pauseRequested,
      pauseVoteCount,
    });
  }, [me, room?.banker_id, isCurrentBanker, pauseRequested, pauseVoteCount]);

  useEffect(() => {
    if (!room || !isBankTakeoverUi) return;
    const meta = lastBankTakeoverMetaRef.current;
    console.log("[C-Lo Bank Takeover]", {
      roomId: room.id,
      oldBankerId: meta?.oldBankerId ?? null,
      newBankerId: room.banker_id,
      winningPlayerId: room.banker_id,
      oldBankAmount: null,
      newBankAmount: bankVal(room),
      roomStatus: room.status,
    });
  }, [room?.id, room?.banker_id, room?.status, isBankTakeoverUi]);

  useEffect(() => {
    // If banker ownership moves away from this user, immediately clear setup interaction state.
    if (needsBankSetup) return;
    if (newBankerSetupBusy) setNewBankerSetupBusy(false);
    if (newBankerSetupError) setNewBankerSetupError(null);
  }, [needsBankSetup, newBankerSetupBusy, newBankerSetupError]);

  useEffect(() => {
    if (!room?.paused_at) return;
    const id = window.setInterval(() => setPauseTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [room?.paused_at]);

  const pauseRemainingSec =
    room?.pause_expires_at != null
      ? Math.max(
          0,
          Math.ceil(
            (new Date(room.pause_expires_at).getTime() - Date.now()) / 1000
          )
        )
      : 0;

  useEffect(() => {
    if (!room?.id) return;
    const st = String(room.status ?? "").toLowerCase();
    if (st !== "cancelled" || !room.abandoned_at) {
      setAbandonmentNotice(null);
      return;
    }
    const bankerUid =
      room.banker_id != null && String(room.banker_id).trim() !== ""
        ? String(room.banker_id)
        : null;
    const iAmBanker =
      me != null &&
      bankerUid != null &&
      normalizeCeloUserId(me) === normalizeCeloUserId(bankerUid);
    if (iAmBanker) {
      setAbandonmentNotice(
        "Room was closed for inactivity. A 500 GPC abandonment fee was charged."
      );
      return;
    }
    if (isPlayer) {
      setAbandonmentNotice(
        "Banker abandoned the room. Your entry was refunded."
      );
      return;
    }
    setAbandonmentNotice(null);
  }, [room?.id, room?.status, room?.abandoned_at, room?.banker_id, me, isPlayer]);
  const bankerDiceReadyKey = useMemo(() => {
    const t = realDiceTripletFromUnknown(round?.banker_dice);
    return t ? `${t[0]}-${t[1]}-${t[2]}` : "";
  }, [round?.banker_dice]);

  /** Result overlay: after CELO_RESULT_REVEAL_DELAY_MS + 4s display from settlement schedule. */
  const bannerOverlayVisible = resultBannerData != null;

  useEffect(() => {
    const st = String(round?.status ?? "").toLowerCase();
    const rid = round?.id;
    if (!rid || st !== "completed") {
      if (settlementBannerTimerRef.current) {
        clearTimeout(settlementBannerTimerRef.current);
        settlementBannerTimerRef.current = null;
      }
      pendingSettlementIdRef.current = null;
      setResultBannerData(null);
      return;
    }
    if (!bankerDiceReadyKey) {
      return;
    }
    const trip = realDiceTripletFromUnknown(round.banker_dice);
    if (!trip) {
      return;
    }
    const settlementId = `${rid}:settlement`;
    scheduleSettlementBannerReveal(settlementId, rid, () => {
      setResultBannerData({ roundId: rid });
      if (bannerDismissTimerRef.current) {
        clearTimeout(bannerDismissTimerRef.current);
      }
      bannerDismissTimerRef.current = setTimeout(() => {
        bannerDismissTimerRef.current = null;
        setResultBannerData(null);
      }, 4000);
    });
  }, [
    round?.id,
    round?.status,
    round?.banker_dice,
    bankerDiceReadyKey,
    scheduleSettlementBannerReveal,
  ]);

  useEffect(() => {
    const rs = String(room?.status ?? "").toLowerCase();
    if (rs === "rolling") {
      if (settlementBannerTimerRef.current) {
        clearTimeout(settlementBannerTimerRef.current);
        settlementBannerTimerRef.current = null;
      }
      pendingSettlementIdRef.current = null;
      if (bannerDismissTimerRef.current) {
        clearTimeout(bannerDismissTimerRef.current);
        bannerDismissTimerRef.current = null;
      }
      setResultBannerData(null);
    }
  }, [room?.status]);

  /** Spectators / late sync: banker roll name after real dice + name on round row. */
  useEffect(() => {
    const r = round;
    if (!r?.id) return;
    const st = String(r.status ?? "").toLowerCase();
    if (st === "completed") return;
    if (r.banker_roll_in_flight === true) return;
    const trip = realDiceTripletFromUnknown(r.banker_dice);
    const name = String(r.banker_dice_name ?? "").trim();
    if (!trip || !name) return;
    const resultId = `${r.id}:banker:${trip[0]}-${trip[1]}-${trip[2]}`;
    const bankerPoint =
      typeof r.banker_point === "number" && Number.isFinite(r.banker_point)
        ? r.banker_point
        : null;
    scheduleRollResultReveal(resultId, () => {
      setRollPoint(bankerPoint);
      setRollName(name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- round snapshot fields listed
  }, [
    round?.id,
    round?.status,
    round?.banker_dice,
    round?.banker_dice_name,
    round?.banker_roll_in_flight,
    scheduleRollResultReveal,
  ]);

  useEffect(() => {
    if (!resultBannerData || !supabase || !round?.id) {
      setResultBannerModel(null);
      return;
    }
    if (round.id !== resultBannerData.roundId) {
      setResultBannerModel(null);
      return;
    }
    const st = String(round.status ?? "").toLowerCase();
    if (st !== "completed") {
      setResultBannerModel(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data: rolls } = await supabase
        .from("celo_player_rolls")
        .select("outcome, roll_name, roll_result, point, user_id, dice, payout_sc")
        .eq("round_id", resultBannerData.roundId)
        .order("created_at", { ascending: false })
        .limit(8);
      if (cancelled) return;
      setResultBannerModel(
        buildCeloResultBannerContent(
          round,
          rolls ?? [],
          players,
          room?.banker_id ?? null
        )
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- round snapshot fields listed
  }, [
    resultBannerData,
    supabase,
    round?.id,
    round?.status,
    round?.banker_dice,
    round?.banker_dice_result,
    round?.banker_point,
    round?.push,
    players,
    room?.banker_id,
  ]);

  useEffect(() => {
    if (!supabase || !round || !me) return;
    if (!round.player_celo_offer || !round.id) return;
    if (bannerOverlayVisible) return;
    const exp = round.player_celo_expires_at
      ? new Date(String(round.player_celo_expires_at))
      : null;
    if (exp && exp < new Date()) return;
    if (showCeloTakeover) return;
    const offerRoundId = String(round.id);
    const offerExpiresAt = round.player_celo_expires_at
      ? String(round.player_celo_expires_at)
      : null;
    let cancel = false;
    void (async () => {
      const { data: myWin } = await supabase
        .from("celo_player_rolls")
        .select("dice")
        .eq("round_id", offerRoundId)
        .eq("user_id", me)
        .eq("outcome", "win")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancel || !myWin) return;
      const t = realDiceTripletFromUnknown(myWin.dice);
      if (!t) return;
      const s = [...t].sort((a, b) => a - b);
      if (s[0] !== 4 || s[1] !== 5 || s[2] !== 6) return;
      setCeloTakeoverError(null);
      setShowCeloTakeover(true);
      setCeloTakeoverRoundId(offerRoundId);
      celoTimeoutPassSentRef.current = false;
      if (offerExpiresAt) {
        setCeloTakeoverExpiresAt(offerExpiresAt);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [supabase, me, showCeloTakeover, round, bannerOverlayVisible]);

  const displayRound = round;
  const effectiveRoundStatus = round?.status ?? displayRound?.status;

  const currentRollerUserIdForDice = useMemo(() => {
    const r = displayRound;
    if (!r) return null;
    if (r.roller_user_id != null && String(r.roller_user_id).trim() !== "") {
      return String(r.roller_user_id);
    }
    const seat = r.current_player_seat;
    if (seat == null) return null;
    const row = players.find(
      (p) =>
        p.role === "player" && Number(p.seat_number) === Number(seat)
    );
    return row?.user_id ? String(row.user_id) : null;
  }, [displayRound, players]);

  const serverDiceFromRound = useMemo(
    () =>
      getVisibleDiceFromServer(
        displayRound as unknown as Record<string, unknown> | null,
        roundPlayerRolls,
        { rollerUserId: currentRollerUserIdForDice }
      ),
    [displayRound, roundPlayerRolls, currentRollerUserIdForDice]
  );

  const authoritativeTriplet = useMemo((): [number, number, number] | null => {
    const local = realDiceTripletFromUnknown(dice);
    if (local) return local;
    return serverDiceFromRound.triplet;
  }, [dice, serverDiceFromRound.triplet]);

  useEffect(() => {
    console.log("[C-Lo Dice Sync]", {
      roomId,
      roundId: round?.id ?? null,
      rollId: serverDiceFromRound.rollId,
      rollerUserId:
        serverDiceFromRound.rollerUserId ?? currentRollerUserIdForDice,
      diceFromServer: serverDiceFromRound.triplet,
      clientUserId: me,
      displayedDice: authoritativeTriplet,
      source: serverDiceFromRound.source,
    });
  }, [
    roomId,
    round?.id,
    me,
    authoritativeTriplet,
    serverDiceFromRound.rollId,
    serverDiceFromRound.rollerUserId,
    serverDiceFromRound.triplet,
    serverDiceFromRound.source,
    currentRollerUserIdForDice,
  ]);

  const inProgressForVisual = inProgress || bannerOverlayVisible;
  const roundHasBankerTriplet = !!realDiceTripletFromUnknown(
    displayRound?.banker_dice
  );
  const feltTripletPresent =
    authoritativeTriplet != null ||
    (dice != null && isRealDiceValues(dice)) ||
    (lastRealTriplet != null && isRealDiceValues(lastRealTriplet));

  const bankerRollInFlight = round?.banker_roll_in_flight === true;

  const visualDiceMode = useMemo(
    () =>
      computeCeloVisualDiceMode({
        inProgress: inProgressForVisual,
        roundStatus: effectiveRoundStatus,
        roundHasBankerTriplet,
        feltTripletPresent,
        currentPlayerHasFinalRoll: currentPlayerResolvedRoll,
        rollingAction,
        localRolling: rolling,
        serverBankerInFlight: round?.banker_roll_in_flight === true,
        serverPlayerInFlight: round?.roll_processing === true,
        resultPauseActive: bannerOverlayVisible,
      }),
    [
      inProgressForVisual,
      effectiveRoundStatus,
      roundHasBankerTriplet,
      feltTripletPresent,
      currentPlayerResolvedRoll,
      rollingAction,
      rolling,
      round?.banker_roll_in_flight,
      round?.roll_processing,
      bannerOverlayVisible,
    ]
  );

  useEffect(() => {
    if (!rollingAction) return;
    const t = setTimeout(() => {
      console.warn("[C-Lo] rollingAction safety timeout");
      setRollingAction(false);
    }, 4000);
    return () => clearTimeout(t);
  }, [rollingAction]);

  /** Tumble animation: waiting on banker write, waiting on current player final, or local roll window. */
  const isRollingFaces =
    visualDiceMode === "banker_tumble" || visualDiceMode === "player_tumble";

  const showIdleDice = !inProgressForVisual && !rolling;

  const facePips: [number, number, number] | null = (() => {
    const auth = authoritativeTriplet;
    if (auth && isRealDiceValues(auth)) {
      return [clampDie(auth[0]), clampDie(auth[1]), clampDie(auth[2])];
    }
    return null;
  })();

  const displayDice = authoritativeTriplet ?? facePips;

  useEffect(() => {
    if (!CELO_DEBUG) return;
    console.log("[C-Lo dice continuity]", {
      roomId,
      roundId: round?.id,
      roundStatus: round?.status,
      feltDice: dice,
      lastRealTriplet: lastRealTripletRef.current,
      displayDice,
      isRolling: rolling,
      isRollingFaces,
    });
  }, [
    roomId,
    round?.id,
    round?.status,
    dice,
    displayDice,
    rolling,
    isRollingFaces,
  ]);

  useEffect(() => {
    console.log("[C-Lo dice rolling visibility]", {
      roomId,
      isRolling: rolling,
      displayDice,
      feltDice: dice,
      lastRealTriplet: lastRealTripletRef.current,
    });
  }, [roomId, rolling, displayDice, dice]);

  useEffect(() => {
    if (!CELO_DEBUG) return;
    const bankerDice =
      realDiceTripletFromUnknown(round?.banker_dice) ??
      lastBankerTripletRef.current;
    const playerDice =
      dice != null &&
      isRealDiceValues(dice) &&
      String(round?.status ?? "").toLowerCase() === "player_rolling"
        ? dice
        : currentPlayerResolvedRoll && dice != null && isRealDiceValues(dice)
          ? dice
          : null;
    console.log("[C-Lo dice]", {
      bankerDice,
      playerDice,
      roundStatus: round?.status,
    });
  }, [round?.status, round?.banker_dice, dice, currentPlayerResolvedRoll]);

  useEffect(() => {
    console.log("[C-Lo Dice] visual mode", {
      rollingAction,
      roundStatus: round?.status,
      latestRoll: latestRollDebug,
      diceValues: dice,
    });
  }, [rollingAction, round?.status, latestRollDebug, dice]);

  useEffect(() => {
    console.log("[C-Lo] state", {
      isRolling: rolling,
      dice,
      bankerDice: round?.banker_dice,
      roundId: round?.id,
      mode: visualDiceMode,
    });
  }, [rolling, dice, round?.banker_dice, round?.id, visualDiceMode]);
  const stakedPlayerCount = useMemo(
    () => countStakedEntryPlayers(players, roomBankerIdForUi),
    [players, roomBankerIdForUi]
  );

  useEffect(() => {
    console.log(
      "[C-Lo UI] staked players calc",
      players.map((p) => ({
        user_id: p.user_id,
        is_banker: p.is_banker,
        entry_posted: p.entry_posted,
        stake_amount_sc: p.stake_amount_sc,
      })),
      stakedPlayerCount
    );
  }, [players, stakedPlayerCount]);
  const seatedPlayerCount = useMemo(
    () => countSeatedCeloPlayerRoles(players),
    [players]
  );

  const CELO_TUMBLE = useMemo(() => {
    void round?.id;
    void visualDiceMode;
    const durations = [1.65, 1.8, 1.95] as const;
    return [0, 1, 2].map((i) => ({
      variant: (["a", "b", "c"] as const)[i]!,
      durationSec: durations[i]!,
    }));
  }, [round?.id, visualDiceMode]);

  /** Banker in waiting: re-pull seats if realtime lagged. */
  useEffect(() => {
    if (!supabase || !roomId || !room || !isBanker || inProgress) return;
    if (String(room.status) !== "waiting" || seatedPlayerCount >= 1) return;
    const t = window.setInterval(() => {
      void refreshRoomPlayers(true);
    }, 3500);
    return () => window.clearInterval(t);
  }, [supabase, roomId, room, isBanker, inProgress, seatedPlayerCount, refreshRoomPlayers]);

  const spectators = useMemo(
    () => players.filter((p) => p.role === "spectator").length,
    [players]
  );
  const seatedAtTable = useMemo(
    () => players.filter((p) => p.role !== "spectator").length,
    [players]
  );
  const playersAtTable = useMemo(
    () =>
      sortCeloPlayersBySeat(players.filter((p) => p.role !== "spectator")),
    [players]
  );

  const takeoverBankerDisplayName = useMemo(() => {
    if (!room?.banker_id) return "the new banker";
    return celoBannerSeatLabel(players, room.banker_id);
  }, [players, room?.banker_id]);

  const myEntryScRaw = Math.max(
    Math.floor(Number(myRow?.stake_amount_sc ?? 0)),
    Math.floor(Number(myRow?.entry_sc ?? 0))
  );
  const myEntrySc = Number.isFinite(myEntryScRaw) ? myEntryScRaw : 0;

  const tableStatusText = (() => {
    if (!uiReady) return "Loading table…";
    if (!room) return roomFetchError ? "Could not load room" : "Loading…";
    if (isBankTakeoverUi) {
      return "";
    }
    if (needsBankSetup) {
      return "Bank stopped — fund the bank and set rules to continue.";
    }
    if (
      !isCurrentBanker &&
      room.bank_busted === true &&
      Number(room.current_bank_sc ?? room.current_bank_cents ?? 0) <= 0 &&
      roomStatusLc === "waiting"
    ) {
      return "Bank stopped — waiting for new banker to fund.";
    }
    if (room.bank_busted === true && (room.banker_id == null || room.banker_id === "")) {
      return "Waiting for new banker";
    }
    if (
      !isBankTakeoverUi &&
      room.bank_busted !== true &&
      room.banker_id != null &&
      bankVal(room) <= 0 &&
      !inProgress
    ) {
      return "Syncing bank…";
    }
    if (roomStatusLc === "rolling" && !round) {
      return "Syncing round…";
    }
    if (inProgress && round) {
      if (round.status === "banker_rolling") return "Banker's roll";
      if (round.status === "player_rolling") return "Player's roll";
      if (round.status === "betting") return "Betting / payouts";
    }
    if (isBanker && !inProgress && !playersSnapshotReady) {
      return "Syncing table…";
    }
    if (roomStatusLc === "entry_phase" && isBanker) {
      return stakedPlayerCount < 1
        ? "Waiting for player entries…"
        : "Start the round when ready.";
    }
    if (roomStatusLc === "waiting" && isBanker && seatedPlayerCount < 1) {
      return "No players seated yet.";
    }
    if (
      (roomStatusLc === "entry_phase" || roomStatusLc === "active") &&
      !isBanker &&
      isPlayer &&
      myEntrySc === 0
    ) {
      return "Post entry to join the pot.";
    }
    if (roomStatusLc === "entry_phase" && !isBanker && isPlayer && myEntrySc > 0) {
      return "Entry in — waiting for banker to start.";
    }
    if (
      (roomStatusLc === "waiting" || roomStatusLc === "active") &&
      !isBanker &&
      isPlayer &&
      myEntrySc > 0
    ) {
      return "Entry in — waiting for banker to start.";
    }
    if (roomStatusLc === "waiting" && !isBanker) {
      return "Waiting for banker to start…";
    }
    if (isBanker) return "Start round once a player has entered.";
    return "Waiting for banker";
  })();

  /** Show banker’s cultural point + number to all seats during the player roll phase. */
  const showBankerPointCallout = Boolean(
    round &&
      String(round.status).toLowerCase() === "player_rolling" &&
      String(round.banker_dice_result ?? "").toLowerCase() === "point"
  );

  useEffect(() => {
    if (!CELO_DEBUG) return;
    if (!room || inProgress || isBanker || myEntrySc > 0 || isSpec) return;
    console.log("[C-Lo] entry button render", {
      disabled: myBalance > 0 && entryAmount > myBalance,
      selectedAmount: entryAmount,
      isSubmitting: false,
      myBalance,
    });
  }, [room, inProgress, isBanker, myEntrySc, isSpec, entryAmount, myBalance]);

  const canRollBanker =
    isBanker && round?.status === "banker_rolling" && !rollingAction;
  const mySeatNum =
    myRow?.seat_number != null ? Number(myRow.seat_number) : -1;
  const currentSeatNum = Number(round?.current_player_seat ?? -1);
  const isMyTurn =
    (Number.isFinite(mySeatNum) &&
      Number.isFinite(currentSeatNum) &&
      mySeatNum === currentSeatNum &&
      currentSeatNum >= 0) ||
    (round?.roller_user_id != null &&
      me != null &&
      normalizeCeloUserId(String(round.roller_user_id)) === normalizeCeloUserId(me));
  const canRollPlayer = !!(
    room &&
    round &&
    inProgress &&
    round.status === "player_rolling" &&
    isPlayer &&
    isMyTurn &&
    myRow?.entry_posted === true
  );

  const postEntryRoomOk = ["waiting", "active", "entry_phase"].includes(roomStatusLc);
  const entryStakeInt = Math.floor(Number(entryAmount));
  const postEntryStakeRangeOk =
    Number.isFinite(entryAmount) &&
    Number.isInteger(entryAmount) &&
    entryStakeInt >= minE &&
    maxStakeSc > 0 &&
    entryStakeInt <= maxStakeSc;
  const postEntryBalanceOk = !(myBalance > 0 && entryStakeInt > myBalance);
  const postEntryNotYetPosted =
    myRow != null && myRow.entry_posted !== true && myEntrySc <= 0;
  const canPostEntry =
    !!room &&
    !!me &&
    !isBanker &&
    isPlayer &&
    !inProgress &&
    !bannerOverlayVisible &&
    !roomPausedBlocking &&
    postEntryRoomOk &&
    entryAmount > 0 &&
    postEntryStakeRangeOk &&
    postEntryBalanceOk &&
    postEntryNotYetPosted;
  const postEntryUiRoomOk =
    roomStatusLc === "entry_phase" ||
    roomStatusLc === "waiting" ||
    roomStatusLc === "active";

  useEffect(() => {
    console.log("[C-Lo UI] post entry disabled reason", {
      isBanker,
      roomStatus: room?.status,
      roomStatusLc,
      roomBankerIdForUi,
      myRoleLc,
      selectedEntryAmount: entryAmount,
      entryAmountFinite: Number.isFinite(entryAmount),
      alreadyPosted: myRow?.entry_posted,
      stake: myRow?.stake_amount_sc,
      hasRound: Boolean(round),
      inProgress,
      postEntryRoomOk,
      postEntryBalanceOk,
      postEntryNotYetPosted,
      gpcBalance: myBalance,
      canPostEntry,
    });
  }, [
    isBanker,
    room?.status,
    roomStatusLc,
    roomBankerIdForUi,
    myRoleLc,
    entryAmount,
    myRow?.entry_posted,
    myRow?.stake_amount_sc,
    round,
    inProgress,
    postEntryRoomOk,
    postEntryBalanceOk,
    postEntryNotYetPosted,
    myBalance,
    canPostEntry,
  ]);
  const canRoll = canRollBanker || canRollPlayer;
  const roomPhase = roomStatusLc;
  const roomInLiveRound = roomStatusLc === "rolling";
  const rollSideQuiet =
    round?.roll_processing !== true && round?.banker_roll_in_flight !== true;
  const roundSettling = round?.roll_processing === true;
  const pauseControlsHidden =
    roomStatusLc === "rolling" ||
    roomStatusLc === "cancelled" ||
    roomStatusLc === "closed" ||
    roundSettling ||
    roomPauseActive ||
    roomPausedBlocking;
  const canOfferBankerPause =
    isCurrentBanker &&
    roomStatusLc !== "bank_takeover" &&
    ["waiting", "active"].includes(roomStatusLc) &&
    !hasActiveRound &&
    !roomInLiveRound &&
    rollSideQuiet &&
    !bannerOverlayVisible &&
    !pauseControlsHidden;
  const canOfferPlayerPauseVote =
    !isCurrentBanker &&
    isPlayer &&
    roomStatusLc !== "bank_takeover" &&
    ["waiting", "active", "entry_phase"].includes(roomStatusLc) &&
    !hasActiveRound &&
    !roomInLiveRound &&
    rollSideQuiet &&
    !bannerOverlayVisible &&
    !pauseControlsHidden;
  const showStartRoundPanel =
    !!room &&
    isBanker &&
    !needsBankSetup &&
    !hasActiveRound &&
    !roomInLiveRound &&
    roomPhase !== "bank_takeover" &&
    ["waiting", "active", "entry_phase"].includes(roomPhase) &&
    bankVal(room) > 0 &&
    room.bank_busted !== true &&
    !bannerOverlayVisible &&
    !roomPausedBlocking;
  const canStartRound =
    showStartRoundPanel &&
    stakedPlayerCount >= 1 &&
    !startRoundSubmitting;
  const startRoundDisabledReason = (() => {
    if (!showStartRoundPanel) return null;
    if (startRoundSubmitting) return "start_round_submitting";
    if (stakedPlayerCount < 1) return "no_posted_entries";
    if (room?.bank_busted === true) return "bank_busted";
    if (room && bankVal(room) <= 0) return "bank_empty";
    return null;
  })();

  useEffect(() => {
    const hasPostedPlayer = stakedPlayerCount >= 1;
    console.log("[C-Lo start round visibility]", {
      roomId,
      isBanker,
      hasPostedPlayer,
      hasActiveRound,
      roomStatus: room?.status,
      currentRoundStatus: round?.status,
      canShowStartRound: showStartRoundPanel && hasPostedPlayer,
      canStartRound,
    });
  }, [
    roomId,
    isBanker,
    stakedPlayerCount,
    hasActiveRound,
    room?.status,
    round?.status,
    showStartRoundPanel,
    canStartRound,
  ]);

  const feltIdleLabel = (() => {
    if (roomPhase === "rolling" && !round) {
      return "SYNCING ROUND…";
    }
    if (isBankTakeoverUi) {
      return isCurrentBanker
        ? "YOU ARE THE BANKER — FUND THE TABLE"
        : "BANK TAKEN OVER — WAITING FOR NEW BANKER";
    }
    if (
      roomPhase === "waiting" ||
      roomPhase === "entry_phase" ||
      roomPhase === "active" ||
      roomPhase === "bank_takeover"
    ) {
      if (isBanker) {
        return stakedPlayerCount > 0
          ? "START ROUND WHEN READY"
          : "WAITING FOR PLAYERS TO POST ENTRIES";
      }
      if (isPlayer && myEntrySc > 0) {
        return "ENTRY POSTED — WAITING FOR BANKER TO START";
      }
      if (isPlayer) return "POST YOUR ENTRY TO JOIN THIS ROUND";
      return "WAITING FOR TABLE";
    }
    return "AWAITING THE NEXT THROW";
  })();

  useEffect(() => {
    if (!room || !CELO_DEBUG) return;
    console.log("[C-Lo banker bank rule]", {
      roomId: room.id,
      bankerId: room.banker_id,
      userId: me,
      currentBankSc: bankVal(room),
      bankBusted: room.bank_busted ?? false,
      winnerUserId: null,
      action: "client_room_snapshot",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- log when stable room id / bank fields change
  }, [
    room?.id,
    room?.banker_id,
    room?.bank_busted,
    room?.current_bank_sc,
    room?.current_bank_cents,
    me,
  ]);

  useEffect(() => {
    if (!room) return;
    const currentUserId = me ? normalizeCeloUserId(me) : null;
    const roomBankerId = room.banker_id ? normalizeCeloUserId(room.banker_id) : null;
    const oldBankerId = prevBankerIdForStopMsgRef.current;
    const newBankerId = room.banker_id ?? null;
    console.log("[C-Lo takeover setup visibility]", {
      roomId: room.id,
      currentUserId,
      roomBankerId: room.banker_id,
      oldBankerId,
      newBankerId,
      isCurrentBanker,
      bankBusted: room.bank_busted,
      currentBankSc: room.current_bank_sc,
      needsNewBankerSetup: needsBankSetup,
    });
  }, [
    room?.id,
    room?.banker_id,
    room?.bank_busted,
    room?.current_bank_sc,
    me,
    isCurrentBanker,
    needsBankSetup,
  ]);

  useEffect(() => {
    if (!CELO_DEBUG) return;
    console.log("[C-Lo room] start entry / begin (dev)", {
      roomId,
      players: players.length,
      seatedPlayerCount,
      stakedPlayerCount,
      roomStatus: room?.status,
      roundStatus: round?.status,
      playersSnapshotReady,
      canStartRound,
      startRoundDisabledReason,
    });
  }, [
    roomId,
    players.length,
    seatedPlayerCount,
    stakedPlayerCount,
    room?.status,
    round?.status,
    playersSnapshotReady,
    canStartRound,
    startRoundDisabledReason,
  ]);

  useEffect(() => {
    if (joinHint && myRow) setJoinHint(null);
  }, [joinHint, myRow]);

  useEffect(() => {
    setRollError(null);
  }, [round?.id]);

  useEffect(() => {
    const rid = round?.id ?? null;
    const prev = prevRoundIdForDiceRef.current;
    prevRoundIdForDiceRef.current = rid;
    setCurrentPlayerResolvedRoll(false);
    feltTiedToRoundIdRef.current = null;
    if (prev != null && rid != null && prev !== rid) {
      setDice(null);
    }
  }, [round?.id]);

  useEffect(() => {
    if (round?.id) {
      const trip = realDiceTripletFromUnknown(round.banker_dice);
      if (trip) {
        lastBankerTripletRef.current = trip;
      }
    }
  }, [round?.id, round?.banker_dice]);

  useEffect(() => {
    setNoCountReveal(null);
    if (noCountRevealTimeoutRef.current) {
      clearTimeout(noCountRevealTimeoutRef.current);
      noCountRevealTimeoutRef.current = null;
    }
    setResultBannerData(null);
    setResultBannerModel(null);
    setRollName(null);
    setRollPoint(null);
    if (rollResultRevealTimerRef.current) {
      clearTimeout(rollResultRevealTimerRef.current);
      rollResultRevealTimerRef.current = null;
    }
    if (settlementBannerTimerRef.current) {
      clearTimeout(settlementBannerTimerRef.current);
      settlementBannerTimerRef.current = null;
    }
    if (bannerDismissTimerRef.current) {
      clearTimeout(bannerDismissTimerRef.current);
      bannerDismissTimerRef.current = null;
    }
    pendingRollRevealIdRef.current = null;
    pendingSettlementIdRef.current = null;
  }, [round?.id]);

  useEffect(() => {
    // Hard reset room-scoped transient state when moving between rooms.
    setResultBannerData(null);
    setResultBannerModel(null);
    setRollName(null);
    setRollPoint(null);
    setDice(null);
    setMessages([]);
    setCurrentPlayerResolvedRoll(false);
    lastBankerTripletRef.current = null;
    lastRealTripletRef.current = null;
    setLastRealTriplet(null);
    setRoundPlayerRolls([]);
    feltTiedToRoundIdRef.current = null;
    prevRoundIdForDiceRef.current = null;
  }, [roomId]);

  useEffect(() => {
    shownBankStopMessagesRef.current = new Set();
    prevBankerIdForStopMsgRef.current = null;
    prevBankScForStopMsgRef.current = 0;
    setBankStopBannerText(null);
  }, [roomId]);

  useEffect(() => {
    const sc = Math.max(
      0,
      Math.floor(Number(room?.current_bank_sc ?? room?.current_bank_cents ?? 0))
    );
    if (sc <= 0) {
      setShowBanker(false);
    }
  }, [room?.current_bank_sc, room?.current_bank_cents]);

  useEffect(() => {
    if (!room?.id) return;
    const currentBankSc = Math.max(
      0,
      Math.floor(Number(room.current_bank_sc ?? room.current_bank_cents ?? 0))
    );
    const bid =
      room.banker_id != null && String(room.banker_id).trim() !== ""
        ? String(room.banker_id)
        : null;
    const prevBid = prevBankerIdForStopMsgRef.current;
    const shouldAnnounce =
      prevBid != null &&
      bid != null &&
      prevBid !== bid &&
      currentBankSc <= 0 &&
      room.bank_busted !== true &&
      me != null;

    if (shouldAnnounce) {
      const msgId = `${room.id}:bank-stop:${prevBid}:${bid}`;
      if (!shownBankStopMessagesRef.current.has(msgId)) {
        shownBankStopMessagesRef.current.add(msgId);
        const isNewBankerMe =
          normalizeCeloUserId(bid) === normalizeCeloUserId(me);
        const name = celoBannerSeatLabel(players, bid);
        const text = isNewBankerMe
          ? "You stopped the bank. You are now the banker."
          : `${name} stopped the bank and is now the banker.`;
        console.log("[C-Lo bank stop message]", {
          roomId: room.id,
          roundId: round?.id ?? null,
          oldBankerId: prevBid,
          newBankerId: bid,
          currentUserId: me,
          currentBankSc,
          bankStopped: true,
          modalOpen: showBanker,
        });
        setBankStopBannerText(text);
        window.setTimeout(() => setBankStopBannerText(null), 7000);
      }
    }

    prevBankerIdForStopMsgRef.current = bid;
    prevBankScForStopMsgRef.current = currentBankSc;
  }, [
    room?.id,
    room?.banker_id,
    room?.current_bank_sc,
    room?.current_bank_cents,
    room?.bank_busted,
    players,
    me,
    round?.id,
    showBanker,
  ]);

  useEffect(() => {
    return () => {
      if (noCountRevealTimeoutRef.current) {
        clearTimeout(noCountRevealTimeoutRef.current);
        noCountRevealTimeoutRef.current = null;
      }
      if (rollResultRevealTimerRef.current) {
        clearTimeout(rollResultRevealTimerRef.current);
        rollResultRevealTimerRef.current = null;
      }
      if (settlementBannerTimerRef.current) {
        clearTimeout(settlementBannerTimerRef.current);
        settlementBannerTimerRef.current = null;
      }
      if (bannerDismissTimerRef.current) {
        clearTimeout(bannerDismissTimerRef.current);
        bannerDismissTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!CELO_DEBUG) return;
    console.log("[C-Lo] roll check", {
      isBanker,
      roundStatus: round?.status,
      rollingAction,
      canRollBanker,
    });
  }, [isBanker, round?.status, rollingAction, canRollBanker]);

  const rollDiceDisabled =
    roomPausedBlocking ||
    bannerOverlayVisible ||
    noCountReveal != null ||
    (round?.status === "banker_rolling" && isBanker
      ? !canRollBanker && !CELO_DEBUG
      : rollingAction);

  useEffect(() => {
    if (!bannerOverlayVisible) {
      confettiFiredForRoundRef.current = null;
      return;
    }
    const model = resultBannerModel;
    if (!model?.celebrate || model.kind !== "win") return;
    const rid = resultBannerData?.roundId;
    if (!rid || confettiFiredForRoundRef.current === rid) return;
    confettiFiredForRoundRef.current = rid;
    let cancelled = false;
    void import("canvas-confetti").then((mod) => {
      if (cancelled) return;
      const fire = mod.default;
      fire({
        particleCount: 88,
        spread: 58,
        origin: { y: 0.72 },
        ticks: 240,
        gravity: 1.05,
        scalar: 0.92,
        colors: ["#f5c842", "#eab308", "#fde68a", "#c4b5fd"],
      });
      window.setTimeout(() => {
        if (cancelled) return;
        fire({
          particleCount: 42,
          spread: 68,
          origin: { y: 0.76, x: 0.58 },
          ticks: 190,
          scalar: 0.85,
          colors: ["#fde68a", "#f5c842", "#a78bfa"],
        });
      }, 340);
    });
    return () => {
      cancelled = true;
    };
  }, [bannerOverlayVisible, resultBannerData, resultBannerModel]);

  useEffect(() => {
    if (!CELO_DEBUG) return;
    const src =
      dice != null
        ? "felt_triplet_state"
        : round?.banker_dice
          ? "banker_dice_pending_merge"
          : "none";
    let tumbleWhy: string | null = null;
    if (visualDiceMode === "banker_tumble") {
      if (bankerRollInFlight) tumbleWhy = "server_banker_roll_in_flight";
      else if (rolling) tumbleWhy = "local_rolling";
      else if (!roundHasBankerTriplet && !feltTripletPresent)
        tumbleWhy = "no_banker_triplet_yet";
    }
    console.log("[C-Lo room] felt (dev)", {
      visualDiceMode,
      diceSourceLogged: src,
      banker_roll_in_flight: round?.banker_roll_in_flight,
      bankerTumbleBecause: tumbleWhy,
      hasDice: dice != null,
      isRollingFaces,
      localRolling: rolling,
      roundStatus: round?.status,
      currentPlayerResolvedRoll,
      roundHasBankerTriplet,
      feltTripletPresent,
    });
  }, [
    visualDiceMode,
    dice,
    isRollingFaces,
    rolling,
    round?.status,
    round?.banker_dice,
    round?.banker_roll_in_flight,
    bankerRollInFlight,
    currentPlayerResolvedRoll,
    roundHasBankerTriplet,
    feltTripletPresent,
  ]);

  useEffect(() => {
    if (!CELO_DEBUG) return;
    const seat = isBanker
      ? "banker"
      : isPlayer
        ? "player"
        : isSpec
          ? "spectator"
          : "viewer";
    console.log("[C-Lo room] seat (dev)", {
      seat,
      myEntrySc,
      showJoinCta: !!(
        room &&
        !inProgress &&
        !isBanker &&
        !isSpec &&
        myEntrySc === 0
      ),
    });
  }, [isBanker, isPlayer, isSpec, myEntrySc, room, inProgress]);

  async function handleNewBankerSetup() {
    if (!room || !supabase || !needsBankSetup || newBankerSetupBusy) return;
    setNewBankerSetupError(null);
    const minEntry = Math.max(500, Math.floor(Number(newBankerSetupMinEntry)));
    const funding = Math.max(0, Math.floor(Number(newBankerSetupFunding)));
    const maxPlayers = [2, 4, 6, 10].includes(Number(newBankerSetupMaxPlayers))
      ? Number(newBankerSetupMaxPlayers)
      : 10;
    if (!newBankerSetupName.trim()) {
      setNewBankerSetupError("Room name is required.");
      return;
    }
    if (minEntry <= 0) {
      setNewBankerSetupError("Minimum entry must be greater than 0.");
      return;
    }
    if (funding < minEntry) {
      setNewBankerSetupError("Funding must be at least the minimum entry.");
      return;
    }
    if (funding > myBalance) {
      setNewBankerSetupError("Insufficient balance for setup funding.");
      return;
    }
    setNewBankerSetupBusy(true);
    try {
      const res = await fetchCeloApi(supabase, "/api/celo/room/new-banker-setup", {
        method: "POST",
        body: JSON.stringify({
          room_id: room.id,
          name: newBankerSetupName.trim(),
          minimum_entry_sc: minEntry,
          funding_amount_sc: funding,
          max_players: maxPlayers,
        }),
      });
      const txt = await res.text();
      let j: { error?: string; room?: Record<string, unknown> } = {};
      try {
        j = txt ? (JSON.parse(txt) as typeof j) : {};
      } catch {
        setNewBankerSetupError("Invalid response from setup API.");
        return;
      }
      if (!res.ok) {
        if (res.status === 401) {
          alertCeloUnauthorized();
          return;
        }
        setNewBankerSetupError(j.error ?? "Could not finish banker setup.");
        return;
      }
      if (j.room) {
        bumpOptimisticAsRealtime();
        commitCeloAggregateMerge(
          { room: j.room, updated_at: new Date().toISOString() },
          "join"
        );
      }
      setNewBankerSetupError(null);
      await fetchAll();
    } finally {
      setNewBankerSetupBusy(false);
    }
  }

  async function handleStart() {
    if (!room || !canStartRound) return;
    setResultBannerData(null);
    if (!supabase) {
      setStartRoundError("Not connected. Please refresh and try again.");
      return;
    }
    setStartRoundError(null);
    if (CELO_DEBUG) {
      console.log("[C-Lo room] Start round", {
        roomId: room.id,
        banker: room.banker_id,
        seatedPlayerCount,
        stakedPlayerCount,
      });
    }
    setStartRoundSubmitting(true);
    try {
      const res = await fetchCeloApi(supabase, "/api/celo/round/start", {
        method: "POST",
        body: JSON.stringify({ room_id: room.id }),
      });
      const text = await res.text();
      let j: { error?: string; room?: unknown; round?: unknown } = {};
      try {
        j = text
          ? (JSON.parse(text) as { error?: string; room?: unknown; round?: unknown })
          : {};
      } catch {
        setStartRoundError("Invalid response from server");
        if (CELO_DEBUG) console.error("[C-Lo room] Start round bad JSON", text);
        return;
      }
      console.log("[C-Lo] start round response", { status: res.status, body: j });
      if (!res.ok) {
        if (res.status === 401) {
          setStartRoundError("Session expired. Please log in again.");
          return;
        }
        setStartRoundError(j.error ?? "Could not start round");
        return;
      }
      const rid = String((j.room as { id?: string } | undefined)?.id ?? "");
      if (rid === room.id) {
        bumpOptimisticAsRealtime();
        commitCeloAggregateMerge(
          {
            room: j.room as Record<string, unknown>,
            currentRound:
              j.round != null
                ? (j.round as Record<string, unknown>)
                : undefined,
            updated_at: new Date().toISOString(),
          },
          "join"
        );
      }
      await fetchAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Start round failed";
      setStartRoundError(msg);
      if (CELO_DEBUG) console.error("[C-Lo room] Start round exception", e);
    } finally {
      setStartRoundSubmitting(false);
    }
  }

  async function handlePauseRoom() {
    if (!room || !supabase || !canOfferBankerPause) return;
    setPauseUiBusy(true);
    setRollError(null);
    try {
      const res = await fetchCeloApi(supabase, "/api/celo/room/pause", {
        method: "POST",
        body: JSON.stringify({ room_id: room.id }),
      });
      const text = await res.text();
      let j: { error?: string; room?: Record<string, unknown> } = {};
      try {
        j = text ? (JSON.parse(text) as typeof j) : {};
      } catch {
        setRollError("Invalid pause response");
        return;
      }
      if (!res.ok) {
        setRollError(j.error ?? "Could not pause room");
        return;
      }
      if (j.room) {
        bumpOptimisticAsRealtime();
        commitCeloAggregateMerge(
          {
            room: j.room,
            updated_at: new Date().toISOString(),
          },
          "join"
        );
      }
      await fetchAll();
    } finally {
      setPauseUiBusy(false);
    }
  }

  async function handleResumeRoom() {
    if (!room || !supabase || !isCurrentBanker || !room.paused_at) return;
    setPauseUiBusy(true);
    setRollError(null);
    try {
      const res = await fetchCeloApi(supabase, "/api/celo/room/resume", {
        method: "POST",
        body: JSON.stringify({ room_id: room.id }),
      });
      const text = await res.text();
      let j: { error?: string; room?: Record<string, unknown> } = {};
      try {
        j = text ? (JSON.parse(text) as typeof j) : {};
      } catch {
        setRollError("Invalid resume response");
        return;
      }
      if (!res.ok) {
        setRollError(j.error ?? "Could not resume room");
        return;
      }
      if (j.room) {
        bumpOptimisticAsRealtime();
        commitCeloAggregateMerge(
          {
            room: j.room,
            updated_at: new Date().toISOString(),
          },
          "join"
        );
      }
      await fetchAll();
    } finally {
      setPauseUiBusy(false);
    }
  }

  async function handleRejectPauseRequest() {
    if (!room || !supabase || !isCurrentBanker || !pauseRequested) return;
    setPauseUiBusy(true);
    setRollError(null);
    try {
      const res = await fetchCeloApi(supabase, "/api/celo/room/pause-vote/reset", {
        method: "POST",
        body: JSON.stringify({ room_id: room.id }),
      });
      const text = await res.text();
      let j: { error?: string } = {};
      try {
        j = text ? (JSON.parse(text) as typeof j) : {};
      } catch {
        setRollError("Invalid pause reject response");
        return;
      }
      if (!res.ok) {
        setRollError(j.error ?? "Could not reject pause request");
        return;
      }
      setPauseRequested(false);
      setPauseVoteCount(0);
      await fetchAll();
    } finally {
      setPauseUiBusy(false);
    }
  }

  async function handlePauseVote(vote: "request" | "approve") {
    if (!room || !supabase || !canOfferPlayerPauseVote) return;
    setPauseVoteBusy(true);
    setRollError(null);
    try {
      const res = await fetchCeloApi(supabase, "/api/celo/room/pause-vote", {
        method: "POST",
        body: JSON.stringify({ room_id: room.id, vote }),
      });
      const text = await res.text();
      let j: {
        error?: string;
        room?: Record<string, unknown>;
        pausedByMajority?: boolean;
      } = {};
      try {
        j = text ? (JSON.parse(text) as typeof j) : {};
      } catch {
        setRollError("Invalid vote response");
        return;
      }
      if (!res.ok) {
        setRollError(j.error ?? "Could not record pause vote");
        return;
      }
      if (j.room) {
        bumpOptimisticAsRealtime();
        commitCeloAggregateMerge(
          {
            room: j.room,
            updated_at: new Date().toISOString(),
          },
          "join"
        );
      }
      await fetchAll();
    } finally {
      setPauseVoteBusy(false);
    }
  }

  async function handleRoll() {
    const rollRoomStatus = room?.status ?? null;
    const rollRoundStatus = round?.status ?? null;
    const bankerRollBypass =
      CELO_DEBUG && isBanker && round?.status === "banker_rolling";
    console.warn("[C-Lo UI] roll handler (predicates)", {
      hasRoom: !!room,
      hasRound: !!round,
      hasSupabase: !!supabase,
      rollingAction,
      bankerRollBypass,
      isBanker,
      isPlayer,
      roomStatus: rollRoomStatus,
      roundStatus: rollRoundStatus,
      inProgress,
      canRollBanker,
      canRollPlayer,
      canRoll,
      rollDiceDisabled,
      postEntryInFlight: postEntryInFlightRef.current,
      joinSubmitting,
    });
    if (!room || !round) {
      setRollFetchInfo({ url: "(blocked)", status: !room ? "missing_room" : "missing_round", body: "", error: "" });
      return;
    }
    if (rollingAction && !bankerRollBypass) {
      setRollFetchInfo({ url: "(blocked)", status: "rolling_action_in_progress", body: "", error: "" });
      return;
    }
    if (!supabase) {
      console.error("[C-Lo] roll: blocked — no supabase client");
      setRollError("Please log in to roll.");
      setRollFetchInfo({ url: "(blocked)", status: "missing_supabase", body: "", error: "Please log in to roll." });
      return;
    }
    if (noCountReveal) {
      setRollFetchInfo({
        url: "(blocked)",
        status: "no_count_reveal",
        body: "",
        error: "",
      });
      return;
    }
    setRollError(null);
    if (rollWatchdogRef.current) {
      clearTimeout(rollWatchdogRef.current);
      rollWatchdogRef.current = null;
    }
    rollFetchAbortRef.current?.abort();
    const ac = new AbortController();
    rollFetchAbortRef.current = ac;
    const hardTimeout = setTimeout(() => {
      if (ac.signal.aborted) return;
      console.error("[C-Lo] roll: aborting fetch (hard timeout)", {
        roomId: room.id,
        roundId: round.id,
      });
      ac.abort();
    }, ROLL_HARD_TIMEOUT_MS);
    type RollJson = {
      ok?: boolean;
      error?: string;
      roll?: unknown;
      /** Same as currentRound for player success responses. */
      round?: Record<string, unknown> | null;
      dice?: number[];
      rollName?: string;
      /** Server: win | loss | reroll | push | … */
      outcome?: string;
      canLowerBank?: boolean;
      player_can_become_banker?: boolean;
      newBalance?: number;
      newBank?: number;
      room?: Record<string, unknown>;
      currentRound?: Record<string, unknown>;
      banker_takeover_offered?: boolean;
      player_user_id?: string;
      isCelo?: boolean;
      bankStopped?: boolean;
      oldBankerId?: string | null;
      newBankerId?: string | null;
      message?: string | null;
    };
    rollWatchdogRef.current = setTimeout(() => {
      rollWatchdogRef.current = null;
      if (!rollingRef.current) return;
      console.warn("[C-Lo] watchdog fired (rolling still true after hard timeout)");
      console.error("[C-Lo] roll: watchdog — rolling still true after hard timeout", {
        roomId: room.id,
        roundId: round.id,
      });
      setRollError("Roll timed out — please retry");
      setRolling(false);
      setRollingAction(false);
      void fetchAll();
    }, ROLL_HARD_TIMEOUT_MS);
    let sawOkResponse = false;
    const rollUrl = "/api/celo/round/roll";
    try {
      setRollingAction(true);
      setRolling(true);
      setRollName(null);
      setRollPoint(null);
      setRollFetchInfo({ url: rollUrl, status: "pending", body: "", error: "" });
      const [fetchRes] = await Promise.all([
        fetchCeloApi(supabase, rollUrl, {
          method: "POST",
          body: JSON.stringify({ room_id: room.id, round_id: round.id }),
          signal: ac.signal,
        }).catch((e: unknown) => {
          if (e instanceof Error && e.name === "AbortError") {
            console.error("[C-Lo] roll: fetch aborted (timeout or unmount)", {
              roomId: room.id,
              roundId: round.id,
            });
            throw e;
          }
          console.error("[C-Lo] roll: fetch threw", e, { roomId: room.id, roundId: round.id });
          throw e;
        }),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), ROLL_ANIM_MIN_MS)
        ),
      ]);
      const res = fetchRes as Response;
      const text = await res.text();
      let j: RollJson = {};
      if (text) {
        try {
          j = JSON.parse(text) as RollJson;
        } catch (parseErr) {
          console.error(
            "[C-Lo] roll: JSON parse failed",
            parseErr,
            { status: res.status, textPreview: text.slice(0, 240) }
          );
          setRollError("Invalid response from server");
          setRollFetchInfo({
            url: rollUrl,
            status: String(res.status),
            body: text.slice(0, 200),
            error: "JSON parse error",
          });
          setRolling(false);
          return;
        }
      }
      const rollBodySnippet = JSON.stringify(j).slice(0, 200);
      if (!res.ok) {
        if (res.status === 401) {
          setRollError("Session expired. Please log in again.");
        } else {
          setRollError((j as RollJson).error ?? "Could not complete roll");
        }
        setRollFetchInfo({
          url: rollUrl,
          status: String(res.status),
          body: rollBodySnippet,
          error: (j as RollJson).error ?? (res.status === 401 ? "Session expired. Please log in again." : "Could not complete roll"),
        });
        setRolling(false);
        console.error("[C-Lo] roll: HTTP not ok", {
          status: res.status,
          error: (j as RollJson).error,
        });
        return;
      }
      sawOkResponse = true;
      setRollFetchInfo({
        url: rollUrl,
        status: String(res.status),
        body: rollBodySnippet,
        error: "",
      });
      const rj = j as RollJson;
      console.log("[C-Lo] roll response", { status: res.status, body: rj });
      if (rj.ok === false) {
        setRollError(rj.error ?? "Could not complete roll");
        setRolling(false);
        setRollingAction(false);
        return;
      }
      setLatestRollDebug(rj.roll ?? rj);
      const fromRoll = rj.roll != null ? extractDiceFromRoll(rj.roll) : null;
      const fromTop = extractDiceFromRoll(rj);
      const dArr = rj.dice;
      const candidate =
        fromRoll ??
        fromTop ??
        (Array.isArray(dArr) && dArr.length >= 3
          ? [dArr[0], dArr[1], dArr[2]]
          : null);
      const tripletRaw = realDiceTripletFromUnknown(candidate);
      const outcomeLc = String(rj.outcome ?? "").toLowerCase();

      if (outcomeLc === "reroll" && tripletRaw) {
        const trip = tripletRaw;
        rememberRealFeltDice(trip);
        feltTiedToRoundIdRef.current = round.id;
        const rn = String(rj.rollName ?? "NO POINT • REROLL");
        setRollName(null);
        setRollPoint(null);
        setNoCountReveal({ dice: trip, rollName: rn });
        setRolling(false);
        setRollingAction(false);
        setRollError(null);
        const rollRoomFromApi =
          rj.room && String((rj.room as { id?: string }).id ?? "") === room.id
            ? rj.room
            : undefined;
        const rollRoomPatch: Record<string, unknown> | undefined = (() => {
          if (rollRoomFromApi) return { ...rollRoomFromApi };
          if (typeof j.newBank === "number") {
            return { current_bank_sc: j.newBank };
          }
          return undefined;
        })();
        const roundForMerge = rj.currentRound ?? rj.round;
        const rollRoundPatch: Record<string, unknown> | undefined =
          roundForMerge &&
          String((roundForMerge as { id?: string }).id ?? round.id) === round.id
            ? roundForMerge
            : undefined;
        commitCeloAggregateMerge(
          {
            room: rollRoomPatch,
            currentRound: rollRoundPatch,
            updated_at: new Date().toISOString(),
          },
          "roll"
        );
        lastRealtimeUpdateRef.current = Date.now();
        if (noCountRevealTimeoutRef.current) {
          clearTimeout(noCountRevealTimeoutRef.current);
        }
        noCountRevealTimeoutRef.current = setTimeout(() => {
          noCountRevealTimeoutRef.current = null;
          setNoCountReveal(null);
          setDice(null);
          setRollName(null);
          setRollPoint(null);
          void fetchAll();
        }, 1500);
        return;
      }

      if (tripletRaw) {
        rememberRealFeltDice(tripletRaw);
        feltTiedToRoundIdRef.current = round.id;
      } else {
        console.error("[C-Lo] roll: ok but could not extract dice from response", { j: rj, roundId: round.id });
      }
      setRolling(false);
      setRollingAction(false);
      if (tripletRaw && j.rollName) {
        const name = String(j.rollName).trim();
        if (name) {
          const uid = String(rj.player_user_id ?? me ?? "").trim();
          const resultId = isBanker
            ? `${round.id}:banker:${tripletRaw[0]}-${tripletRaw[1]}-${tripletRaw[2]}`
            : `${round.id}:player:${uid || "unknown"}:${tripletRaw[0]}-${tripletRaw[1]}-${tripletRaw[2]}`;
          const pointRaw = (rj as { point?: unknown }).point;
          const maybePoint =
            typeof pointRaw === "number" && Number.isFinite(pointRaw)
              ? pointRaw
              : null;
          scheduleRollResultReveal(resultId, () => {
            setRollPoint(maybePoint);
            setRollName(name);
          });
        }
      }
      setRollError(null);
      if (typeof j.newBalance === "number") setMyBalance(j.newBalance);
      if (j.canLowerBank) setShowLower(true);
      const apiRoomForBank = rj.room as
        | {
            current_bank_sc?: number;
            current_bank_cents?: number;
            bank_busted?: boolean;
          }
        | undefined;
      const bankAfterRoll = Math.max(
        0,
        Math.floor(
          Number(
            apiRoomForBank?.current_bank_sc ??
              apiRoomForBank?.current_bank_cents ??
              j.newBank ??
              0
          )
        )
      );
      const roomBusted = apiRoomForBank?.bank_busted === true;
      if (
        rj.player_can_become_banker === true &&
        bankAfterRoll > 0 &&
        !roomBusted &&
        !isBanker
      ) {
        setBankerAcceptError(null);
        setShowBanker(true);
      } else {
        setShowBanker(false);
      }
      const rollRoomFromApi =
        rj.room && String((rj.room as { id?: string }).id ?? "") === room.id
          ? rj.room
          : undefined;
      const rollRoomPatch: Record<string, unknown> | undefined = (() => {
        if (rollRoomFromApi) return { ...rollRoomFromApi };
        if (typeof j.newBank === "number") {
          return { current_bank_sc: j.newBank };
        }
        return undefined;
      })();
      const roundForMerge = rj.currentRound ?? rj.round;
      const rollRoundPatch: Record<string, unknown> | undefined =
        roundForMerge && String((roundForMerge as { id?: string }).id ?? round.id) === round.id
          ? roundForMerge
          : undefined;
      commitCeloAggregateMerge(
        {
          room: rollRoomPatch,
          currentRound: rollRoundPatch,
          updated_at: new Date().toISOString(),
        },
        "roll"
      );
      lastRealtimeUpdateRef.current = Date.now();
      await fetchAll();
      if (rj.bankStopped === true) {
        lastBankTakeoverMetaRef.current = {
          oldBankerId:
            rj.oldBankerId != null && String(rj.oldBankerId).trim() !== ""
              ? String(rj.oldBankerId)
              : null,
          newBankerId:
            rj.newBankerId != null && String(rj.newBankerId).trim() !== ""
              ? String(rj.newBankerId)
              : null,
        };
        await new Promise((r) => setTimeout(r, 250));
        await fetchAll();
      }
      if (rj.bankStopped === true && rj.newBankerId) {
        const nid = String(rj.newBankerId);
        const oid =
          rj.oldBankerId != null && String(rj.oldBankerId).trim() !== ""
            ? String(rj.oldBankerId)
            : "none";
        const msgId = `${room.id}:bank-stop:${oid}:${nid}`;
        if (!shownBankStopMessagesRef.current.has(msgId)) {
          shownBankStopMessagesRef.current.add(msgId);
          const isWinner =
            me != null && normalizeCeloUserId(nid) === normalizeCeloUserId(me);
          const bannerText = isWinner
            ? String(rj.message ?? "You stopped the bank. You are now the banker.")
            : "Bank stopped. New banker selected.";
          console.log("[C-Lo bank stop message]", {
            roomId: room.id,
            roundId: round.id,
            oldBankerId: rj.oldBankerId ?? null,
            newBankerId: nid,
            currentUserId: me,
            currentBankSc: bankAfterRoll,
            bankStopped: true,
            modalOpen: showBanker,
          });
          setBankStopBannerText(bannerText);
          window.setTimeout(() => setBankStopBannerText(null), 7000);
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setRollError("Roll timed out — please retry");
        setRollFetchInfo((prev) => ({
          ...prev,
          url: prev.url || rollUrl,
          status: prev.status === "pending" ? "error" : prev.status,
          error: "Roll timed out — please retry",
        }));
        console.error("[C-Lo] roll: request aborted (network or 8s cap)", {
          roomId: room.id,
          roundId: round.id,
        });
      } else {
        console.error("[C-Lo] roll: unhandled", e, {
          roomId: room.id,
          roundId: round.id,
        });
        const errMsg = e instanceof Error ? e.message : "Roll failed";
        setRollError(errMsg);
        setRollFetchInfo((prev) => ({
          ...prev,
          url: prev.url || rollUrl,
          status: prev.status === "pending" ? "error" : prev.status,
          error: errMsg,
        }));
      }
      if (!sawOkResponse) setRolling(false);
    } finally {
      clearTimeout(hardTimeout);
      if (rollWatchdogRef.current) {
        clearTimeout(rollWatchdogRef.current);
        rollWatchdogRef.current = null;
      }
      setRollingAction(false);
      rollFetchAbortRef.current = null;
    }
  }

  async function handleJoin() {
    if (!room || joinInFlightRef.current) return;
    if (!supabase) {
      setJoinHint("Connect to the app to post an entry.");
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (CELO_DEBUG) {
      console.log("SESSION:", session);
    }
    if (!session?.access_token) {
      setJoinHint("Please sign in to post an entry.");
      return;
    }
    setJoinHint(null);
    joinInFlightRef.current = true;
    setJoinSubmitting(true);
    try {
    const res = await fetchCeloApi(supabase, "/api/celo/room/join", {
      method: "POST",
      body: JSON.stringify({
        room_id: room.id,
        role: "player",
      }),
    });
    let j: {
      error?: string;
      already_seated?: boolean;
      player?: Record<string, unknown>;
      room?: Record<string, unknown>;
    };
    try {
      j = (await res.json()) as typeof j;
    } catch {
      setJoinHint("Invalid response from server.");
      return;
    }

    const mergeJoinPayload = () => {
      const rowRaw = j.player ? (normalizeCeloPlayerRow(j.player) as Player) : undefined;
      const row = rowRaw
        ? mergePlayerProfile(
            playersRef.current.find(
              (p) => p.user_id === rowRaw.user_id || p.id === rowRaw.id
            ),
            rowRaw
          )
        : undefined;
      const incomingPlayers = row
        ? sortCeloPlayersBySeat([
            ...playersRef.current.filter(
              (p) => p.id !== row.id && p.user_id !== row.user_id
            ),
            row,
          ])
        : undefined;
      let incomingRoom: Record<string, unknown> | undefined = undefined;
      if (j.room && String((j.room as { id?: string }).id ?? "") === room.id) {
        incomingRoom = j.room as Record<string, unknown>;
      }
      commitCeloAggregateMerge(
        {
          room: incomingRoom,
          players: incomingPlayers,
          updated_at: new Date().toISOString(),
        },
        "join"
      );
      if (row) setPlayersSnapshotReady(true);
    };

    const scheduleFetchAll = () => {
      void fetchAll();
    };

    if (!res.ok) {
      if (res.status === 401) {
        setJoinHint("Session expired. Please sign in again.");
        return;
      }
      const errText = (j.error ?? "Couldn’t post entry").toLowerCase();
      if (errText.includes("already")) {
        if (CELO_DEBUG) {
          console.log("[C-Lo room] join: already at table, syncing from server");
        }
        setJoinHint("You’re already at this table. Updating…");
        mergeJoinPayload();
        bumpOptimisticAsRealtime();
        if (typeof window !== "undefined") {
          window.setTimeout(() => scheduleFetchAll(), 300);
        } else {
          scheduleFetchAll();
        }
        return;
      }
      setJoinHint(j.error ?? "Couldn’t post entry");
      return;
    }
    if (j.already_seated) {
      setJoinHint("You’re already seated — syncing the table…");
      mergeJoinPayload();
      bumpOptimisticAsRealtime();
      if (typeof window !== "undefined") {
        window.setTimeout(() => scheduleFetchAll(), 300);
      } else {
        scheduleFetchAll();
      }
      return;
    }
    setJoinHint(null);
    mergeJoinPayload();
    bumpOptimisticAsRealtime();
    if (typeof window !== "undefined") {
      window.setTimeout(() => scheduleFetchAll(), 300);
    } else {
      scheduleFetchAll();
    }
    } catch (e) {
      setJoinHint(e instanceof Error ? e.message : "Couldn’t post entry");
    } finally {
      joinInFlightRef.current = false;
      setJoinSubmitting(false);
    }
  }

  async function handleDeleteRoom() {
    console.log("[C-Lo] DELETE ROOM CLICKED");
    if (typeof window !== "undefined" && !window.confirm("Delete this C-Lo room? This cannot be undone.")) {
      return;
    }
    if (!supabase || !roomId) {
      alert("Not connected. Please refresh and try again.");
      return;
    }
    const token = await getFreshAccessToken(supabase);
    const res = await fetch("/api/celo/room/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ roomId }),
    });
    let data: { ok?: boolean; error?: string } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      alert("Invalid response from server");
      return;
    }
    console.log("[C-Lo] delete response", data);
    if (!data.ok) {
      alert(data.error ?? "Could not delete room");
      return;
    }
    router.push("/dashboard/games/celo");
  }

  async function handlePostEntry() {
    console.warn("[C-Lo UI] post entry handler (predicates)", {
      canPostEntry,
      hasRoom: !!room,
      hasMe: !!me,
      hasSupabase: !!supabase,
      postEntryInFlight: postEntryInFlightRef.current,
      isBanker,
      isPlayer,
      inProgress,
      postEntryRoomOk,
      postEntryUiRoomOk,
      entryAmount,
      entryAmountFinite: Number.isFinite(entryAmount),
      postEntryBalanceOk,
      postEntryNotYetPosted,
      myEntrySc,
      myRoleLc,
      roomStatusLc,
      roomBankerIdForUi,
      joinSubmitting,
    });
    console.log("[C-Lo UI] POST ENTRY BUTTON CLICKED");
    if (!room || !supabase || !me || postEntryInFlightRef.current) return;
    console.log("[C-Lo] post entry clicked", {
      roomId: room.id,
      userId: me,
      selectedEntryAmount: entryAmount,
      roomStatus: room?.status,
      player: myRow ?? null,
      playerEntryPosted: myRow?.entry_posted,
      playerStake: myRow?.stake_amount_sc,
      gpcBalance: myBalance,
    });
    console.log("[C-Lo UI] post entry payload", {
      roomId: room.id,
      amount: entryAmount,
    });
    if (!canPostEntry) {
      setLastFetchInfo({
        url: "(blocked)",
        status: "canPostEntry=false",
        body: "",
        error: "",
      });
      return;
    }
    setResultBannerData(null);
    setJoinHint(null);
    postEntryInFlightRef.current = true;
    setJoinSubmitting(true);
    const postEntryUrl = "/api/celo/post-entry";
    try {
      const postBody = JSON.stringify({
        roomId: room.id,
        amount: Math.floor(entryAmount),
      });
      setLastFetchInfo({
        url: postEntryUrl,
        status: "pending",
        body: "",
        error: "",
      });
      let res = await fetchCeloApi(supabase, postEntryUrl, {
        method: "POST",
        body: postBody,
      });
      if (res.status === 401) {
        const { error: refreshErr } = await supabase.auth.refreshSession();
        const after = await supabase.auth.getSession();
        if (
          refreshErr ||
          !after.data.session?.access_token
        ) {
          setJoinHint("Session expired. Please sign in again.");
          setLastFetchInfo({
            url: postEntryUrl,
            status: "401",
            body: "",
            error: refreshErr?.message ?? "Session refresh failed",
          });
          return;
        }
        res = await fetchCeloApi(supabase, postEntryUrl, {
          method: "POST",
          body: postBody,
        });
      }
      const text = await res.text();
      console.log("[C-Lo UI] post entry raw response", { status: res.status, body: text });
      let j: {
        ok?: boolean;
        error?: string;
        player?: Record<string, unknown>;
        room?: Record<string, unknown>;
      } = {};
      try {
        j = text ? (JSON.parse(text) as typeof j) : {};
      } catch {
        setJoinHint("Invalid response from server.");
        console.error("[C-Lo] post entry response parse error", text);
        setLastFetchInfo({
          url: postEntryUrl,
          status: String(res.status),
          body: text.slice(0, 200),
          error: "JSON parse error",
        });
        return;
      }
      console.log("[C-Lo] post entry response", { status: res.status, body: j });
      const bodySnippet = JSON.stringify(j).slice(0, 200);
      if (!res.ok || j.ok === false) {
        if (res.status === 401) {
          setJoinHint("Session expired. Please sign in again.");
          setLastFetchInfo({
            url: postEntryUrl,
            status: String(res.status),
            body: bodySnippet,
            error: j.error ?? "unauthorized",
          });
          return;
        }
        const errMsg = j.error ?? `Could not post entry (${res.status})`;
        setJoinHint(errMsg);
        console.error("[C-Lo] post entry failed", errMsg, j);
        setLastFetchInfo({
          url: postEntryUrl,
          status: String(res.status),
          body: bodySnippet,
          error: errMsg,
        });
        return;
      }
      setLastFetchInfo({
        url: postEntryUrl,
        status: String(res.status),
        body: bodySnippet,
        error: "",
      });
      bumpOptimisticAsRealtime();
      const selected = entryAmount;
      if (j.player) {
        const base = normalizeCeloPlayerRow(j.player) as Player;
        const optimistic: Player = {
          ...base,
          entry_posted: true,
          stake_amount_sc: selected,
          status: "active",
          entry_sc: selected,
          bet_cents: selected,
        };
        const row = mergePlayerProfile(
          playersRef.current.find((p) => p.user_id === optimistic.user_id),
          optimistic
        );
        const incomingPlayers = sortCeloPlayersBySeat([
          ...playersRef.current.filter((p) => p.user_id !== row.user_id),
          row,
        ]);
        const incomingRoom =
          j.room && String((j.room as { id?: string }).id ?? "") === room.id
            ? (j.room as Record<string, unknown>)
            : undefined;
        commitCeloAggregateMerge(
          {
            players: incomingPlayers,
            room: incomingRoom,
            updated_at: new Date().toISOString(),
          },
          "join",
          { playersSnapshot: true }
        );
      }
      const { data: u } = await supabase
        .from("users")
        .select("gpay_coins")
        .eq("id", me)
        .maybeSingle();
      setMyBalance(
        Math.max(0, Math.floor((u as { gpay_coins?: number } | null)?.gpay_coins ?? 0))
      );
      await fetchAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not post entry";
      setJoinHint(msg);
      console.error("[C-Lo] post entry exception", e);
      setLastFetchInfo((prev) => ({
        ...prev,
        url: prev.url || postEntryUrl,
        status: prev.status === "pending" ? "error" : prev.status,
        error: msg,
      }));
    } finally {
      postEntryInFlightRef.current = false;
      setJoinSubmitting(false);
    }
  }

  const resultBanner = resultBannerModel ?? null;

  const rbBankerSeatTitleCls =
    resultBanner == null
      ? ""
      : resultBanner.kind === "push"
        ? "font-mono text-[10px] uppercase tracking-[0.25em] text-amber-200/75"
        : resultBanner.winnerSide === "banker"
          ? `${cinzel.className} celo-banner-winner-pop text-lg font-extrabold tracking-wide text-transparent bg-gradient-to-br from-amber-50 via-amber-300 to-amber-600 bg-clip-text sm:text-xl drop-shadow-[0_0_20px_rgba(245,200,66,0.38)]`
          : "font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500";

  const rbPlayerSeatTitleCls =
    resultBanner == null
      ? ""
      : resultBanner.kind === "push"
        ? "font-mono text-[10px] uppercase tracking-[0.25em] text-amber-200/75"
        : resultBanner.winnerSide === "player"
          ? `${cinzel.className} celo-banner-winner-pop text-lg font-extrabold tracking-wide text-transparent bg-gradient-to-br from-amber-50 via-amber-300 to-amber-600 bg-clip-text sm:text-xl drop-shadow-[0_0_20px_rgba(245,200,66,0.38)]`
          : "font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500";

  const viewerSeesYouWin =
    Boolean(
      resultBanner &&
        me &&
        resultBanner.kind === "win" &&
        resultBanner.celebrate &&
        ((resultBanner.winnerUserId &&
          normalizeCeloUserId(me) === normalizeCeloUserId(resultBanner.winnerUserId)) ||
          (resultBanner.multiPlayerWin === true && isPlayer && !isBanker))
    );

  const viewerShowsGreenWinAmt =
    viewerSeesYouWin &&
    resultBanner &&
    resultBanner.winAmountSc != null &&
    resultBanner.winAmountSc > 0 &&
    !resultBanner.multiPlayerWin;

  const stopBankCoverSc = Math.max(
    0,
    Math.floor(Number(room?.current_bank_sc ?? room?.current_bank_cents ?? 0))
  );
  const stopBankModalEligible =
    stopBankCoverSc > 0 &&
    room?.bank_busted !== true &&
    !isBanker;
  const stopBankButtonEnabled =
    stopBankModalEligible &&
    myBalance >= stopBankCoverSc &&
    round?.id != null &&
    !roomPausedBlocking;
  const stopBankModalOpen =
    showBanker &&
    room != null &&
    stopBankModalEligible;

  const feltW = "min(100%, 28rem)";

  const gamePanelClass =
    "relative flex min-h-0 w-full min-w-0 max-w-3xl flex-1 flex-col self-center overflow-x-hidden max-md:overflow-y-visible md:overflow-hidden rounded-2xl border border-amber-400/20 bg-gradient-to-b from-[#0f0a1c] via-[#0a0514] to-[#040208] p-3 shadow-[0_0_0_1px_rgba(245,200,66,0.12),0_4px_40px_rgba(120,50,200,0.12),0_24px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-5 md:p-6 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:opacity-40 before:shadow-[inset_0_0_60px_rgba(245,200,66,0.06),inset_0_-40px_80px_rgba(0,0,0,0.45)]";
  const rightRailClass =
    "hidden min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden md:flex md:max-w-[20rem] md:shrink-0 md:self-stretch lg:max-w-[22rem]";

  return (
    <div
      className={`relative flex w-full min-w-0 max-w-full flex-col overflow-x-hidden text-white ${dm.className}`}
      style={{ background: "radial-gradient(120% 80% at 50% 0%, #1a0a2e 0%, #05010F 45%, #020108 100%)" }}
    >
      {process.env.NEXT_PUBLIC_DEBUG_CELO === "true" && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 99999,
            background: "rgba(0,0,0,0.92)",
            color: "#0f0",
            fontFamily: "monospace",
            fontSize: "10px",
            padding: "8px",
            lineHeight: "1.3",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {`LINE 1: me=${me ?? "null"} | role=${myRow?.role ?? "null"} | banker=${String(isBanker)} | player=${String(isPlayer)}\nLINE 2: roomStatus=${room?.status ?? "null"} | roundStatus=${round?.status ?? "null"} | inProgress=${String(inProgress)}\nLINE 3: entryAmount=${entryAmount} | balance=${myBalance} | myEntrySc=${myEntrySc} | entryPosted=${String(myRow?.entry_posted ?? "null")}\nLINE 4: canPostEntry=${String(canPostEntry)} | joinSubmitting=${String(joinSubmitting)}\nLINE 5: lastFetch=${lastFetchInfo.url} -> ${lastFetchInfo.status}\nLINE 6: lastError=${lastFetchInfo.error || "none"}\nLINE 7: lastResponseBody=${lastFetchInfo.body ? lastFetchInfo.body : "none"}\nLINE 8: rollFetch=${rollFetchInfo.url} -> ${rollFetchInfo.status} | rollErr=${rollFetchInfo.error || "none"}\nLINE 9: bankerInFlight=${String(round?.banker_roll_in_flight ?? null)} | bankerDice=${JSON.stringify(round?.banker_dice ?? null).slice(0,20)}\nLINE 10: mySeat=${mySeatNum} | rollerSeat=${currentSeatNum} | rollerUserId=${round?.roller_user_id ?? "null"} | isMyTurn=${String(isMyTurn)}`}
        </div>
      )}
      {CELO_DEBUG && (
        <div
          className="pointer-events-none z-[300] font-mono text-[10px] text-amber-100/90"
          style={{ position: "absolute", top: 10, right: 10 }}
        >
          status: {round?.status ?? "—"} | rolling: {String(rollingAction)}
        </div>
      )}
      <div className="mx-auto w-full max-w-[1500px] shrink-0 px-4 pb-1 pt-2 sm:pt-3 md:px-6 md:pt-4">
        <header className="rounded-2xl border border-amber-400/10 bg-black/30 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-4">
          <div className="flex min-h-10 min-w-0 items-center gap-2">
            <Link
              href="/dashboard/games/celo"
              className="shrink-0 min-h-touch rounded-lg px-2 text-sm text-amber-300/90 transition hover:text-amber-200 sm:text-base"
            >
              Back
            </Link>
            {isBanker && room && (
              <button
                type="button"
                onClick={() => void handleDeleteRoom()}
                className="shrink-0 min-h-touch rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 sm:text-sm"
              >
                Delete Room
              </button>
            )}
            {!pauseControlsHidden && room && (
              <span className="shrink-0 rounded-md border border-zinc-700/60 bg-zinc-900/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
                Pause controls
              </span>
            )}
            {isCurrentBanker && room && canOfferBankerPause && (
              <>
                <button
                  type="button"
                  disabled={pauseUiBusy}
                  onClick={() => void handlePauseRoom()}
                  className="shrink-0 min-h-touch rounded-lg border border-amber-500/50 bg-amber-950/40 px-2.5 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-900/50 sm:text-sm disabled:opacity-50"
                >
                  {pauseRequested ? "Approve Pause" : "Pause"}
                </button>
                {pauseRequested && (
                  <button
                    type="button"
                    disabled={pauseUiBusy}
                    onClick={() => void handleRejectPauseRequest()}
                    className="shrink-0 min-h-touch rounded-lg border border-rose-500/50 bg-rose-950/30 px-2.5 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-900/40 sm:text-sm disabled:opacity-50"
                  >
                    Reject Pause
                  </button>
                )}
              </>
            )}
            {isCurrentBanker && room && Boolean(room.paused_at) && (
              <button
                type="button"
                disabled={pauseUiBusy}
                onClick={() => void handleResumeRoom()}
                className="shrink-0 min-h-touch rounded-lg border border-emerald-500/50 bg-emerald-950/30 px-2.5 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-900/40 sm:text-sm disabled:opacity-50"
              >
                Resume
              </button>
            )}
            {!isCurrentBanker && room && canOfferPlayerPauseVote && (
              <>
                <button
                  type="button"
                  disabled={pauseVoteBusy}
                  onClick={() => void handlePauseVote("request")}
                  className="shrink-0 min-h-touch rounded-lg border border-zinc-600 px-2 py-1.5 text-[10px] font-semibold text-zinc-200 sm:text-xs disabled:opacity-50"
                >
                  Request Pause
                </button>
                {pauseRequested && (
                  <button
                    type="button"
                    disabled={pauseVoteBusy}
                    onClick={() => void handlePauseVote("approve")}
                    className="shrink-0 min-h-touch rounded-lg border border-amber-600/60 px-2 py-1.5 text-[10px] font-semibold text-amber-100 sm:text-xs disabled:opacity-50"
                  >
                    Vote Pause
                  </button>
                )}
              </>
            )}
            <span
              className={`min-w-0 flex-1 truncate text-sm font-bold text-white sm:text-base ${cinzel.className}`}
            >
              {room?.name?.slice(0, 40) ?? "C-Lo"}
            </span>
            {round && (
              <span className="shrink-0 font-mono text-xs text-amber-200/80">R{round.round_number}</span>
            )}
            <span
              className="shrink-0 max-w-[5.5rem] truncate text-right font-mono text-[9px] tracking-wide sm:max-w-none"
              style={{
                color:
                  connection === "live"
                    ? "#34D399"
                    : connection === "offline"
                      ? "#F87171"
                      : "#FBBF24",
              }}
              title="Supabase real-time channel for this table (not a player count)"
            >
              {connection === "live"
                ? "Real-time on"
                : connection === "offline"
                  ? "Updates paused"
                  : "Connecting…"}
            </span>
            {spectators > 0 ? (
              <span
                className="hidden shrink-0 text-[9px] text-zinc-500 sm:inline"
                title="Players in spectator seats"
              >
                {spectators} spectating
              </span>
            ) : null}
          </div>
          {room && (
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-white/5 pt-1.5 font-mono text-[10px] sm:text-[11px] sm:leading-tight text-zinc-500">
              <span className="shrink-0">Min {minVal(room).toLocaleString()} GPC</span>
              <span className="text-zinc-700" aria-hidden>
                ·
              </span>
              <span>
                Seated {seatedAtTable}/{room.max_players}
              </span>
              <span className="text-zinc-700" aria-hidden>
                ·
              </span>
              <span className="whitespace-nowrap text-zinc-300">{String(room.status)}</span>
              <span className="text-zinc-700" aria-hidden>
                ·
              </span>
              <span>Staked {stakedPlayerCount} player{stakedPlayerCount === 1 ? "" : "s"}</span>
            </div>
          )}
          {room && playersAtTable.length > 0 ? (
            <div className="mt-2 border-t border-white/5 pt-2">
              <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                At the table
              </p>
              <button
                type="button"
                onClick={() => {
                  void refreshRoomPlayers(true);
                  void fetchAll();
                }}
                className="shrink-0 rounded-md border border-zinc-600/50 px-2 py-0.5 font-mono text-[9px] text-zinc-400 transition hover:border-amber-500/40 hover:text-amber-200/90"
                title="Refresh seat list"
              >
                Refresh
              </button>
              </div>
              <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-zinc-300 sm:text-[11px]">
                {playersAtTable.map((p) => {
                  const isRoomBanker =
                    room.banker_id != null &&
                    normalizeCeloUserId(p.user_id) ===
                      normalizeCeloUserId(room.banker_id);
                  return (
                    <li key={p.id} className="flex min-w-0 max-w-full items-baseline gap-1">
                      <span className="shrink-0 text-zinc-500">
                        {p.seat_number != null ? `S${p.seat_number}` : "—"}
                      </span>
                      <span className="min-w-0 truncate text-zinc-200">
                        {resolveDisplayName(p, p.user_id)}
                      </span>
                      {isRoomBanker ? (
                        <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[9px] font-bold uppercase tracking-wide text-amber-300/95">
                          Banker
                        </span>
                      ) : null}
                      {p.role === "player" && p.entry_sc > 0 ? (
                        <span className="shrink-0 text-zinc-500">
                          · {Math.floor(p.entry_sc).toLocaleString()} GPC
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </header>
        {room?.paused_at && roomPauseActive && (
          <div
            className="mt-2 rounded-xl border border-amber-500/40 bg-amber-950/50 px-3 py-2.5 text-center sm:px-4"
            role="status"
          >
            <p className={`text-sm font-bold text-amber-100 sm:text-base ${cinzel.className}`}>
              Room Paused
            </p>
            <p className="mt-0.5 text-xs text-amber-200/85">
              {room.banker_id &&
              room.paused_by &&
              normalizeCeloUserId(room.paused_by) === normalizeCeloUserId(room.banker_id)
                ? "Paused by banker"
                : "Paused by players"}
            </p>
            <p className="mt-1 font-mono text-[11px] text-amber-300/90">
              {pauseRemainingSec > 0
                ? `Auto-close in ${Math.floor(pauseRemainingSec / 60)}:${String(pauseRemainingSec % 60).padStart(2, "0")}`
                : "Time expired — room may close shortly"}
            </p>
          </div>
        )}
        {room?.paused_at && !roomPauseActive && roomPausedBlocking && (
          <div className="mt-2 rounded-xl border border-zinc-600/50 bg-black/40 px-3 py-2 text-center text-xs text-zinc-400">
            Pause window ended — finalizing table…
          </div>
        )}
        {roomFetchError && (
          <div className="mt-2 rounded-lg border border-red-500/30 bg-red-950/50 px-3 py-2 text-center text-xs text-red-200">
            {roomFetchError}
          </div>
        )}
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col gap-3 px-4 pb-3 max-md:pb-14 md:gap-5 md:px-6 md:pb-6">
        <div
          className="grid min-h-0 w-full min-w-0 flex-1 grid-cols-1 place-items-stretch content-stretch gap-4 sm:gap-5 md:min-h-0 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:items-start md:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-6"
        >
          <main className="relative z-0 order-1 flex min-h-0 min-w-0 flex-col md:order-none">
            <div className={gamePanelClass}>
              <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-1 sm:px-2">
              <div className="mb-3 grid w-full max-w-2xl grid-cols-2 gap-3 self-stretch border-b border-white/5 px-1 pb-4 sm:max-w-lg md:grid-cols-2 md:gap-6">
                <div className="text-left">
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-amber-200/60">
                    Prize pool
                  </p>
                  <p className="mt-0.5 font-mono text-lg font-bold text-white md:text-xl" style={{ fontFamily: "ui-monospace, 'Courier New', monospace" }}>
                    {prize.toLocaleString()}{" "}
                    <span className="text-sm font-normal text-amber-100/50">GPC</span>
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-zinc-500">{gpcToUsdDisplay(prize)}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-amber-200/60">Bank</p>
                  <p
                    className="mt-0.5 font-mono text-lg font-bold text-amber-300 md:text-xl"
                    style={{ fontFamily: "ui-monospace, 'Courier New', monospace" }}
                  >
                    {room ? bankVal(room).toLocaleString() : 0}{" "}
                    <span className="text-sm font-normal text-amber-100/50">GPC</span>
                  </p>
                  {isBanker &&
                    room?.last_round_was_celo &&
                    bankVal(room) > 0 &&
                    room.bank_busted !== true &&
                    !needsBankSetup &&
                    !roomPausedBlocking && (
                    <button
                      type="button"
                      onClick={() => {
                        setLowerBankError(null);
                        setLowerAmt(clamp(bankVal(room) - minE, minE, bankVal(room)));
                        setShowLower(true);
                      }}
                      className="mt-0.5 text-[10px] font-mono text-amber-200/80 underline"
                    >
                      Lower bank
                    </button>
                  )}
                </div>
              </div>

              {isBankTakeoverUi ? (
                <div className="relative z-10 mx-auto mb-3 max-w-md text-center md:mb-4">
                  <p
                    className={`text-base font-bold uppercase tracking-[0.14em] text-amber-200 sm:text-lg ${cinzel.className}`}
                  >
                    BANK TAKEN OVER
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-300/95 md:text-sm">
                    {isCurrentBanker
                      ? "You are now the banker. Fund the bank and set room rules below."
                      : `Waiting for ${takeoverBankerDisplayName} to fund the bank.`}
                  </p>
                </div>
              ) : (
                <p className="relative z-10 mx-auto mb-2 max-w-md px-1 text-center text-balance text-xs leading-snug text-zinc-300/95 md:mb-4 md:text-sm md:leading-relaxed">
                  {tableStatusText}
                </p>
              )}

              {showBankerPointCallout && round && (
                <div
                  className="relative z-10 mb-4 w-full max-w-lg rounded-xl border border-amber-500/35 bg-gradient-to-b from-amber-950/45 to-[#0f0a1c] px-4 py-3 text-center shadow-[0_8px_28px_rgba(0,0,0,0.45)] sm:px-5 sm:py-3.5"
                  role="status"
                  aria-live="polite"
                >
                  <p
                    className={`text-base font-bold leading-snug text-amber-100 sm:text-lg ${cinzel.className}`}
                  >
                    {typeof round.banker_point === "number" && Number.isFinite(round.banker_point)
                      ? `POINT ${round.banker_point} SET`
                      : "Point set"}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-amber-100/70 sm:text-sm">
                    Roll higher to win • Match to push • Lower to lose
                  </p>
                </div>
              )}

              <div className="relative z-10 flex flex-col items-center justify-center py-1 md:flex-1 md:min-h-[12rem] md:py-4">
                <div
                  className="pointer-events-none absolute -inset-6 -z-10 opacity-90 md:-inset-8"
                  style={{
                    background:
                      "radial-gradient(52% 48% at 50% 40%, rgba(255,235,180,0.22) 0%, rgba(245,200,66,0.12) 28%, rgba(80,30,120,0.08) 45%, transparent 72%)",
                  }}
                  aria-hidden
                />
                <div
                  className="relative w-full max-w-[260px] min-h-[7.5rem] max-h-[min(32vh,12.5rem)] h-[min(100%,max(8.5rem,min(34vw,28vh)))] md:max-h-none md:max-w-[480px] md:min-h-[12rem] md:h-[min(100%,max(13.5rem,75vw))]"
                  style={{
                    width: feltW,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(ellipse 100% 75% at 50% 38%, #1a5c2e 0%, #0d3d1a 32%, #082510 55%, #041a0d 78%, #021208 100%)",
                    border: "10px solid #7a4a28",
                    boxShadow: `
                    0 0 0 1px #c9a061,
                    0 0 0 3px #4a2d1a,
                    0 0 48px rgba(255, 230, 160, 0.2),
                    0 24px 64px rgba(0,0,0,0.72),
                    inset 0 8px 42px rgba(220, 245, 180, 0.16),
                    inset 0 -32px 52px rgba(0,0,0,0.58)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    className="pointer-events-none absolute left-1/2 top-[38%] z-0 w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      height: "48%",
                      background:
                        "radial-gradient(ellipse at 50% 45%, rgba(255, 255, 220, 0.28) 0%, rgba(255,240,200,0.1) 42%, transparent 74%)",
                    }}
                    aria-hidden
                  />
                  <span
                    className={`absolute z-[1] ${cinzel.className} pointer-events-none select-none`}
                    style={{ fontSize: "clamp(2.5rem,8vw,3.5rem)", color: "#F5C842", opacity: 0.055 }}
                  >
                    GP
                  </span>
                  <div
                    className="relative z-[5] flex items-center justify-center gap-2 md:gap-3"
                    style={{
                      opacity: showIdleDice && !isRollingFaces ? 0.55 : 1,
                      boxShadow: isRollingFaces
                        ? "0 6px 20px rgba(0,0,0,0.4)"
                        : "0 10px 24px rgba(0,0,0,0.5)",
                    }}
                  >
                    {isRollingFaces && !facePips
                      ? [0, 1, 2].map((i) => (
                          <DiceFace
                            key={`${round?.id ?? "r"}-${visualDiceMode}-blank-${i}`}
                            value={1}
                            diceType={myDiceType}
                            size={diceSize}
                            rolling
                            blank
                            delay={[0, 80, 160][i]}
                            variant={CELO_TUMBLE[i]!.variant}
                            durationSec={CELO_TUMBLE[i]!.durationSec}
                          />
                        ))
                      : facePips
                        ? [0, 1, 2].map((i) => (
                            <DiceFace
                              key={`${round?.id ?? "r"}-${visualDiceMode}-d${i}-${facePips[i]}-${isRollingFaces ? "t" : "s"}`}
                              value={facePips[i] as 1 | 2 | 3 | 4 | 5 | 6}
                              diceType={myDiceType}
                              size={diceSize}
                              rolling={isRollingFaces}
                              delay={[0, 80, 160][i]}
                              variant={CELO_TUMBLE[i]!.variant}
                              durationSec={CELO_TUMBLE[i]!.durationSec}
                            />
                          ))
                        : (
                            <CeloDiceEmptyState diceSize={diceSize} />
                          )}
                  </div>
                  <RollNameDisplay
                    rollName={noCountReveal ? null : rollName}
                    point={noCountReveal ? null : rollPoint}
                    onComplete={() => {
                      setRollName(null);
                      setRollPoint(null);
                    }}
                  />
                  {noCountReveal ? (
                    <div className="mt-3 flex flex-col items-center gap-1 px-2">
                      <p
                        className={`text-center text-base font-bold tracking-[0.08em] text-amber-200 sm:text-lg ${cinzel.className}`}
                      >
                        NO POINT — Roll Again
                      </p>
                      {noCountReveal.rollName ? (
                        <p className="text-center font-mono text-xs text-amber-100/75">
                          {noCountReveal.rollName}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {showIdleDice && !isRollingFaces && (
                  <p
                    className={`mt-4 text-center text-sm tracking-widest text-[#f5c842]/60 my-4 ${cinzel.className}`}
                  >
                    {feltIdleLabel}
                  </p>
                )}
                {isRollingFaces && (
                  <p className="mt-2.5 text-center font-mono text-[10px] text-amber-200/50">
                    Rolling…
                  </p>
                )}
              </div>

              <div className="mt-auto w-full max-w-3xl border-t border-white/5 pt-3 md:pt-4">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:flex-row sm:items-start sm:justify-end sm:gap-4">
                  <div className="min-w-0 w-full flex-1 space-y-1.5 md:space-y-2">
                    {needsBankSetup && room && (
                      <div className="mx-auto w-full max-w-md rounded-xl border border-amber-500/40 bg-amber-950/35 p-3">
                        <p className={`text-sm font-bold text-amber-100 ${cinzel.className}`}>
                          {roomStatusLc === "bank_takeover"
                            ? "You are now the banker"
                            : "New Banker Setup"}
                        </p>
                        <p className="mt-1 text-xs text-amber-200/85">
                          {roomStatusLc === "bank_takeover"
                            ? "Fund the bank and edit room rules below. Players can join once the table is funded."
                            : "You stopped the bank. Set your rules and fund the bank to continue."}
                        </p>
                        {newBankerSetupError && (
                          <p className="mt-2 text-xs text-red-300">{newBankerSetupError}</p>
                        )}
                        <div id="celo-edit-room-rules" className="mt-2 space-y-2">
                          <label className="block text-left text-xs text-zinc-300">
                            Room name
                            <input
                              type="text"
                              value={newBankerSetupName}
                              onChange={(e) => setNewBankerSetupName(e.target.value)}
                              className="mt-1 w-full rounded border border-amber-400/30 bg-black/35 px-2 py-2 text-sm text-white"
                              maxLength={40}
                            />
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block text-left text-xs text-zinc-300">
                              Minimum entry (GPC)
                              <input
                                type="number"
                                min={500}
                                step={1}
                                value={newBankerSetupMinEntry}
                                onChange={(e) =>
                                  setNewBankerSetupMinEntry(Math.max(500, Math.floor(Number(e.target.value) || 0)))
                                }
                                className="mt-1 w-full rounded border border-amber-400/30 bg-black/35 px-2 py-2 text-sm text-white"
                              />
                            </label>
                            <label className="block text-left text-xs text-zinc-300">
                              Fund bank (GPC)
                              <input
                                type="number"
                                min={newBankerSetupMinEntry}
                                step={1}
                                value={newBankerSetupFunding}
                                onChange={(e) =>
                                  setNewBankerSetupFunding(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                                }
                                className="mt-1 w-full rounded border border-amber-400/30 bg-black/35 px-2 py-2 text-sm text-white"
                              />
                            </label>
                          </div>
                          <label className="block text-left text-xs text-zinc-300">
                            Max players
                            <select
                              value={newBankerSetupMaxPlayers}
                              onChange={(e) => setNewBankerSetupMaxPlayers(Number(e.target.value))}
                              className="mt-1 w-full rounded border border-amber-400/30 bg-black/35 px-2 py-2 text-sm text-white"
                            >
                              {[2, 4, 6, 10].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => void handleNewBankerSetup()}
                            disabled={newBankerSetupBusy || roomPausedBlocking}
                            className="min-h-[46px] flex-1 rounded-xl px-4 text-sm font-bold text-zinc-950 disabled:opacity-60"
                            style={{ background: "linear-gradient(135deg, #F5C842, #B8860B)" }}
                          >
                            {newBankerSetupBusy ? "Setting up…" : "Fund Bank"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              document
                                .getElementById("celo-edit-room-rules")
                                ?.scrollIntoView({ behavior: "smooth", block: "center" })
                            }
                            className="min-h-[46px] flex-1 rounded-xl border border-amber-400/50 bg-transparent px-4 text-sm font-semibold text-amber-100 transition hover:bg-amber-950/40"
                          >
                            Edit Room Rules
                          </button>
                        </div>
                      </div>
                    )}
                    {canRoll && !bannerOverlayVisible && (
                      <div className="mx-auto w-full max-w-md">
                        {rollError && (
                          <p className="mb-2 text-center text-xs text-red-300/95">{rollError}</p>
                        )}
                        <button
                          type="button"
                          disabled={rollDiceDisabled}
                          onClick={() => void handleRoll()}
                          className={`w-full min-h-[48px] rounded-xl px-5 text-sm font-bold text-zinc-950 ${cinzel.className} block transition hover:opacity-95`}
                          style={{
                            background: "linear-gradient(135deg, #F5C842, #B8860B)",
                            boxShadow: "0 0 0 1px rgba(0,0,0,0.2), 0 10px 28px rgba(245,200,66,0.2)",
                            opacity: rollDiceDisabled ? 0.65 : 1,
                          }}
                        >
                          Roll dice
                        </button>
                      </div>
                    )}
                    {showStartRoundPanel && !canRoll && (
                      <div className="mx-auto flex w-full max-w-md flex-col gap-1.5">
                        <button
                          type="button"
                          disabled={!canStartRound}
                          onClick={() => void handleStart()}
                          className={`w-full min-h-[48px] rounded-xl px-4 text-sm font-bold ${dm.className} transition-all ${
                            canStartRound
                              ? "bg-gradient-to-r from-[#f5c842] to-[#d4a828] text-black shadow-[0_0_20px_rgba(245,200,66,0.4)] hover:scale-[1.02]"
                              : "cursor-not-allowed border border-purple-800/40 bg-purple-950/40 text-purple-200/80"
                          }`}
                        >
                          {canStartRound
                            ? "Start round"
                            : stakedPlayerCount < 1
                              ? "Waiting for players to post entries…"
                              : room.bank_busted === true
                                ? "Waiting for new banker…"
                                : bankVal(room) <= 0
                                  ? "Fund the bank before starting…"
                                  : "Start round"}
                        </button>
                        {room.bank_busted === true && (
                          <p className="px-1 text-center text-xs text-amber-200/85">
                            Waiting for new banker.
                          </p>
                        )}
                        {room.bank_busted !== true &&
                          bankVal(room) <= 0 &&
                          stakedPlayerCount >= 1 && (
                          <p className="px-1 text-center text-xs text-amber-200/85">
                            Bank busted — add GPC to the bank (server: waiting) before starting.
                          </p>
                        )}
                        {stakedPlayerCount < 1 && seatedPlayerCount >= 1 && (
                          <p className="px-1 text-center text-xs text-zinc-500">
                            Players must post entries before the round can start.
                          </p>
                        )}
                        {seatedPlayerCount < 1 && (
                          <p className="px-1 text-center text-xs text-zinc-500">
                            Waiting for players to join…
                          </p>
                        )}
                        {startRoundError && (
                          <p className="px-1 text-center text-xs text-red-300">{startRoundError}</p>
                        )}
                      </div>
                    )}
                    {room &&
                      !inProgress &&
                      isPlayer &&
                      myEntrySc > 0 &&
                      postEntryUiRoomOk && (
                        <p className="mx-auto max-w-md text-center text-balance text-xs leading-snug text-amber-200/90 sm:text-sm">
                          {myEntrySc.toLocaleString()} GPC posted — waiting for banker to start.
                        </p>
                      )}
                    {room &&
                      !inProgress &&
                      !isBanker &&
                      !isSpec &&
                      !myRow &&
                      (String(room.status) === "waiting" || String(room.status) === "entry_phase") && (
                        <div className="mx-auto flex w-full max-w-md flex-col gap-2">
                          {joinHint && (
                            <p className="text-center text-xs leading-snug text-amber-200/80">{joinHint}</p>
                          )}
                          <button
                            type="button"
                            disabled={joinSubmitting}
                            aria-busy={joinSubmitting}
                            onClick={() => {
                              void handleJoin();
                            }}
                            className="w-full min-h-[44px] rounded-xl font-bold text-zinc-950 touch-manipulation"
                            style={{
                              background: "linear-gradient(135deg, #F5C842, #B8860B)",
                            }}
                          >
                            {joinSubmitting ? "Joining…" : "Take a seat (no charge yet)"}
                          </button>
                        </div>
                      )}
                    {room &&
                      !inProgress &&
                      !isBanker &&
                      isPlayer &&
                      myEntrySc === 0 &&
                      !isSpec &&
                      postEntryUiRoomOk && (
                        <div className="mx-auto flex w-full max-w-md flex-col gap-1 md:gap-2">
                          {joinHint && (
                            <p className="text-center text-xs leading-snug text-amber-200/80 md:text-sm">
                              {joinHint}
                            </p>
                          )}
                          <div className="rounded-xl border border-amber-400/20 bg-black/40 p-2 md:border-0 md:bg-transparent md:p-0">
                            <p className="text-center text-[11px] leading-snug text-amber-200/90 md:mb-1 md:text-sm">
                              Min {minE.toLocaleString()} · Max {maxStakeSc.toLocaleString()} GPC
                            </p>
                            <div className="mt-1.5 grid grid-cols-2 gap-1 md:hidden">
                              <button
                                type="button"
                                data-selected={entryAmount === celoMobileQuick1}
                                onClick={() => {
                                  setJoinHint(null);
                                  setEntryAmount(celoMobileQuick1);
                                }}
                                className={`h-9 rounded-lg border border-[#f5c842]/40 px-1 text-xs font-semibold text-[#f5c842] transition hover:bg-[#f5c842]/10 data-[selected=true]:bg-[#f5c842] data-[selected=true]:text-black ${cinzel.className}`}
                              >
                                {celoMobileQuick1.toLocaleString()}
                              </button>
                              <button
                                type="button"
                                data-selected={entryAmount === celoMobileQuick2Ui}
                                onClick={() => {
                                  setJoinHint(null);
                                  setEntryAmount(celoMobileQuick2Ui);
                                }}
                                disabled={celoMobileQuick2Ui === celoMobileQuick1}
                                className={`h-9 rounded-lg border border-[#f5c842]/40 px-1 text-xs font-semibold text-[#f5c842] transition hover:bg-[#f5c842]/10 disabled:pointer-events-none disabled:opacity-35 data-[selected=true]:bg-[#f5c842] data-[selected=true]:text-black ${cinzel.className}`}
                              >
                                {celoMobileQuick2Ui.toLocaleString()}
                              </button>
                              <button
                                type="button"
                                data-selected={entryAmount === maxStakeSc && maxStakeSc > 0}
                                onClick={() => {
                                  setJoinHint(null);
                                  setEntryAmount(Math.min(maxStakeSc, Math.max(minE, myBalance)));
                                }}
                                disabled={maxStakeSc <= 0}
                                className={`col-span-2 h-9 rounded-lg border border-amber-500/60 px-2 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-500/15 disabled:opacity-40 ${cinzel.className}`}
                              >
                                Cover bank
                              </button>
                            </div>
                            <div className="mt-2 hidden flex-wrap justify-center gap-1.5 md:flex">
                              {celoEntryPresetAmounts.map((amt) => (
                                <button
                                  key={amt}
                                  type="button"
                                  data-selected={entryAmount === amt}
                                  onClick={() => {
                                    setJoinHint(null);
                                    setEntryAmount(amt);
                                  }}
                                  className={`min-h-[44px] min-w-[3.5rem] rounded-xl border border-[#f5c842]/40 px-4 py-3 text-sm text-[#f5c842] transition hover:bg-[#f5c842]/10 data-[selected=true]:bg-[#f5c842] data-[selected=true]:text-black ${cinzel.className}`}
                                >
                                  {amt.toLocaleString()}
                                </button>
                              ))}
                              <button
                                type="button"
                                data-selected={entryAmount === maxStakeSc && maxStakeSc > 0}
                                onClick={() => {
                                  setJoinHint(null);
                                  setEntryAmount(Math.min(maxStakeSc, Math.max(minE, myBalance)));
                                }}
                                disabled={maxStakeSc <= 0}
                                className={`min-h-[44px] rounded-xl border border-amber-500/60 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15 disabled:opacity-40 ${cinzel.className}`}
                              >
                                Cover bank
                              </button>
                            </div>
                            <label className="mx-auto mt-1.5 flex w-full max-w-xs flex-col gap-0.5 text-left md:mt-2 md:max-w-none md:gap-1">
                              <span className="text-[11px] text-zinc-400 md:text-xs">Bet (GPC)</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={minE}
                                max={maxStakeSc > 0 ? maxStakeSc : minE}
                                step={1}
                                value={entryAmount}
                                onChange={(ev) => {
                                  const raw = ev.target.value;
                                  if (raw === "") {
                                    setEntryAmount(minE);
                                    return;
                                  }
                                  const v = Number(raw);
                                  if (!Number.isFinite(v)) return;
                                  const whole = Math.floor(v);
                                  setEntryAmount(
                                    clamp(whole, minE, maxStakeSc > 0 ? maxStakeSc : minE)
                                  );
                                }}
                                className="h-9 rounded-lg border border-[#f5c842]/35 bg-black/40 px-3 text-center text-sm tabular-nums text-[#f5c842] outline-none focus:ring-2 focus:ring-[#f5c842]/40 md:h-auto md:min-h-[44px] md:rounded-xl md:text-left"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={joinSubmitting}
                              aria-disabled={joinSubmitting || !canPostEntry}
                              aria-busy={joinSubmitting}
                              onClick={() => {
                                void handlePostEntry();
                              }}
                              className={`mt-1.5 w-full rounded-lg font-bold text-zinc-950 touch-manipulation h-10 text-sm md:mt-2 md:h-auto md:min-h-[48px] md:rounded-xl ${cinzel.className}`}
                              style={{
                                background: "linear-gradient(135deg, #F5C842, #B8860B)",
                                opacity: joinSubmitting || !canPostEntry ? 0.45 : 1,
                                cursor:
                                  joinSubmitting || !canPostEntry ? "not-allowed" : "pointer",
                              }}
                            >
                              {joinSubmitting
                                ? "Posting…"
                                : `Post Entry — ${entryAmount.toLocaleString()} GPC`}
                            </button>
                          </div>
                        </div>
                      )}
                    {isSpec && (
                      <p className="text-center text-sm text-zinc-400/95">You’re spectating this table.</p>
                    )}
                  </div>
                  <div className="flex shrink-0 justify-center self-start sm:flex-col sm:items-center sm:justify-start">
                    <button
                      type="button"
                      onClick={() => setDiceModal(true)}
                      className="h-11 w-11 shrink-0 rounded-lg border border-violet-500/35 bg-violet-950/40 text-lg transition hover:bg-violet-900/50"
                      aria-label="Dice style"
                    >
                      🎲
                    </button>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </main>

          <aside className={`${rightRailClass} min-h-0`}>
            <div className="flex h-full min-h-0 max-h-[min(100dvh,52rem)] flex-col overflow-hidden rounded-2xl border border-amber-400/12 bg-[#08050f] p-0 shadow-lg md:max-h-none">
              <CeloRoomChatPanel
                className="min-h-0 flex-1"
                messages={messages}
                value={chat}
                onChange={setChat}
                onSend={() => void sendRoomChat()}
                selfProfile={myProfile}
                selfUserId={me}
                canSend={!!(supabase && me && room && chat.trim().length > 0)}
              />
            </div>
          </aside>
        </div>
      </div>
      {/* Mobile chat: fixed above bottom nav so it does not reflow/push the game panel */}
      <div
        className="pointer-events-none fixed inset-x-0 z-[101] md:hidden"
        style={{
          bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="pointer-events-auto mx-auto w-full max-w-[1500px] px-4">
          <div
            className="grid h-11 w-full min-w-0 shrink-0 rounded-t-xl border border-b-0 border-amber-400/10 text-xs shadow-[0_-4px_24px_rgba(0,0,0,0.35)]"
            style={{
              background: "rgba(5,1,15,0.96)",
              gridTemplateColumns: "1fr",
            }}
          >
            <button
              type="button"
              onClick={() => setPanelOpen((o) => !o)}
              className="min-h-touch font-mono"
              style={{
                borderBottom: panelOpen ? "2px solid #F5C842" : "2px solid transparent",
                color: panelOpen ? "#F5C842" : "#6B7280",
              }}
            >
              💬 Table chat
            </button>
          </div>
          <div
            className="overflow-hidden rounded-b-xl border border-t-0 border-amber-400/10 transition-[height] duration-200 ease-out"
            style={{
              background: "rgba(8,5,15,0.98)",
              height: panelOpen ? "min(36vh, 260px)" : 0,
            }}
          >
            <CeloRoomChatPanel
              className="h-full min-h-0"
              minHeightStyle={{ minHeight: "min(34vh, 240px)" }}
              messages={messages}
              value={chat}
              onChange={setChat}
              onSend={() => void sendRoomChat()}
              selfProfile={myProfile}
              selfUserId={me}
              canSend={!!(supabase && me && room && chat.trim().length > 0)}
            />
          </div>
        </div>
      </div>
      {bankStopBannerText != null && (
        <div
          className="pointer-events-none fixed inset-x-4 bottom-28 z-[22000] flex justify-center sm:bottom-32"
          role="status"
        >
          <div
            className={`max-w-lg rounded-xl border border-amber-400/40 bg-[#0D0520]/98 px-4 py-3 text-center shadow-lg shadow-black/50 ${cinzel.className}`}
          >
            <p className="text-sm font-bold leading-snug text-amber-100 sm:text-base">
              {bankStopBannerText}
            </p>
          </div>
        </div>
      )}
      {abandonmentNotice != null && (
        <div
          className="pointer-events-none fixed inset-x-4 bottom-28 z-[22001] flex justify-center sm:bottom-32"
          role="status"
        >
          <div
            className={`max-w-lg rounded-xl border border-rose-500/35 bg-[#1a0a0f]/98 px-4 py-3 text-center shadow-lg shadow-black/50 ${dm.className}`}
          >
            <p className="text-sm font-semibold leading-snug text-rose-100 sm:text-base">
              {abandonmentNotice}
            </p>
          </div>
        </div>
      )}
      {resultBannerData != null && resultBanner != null && room && (
        <div
          className="fixed inset-0 z-[22500] flex cursor-pointer items-center justify-center p-2 sm:p-3"
          style={{ background: "rgba(0,0,0,0.78)" }}
          role="button"
          tabIndex={0}
          aria-label="Dismiss result"
          onClick={() => {
            setResultBannerData(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setResultBannerData(null);
            }
          }}
        >
          <div
            className={`pointer-events-auto mx-auto max-h-[70vh] max-w-lg cursor-default overflow-x-hidden overflow-y-auto rounded-2xl border border-amber-500/45 px-3 py-4 text-center shadow-[0_24px_80px_rgba(0,0,0,0.88)] sm:max-w-xl sm:px-5 sm:py-5 ${dm.className}`}
            style={{ background: "rgba(13,5,32,0.97)" }}
            role="status"
            aria-live="polite"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="sr-only">{resultBanner.title}</span>
            <div className="flex flex-col items-center gap-3">
              <div className="flex flex-wrap items-start justify-center gap-4 sm:gap-6">
                <div className="flex flex-col items-center gap-1">
                  <span className={rbBankerSeatTitleCls}>{resultBanner.bankerLabel}</span>
                  <div className="flex gap-1.5 sm:gap-2">
                    {resultBanner.bankerTriplet &&
                    isRealDiceValues(resultBanner.bankerTriplet)
                      ? resultBanner.bankerTriplet.map((pip, i) => (
                          <DiceFace
                            key={`banner-b-${i}`}
                            value={pip as 1 | 2 | 3 | 4 | 5 | 6}
                            diceType={myDiceType}
                            size={Math.round(
                              Math.min(88, diceSize + 18) * 0.65
                            )}
                          />
                        ))
                      : (
                          <CeloDiceEmptyState
                            diceSize={Math.round(
                              Math.min(88, diceSize + 18) * 0.65
                            )}
                          />
                        )}
                  </div>
                  {resultBanner.bankerRollName ? (
                    <p className="max-w-[14rem] text-center text-xs font-semibold leading-tight text-amber-100/95">
                      {resultBanner.bankerRollName}
                    </p>
                  ) : null}
                </div>
                {resultBanner.showPlayerRow && resultBanner.playerTriplet ? (
                  <div className="flex flex-col items-center gap-1">
                    <span className={rbPlayerSeatTitleCls}>{resultBanner.playerLabel}</span>
                    <div className="flex gap-1.5 sm:gap-2">
                      {resultBanner.playerTriplet.map((pip, i) => (
                        <DiceFace
                          key={`banner-p-${i}`}
                          value={pip as 1 | 2 | 3 | 4 | 5 | 6}
                          diceType={myDiceType}
                          size={Math.round(
                            Math.min(88, diceSize + 18) * 0.65
                          )}
                        />
                      ))}
                    </div>
                    {resultBanner.playerRollName ? (
                      <p className="max-w-[14rem] text-center text-xs font-semibold leading-tight text-amber-100/95">
                        {resultBanner.playerRollName}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {resultBanner.kind === "push" ? (
                <div className="max-w-xl space-y-1">
                  <p
                    className={`text-lg font-bold leading-snug text-amber-50 sm:text-xl ${cinzel.className}`}
                  >
                    {resultBanner.detailLine}
                  </p>
                  <p className="text-xs text-zinc-400">Stakes refunded.</p>
                </div>
              ) : (
                <div className="flex max-w-xl shrink-0 flex-col items-center gap-1.5 px-1">
                  {viewerSeesYouWin ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <p
                        className={`text-base font-bold tracking-[0.12em] text-emerald-400/95 sm:text-[1.0125rem] ${cinzel.className}`}
                      >
                        YOU WIN!
                      </p>
                      {viewerShowsGreenWinAmt ? (
                        <p className="font-mono text-[1.7rem] font-bold leading-none text-emerald-400 sm:text-[2.125rem]">
                          +{resultBanner.winAmountSc!.toLocaleString()} GPC
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-0">
                    <span
                      className={`celo-banner-winner-pop inline-block ${cinzel.className} bg-gradient-to-br from-amber-50 via-amber-200 to-amber-500 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent drop-shadow-[0_0_22px_rgba(245,200,66,0.4)] sm:text-4xl`}
                    >
                      {resultBanner.headlineWinnerLabel}
                    </span>
                    <span
                      className={`text-xl font-bold text-amber-100/95 sm:text-2xl ${cinzel.className}`}
                    >
                      WINS
                    </span>
                  </div>
                  <p className="max-w-[min(100%,28rem)] px-0.5 text-center text-sm font-semibold leading-snug tracking-wide text-amber-200/95 sm:text-[0.98rem]">
                    {resultBanner.detailLine}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {showLower && room && (
        <div
          className="fixed inset-0 z-[20100] flex items-end justify-center p-0"
          style={{ background: "rgba(0,0,0,0.6)" }}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl p-4"
            style={{ background: "#0D0520", borderTop: "2px solid #F5C842" }}
          >
            <p className={`text-lg text-[#F5C842] ${cinzel.className}`}>
              Lower bank
            </p>
            {lowerBankError && (
              <p className="mt-2 text-sm text-red-300/95">{lowerBankError}</p>
            )}
            <input
              type="number"
              value={lowerAmt}
              onChange={(e) => setLowerAmt(Math.max(0, +e.target.value))}
              className="mt-2 w-full min-h-[44px] rounded border px-2"
              style={{
                background: "rgba(255,255,255,0.05)",
                borderColor: "rgba(124,58,237,0.3)",
                color: "#fff",
              }}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  setLowerBankError(null);
                  if (!supabase) {
                    setLowerBankError("Connect to the app to change the bank.");
                    return;
                  }
                  const res = await fetchCeloApi(supabase, "/api/celo/room/lower-bank", {
                    method: "POST",
                    body: JSON.stringify({
                      room_id: room.id,
                      new_bank_sc: lowerAmt,
                    }),
                  });
                  if (res.ok) {
                    setShowLower(false);
                    void fetchAll();
                  } else {
                    if (res.status === 401) {
                      alertCeloUnauthorized();
                      return;
                    }
                    const j = (await res.json()) as { error?: string };
                    setLowerBankError(j.error ?? "Could not update bank");
                  }
                }}
                className="min-h-[44px] flex-1 rounded font-bold"
                style={{
                  background: "linear-gradient(135deg, #F5C842, #D4A017)",
                  color: "#0A0A0A",
                }}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => {
                  setLowerBankError(null);
                  setShowLower(false);
                }}
                className="min-h-[44px] text-[#6B7280]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showCeloTakeover && room && celoTakeoverRoundId && (
        <div
          className="fixed inset-0 z-[20105] flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
        >
          <div
            className="m-2 w-full max-w-lg rounded-t-2xl p-4"
            style={{ background: "#0D0520", borderTop: "2px solid #F5C842" }}
          >
            <p className="text-3xl">🎲</p>
            <p className={`mt-2 text-xl text-[#F5C842] ${cinzel.className}`}>
              C-Lo — take the bank?
            </p>
            {celoTakeoverError && (
              <p className="mt-2 text-sm text-red-300/95">{celoTakeoverError}</p>
            )}
            <p className="mt-1 text-sm text-[#9CA3AF]">
              You hit 4-5-6. Take banker position for the next round, or pass to
              keep the current banker.
            </p>
            <p className="mt-1 text-sm font-mono text-[#E5E7EB]">
              {celoTakeoverSec == null
                ? "—"
                : celoTakeoverSec > 0
                  ? `Offer ends in ${celoTakeoverSec}s`
                  : "Offer ending…"}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  setCeloTakeoverError(null);
                  if (!supabase) {
                    setCeloTakeoverError("Connect to the app to continue.");
                    return;
                  }
                  const res = await fetchCeloApi(
                    supabase,
                    "/api/celo/banker-takeover",
                    {
                      method: "POST",
                      body: JSON.stringify({
                        room_id: room.id,
                        round_id: celoTakeoverRoundId,
                        accept: true,
                      }),
                    }
                  );
                  if (res.ok) {
                    celoTimeoutPassSentRef.current = true;
                    setShowCeloTakeover(false);
                    setCeloTakeoverExpiresAt(null);
                    setCeloTakeoverRoundId(null);
                    void fetchAll();
                    return;
                  }
                  if (res.status === 401) {
                    alertCeloUnauthorized();
                    return;
                  }
                  const e = (await res.json().catch(() => ({}))) as {
                    error?: string;
                  };
                  setCeloTakeoverError(e.error ?? "Could not take the bank");
                }}
                className="min-h-[44px] flex-1 rounded font-bold"
                style={{
                  background: "linear-gradient(135deg, #F5C842, #D4A017)",
                  color: "#0A0A0A",
                }}
              >
                Take Banker
              </button>
              <button
                type="button"
                onClick={async () => {
                  setCeloTakeoverError(null);
                  if (!supabase) {
                    setCeloTakeoverError("Connect to the app to continue.");
                    return;
                  }
                  const res = await fetchCeloApi(
                    supabase,
                    "/api/celo/banker-takeover",
                    {
                      method: "POST",
                      body: JSON.stringify({
                        room_id: room.id,
                        round_id: celoTakeoverRoundId,
                        accept: false,
                      }),
                    }
                  );
                  if (res.ok) {
                    celoTimeoutPassSentRef.current = true;
                    setShowCeloTakeover(false);
                    setCeloTakeoverExpiresAt(null);
                    setCeloTakeoverRoundId(null);
                    void fetchAll();
                    return;
                  }
                  if (res.status === 401) {
                    alertCeloUnauthorized();
                    return;
                  }
                  setShowCeloTakeover(false);
                  setCeloTakeoverExpiresAt(null);
                  setCeloTakeoverRoundId(null);
                  void fetchAll();
                }}
                className="min-h-[44px] text-[#6B7280]"
              >
                Pass
              </button>
            </div>
          </div>
        </div>
      )}
      {stopBankModalOpen && room && (
        <div
          className="fixed inset-0 z-[20100] flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
        >
          <div
            className="m-2 w-full max-w-lg rounded-t-2xl p-4"
            style={{ background: "#0D0520", borderTop: "2px solid #F5C842" }}
          >
            <p className="text-3xl">🎲</p>
            <p className={`mt-2 text-xl text-[#F5C842] ${cinzel.className}`}>
              Stop the Bank
            </p>
            {bankerAcceptError && (
              <p className="mt-2 text-sm text-red-300/95">{bankerAcceptError}</p>
            )}
            <p className="mt-1 text-sm text-[#9CA3AF]">
              Cover {stopBankCoverSc.toLocaleString()} GPC to take full-bank action.
            </p>
            <p className="mt-1 text-xs font-mono text-amber-200/80">
              {myBalance >= stopBankCoverSc
                ? "Eligible to stop the bank."
                : `Need ${(stopBankCoverSc - myBalance).toLocaleString()} more GPC to cover.`}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={!stopBankButtonEnabled}
                onClick={async () => {
                  setBankerAcceptError(null);
                  if (!supabase) {
                    setBankerAcceptError("Connect to the app to take the bank.");
                    return;
                  }
                  if (!round?.id) {
                    setBankerAcceptError("Round not eligible for stop-the-bank yet.");
                    return;
                  }
                  if (stopBankCoverSc <= 0) {
                    setBankerAcceptError("The table bank is empty.");
                    setShowBanker(false);
                    return;
                  }
                  if (myBalance < stopBankCoverSc) {
                    setBankerAcceptError("Insufficient balance to cover full bank.");
                    return;
                  }
                  const res = await fetchCeloApi(supabase, "/api/celo/banker-takeover", {
                    method: "POST",
                    body: JSON.stringify({
                      room_id: room.id,
                      round_id: round?.id,
                      accept: true,
                    }),
                  });
                  if (res.ok) {
                    setShowBanker(false);
                    void fetchAll();
                  } else {
                    if (res.status === 401) {
                      alertCeloUnauthorized();
                      return;
                    }
                    const j = (await res.json()) as { error?: string };
                    setBankerAcceptError(j.error ?? "Could not take the bank");
                  }
                }}
                className="min-h-[44px] flex-1 rounded font-bold"
                style={{
                  background: "linear-gradient(135deg, #F5C842, #D4A017)",
                  color: "#0A0A0A",
                  opacity: !stopBankButtonEnabled ? 0.5 : 1,
                }}
              >
                Stop the Bank — {stopBankCoverSc.toLocaleString()} GPC
              </button>
              <button
                type="button"
                onClick={() => {
                  setBankerAcceptError(null);
                  setShowBanker(false);
                }}
                className="text-[#6B7280]"
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
      {diceModal && (
        <div
          className="fixed inset-0 z-[20100] flex items-center justify-center p-3"
          style={{ background: "rgba(0,0,0,0.9)" }}
        >
          <div
            className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl p-4"
            style={{ background: "#0D0520" }}
          >
            <h3 className={`text-lg text-[#F5C842] ${cinzel.className}`}>
              Your dice
            </h3>
            <p className="text-xs text-[#6B7280]">Cosmetic only (no charge yet)</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(
                [
                  "standard",
                  "street",
                  "midnight",
                  "gold",
                  "blood",
                  "fire",
                  "diamond",
                ] as const
              ).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setMyDiceType(t);
                    setDiceModal(false);
                  }}
                  className="min-h-[52px] rounded border p-1 text-left text-xs capitalize"
                  style={{
                    borderColor: myDiceType === t ? "#F5C842" : "rgba(255,255,255,0.1)",
                    color: myDiceType === t ? "#F5C842" : "#9CA3AF",
                  }}
                >
                  <DiceFace value={6} diceType={t} size={32} />
                  {t}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDiceModal(false)}
              className="mt-3 w-full min-h-[44px] font-bold"
              style={{
                background: "linear-gradient(135deg, #F5C842, #D4A017)",
                color: "#0A0A0A",
                borderRadius: 8,
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
