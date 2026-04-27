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
  CELO_IDLE_DICE,
  clampDie,
  computeCeloVisualDiceMode,
  resolveCeloFeltDice,
  shouldClobberFeltTripletOnFetch,
  tripletFromDiceJson,
} from "@/lib/celo-room-dice";
import DiceFace, { type DiceType, type TumbleVariant } from "@/components/celo/DiceFace";
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

const CELO_DEBUG = process.env.NODE_ENV === "development";

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
  banker_id: string;
  max_players: number;
  current_bank_sc: number | null;
  current_bank_cents: number | null;
  minimum_entry_sc: number | null;
  min_bet_cents: number | null;
  last_round_was_celo: boolean;
  banker_celo_at: string | null;
  total_rounds: number;
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
  /** Set when the banker has rolled; source of truth for their dice in this round. */
  banker_dice?: unknown;
  banker_dice_result?: string | null;
  banker_roll_in_flight?: boolean | null;
};

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
  const [dice, setDice] = useState<[number, number, number] | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rollingAction, setRollingAction] = useState(false);
  const [connection, setConnection] = useState<"connecting" | "live" | "offline">("connecting");
  const [myDiceType, setMyDiceType] = useState<DiceType>("standard");
  const [diceModal, setDiceModal] = useState(false);
  const [showLower, setShowLower] = useState(false);
  const [showBanker, setShowBanker] = useState(false);
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
  /** Current seat has a final win/loss row this round (server); drives player-phase tumble for all clients. */
  const [currentPlayerResolvedRoll, setCurrentPlayerResolvedRoll] = useState(false);
  const [lowerBankError, setLowerBankError] = useState<string | null>(null);
  const [bankerAcceptError, setBankerAcceptError] = useState<string | null>(null);
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
  const diceRef = useRef<[number, number, number] | null>(null);
  const feltTiedToRoundIdRef = useRef<string | null>(null);
  const ROLL_ANIM_MIN_MS = 1800;
  const ROLL_HARD_TIMEOUT_MS = 8000;

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
    } else {
      const body = (await stateRes.json()) as {
        room?: Record<string, unknown>;
        players?: unknown[];
        activeRound?: Record<string, unknown> | null;
      };
      if (body.room) {
        incomingRoom = body.room;
        roomForLog = body.room as unknown as Room;
      }
      playerRows = ((body.players ?? []) as unknown[]).map(
        (row) => normalizeCeloPlayerRow(row) as Player
      );
      activeRound =
        body.activeRound == null
          ? null
          : (body.activeRound as unknown as Round);
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
          .in("outcome", ["win", "loss"])
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
      const { data: lastPr } = await supabase
        .from("celo_player_rolls")
        .select("dice")
        .eq("round_id", activeRound.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (isStaleFetch()) {
        console.log("[C-Lo] skipping stale fetch");
        return;
      }
      const rRow = activeRound as Round;
      const t = resolveCeloFeltDice(lastPr?.dice, rRow.banker_dice);
      let applyTriplet = t;
      if (activeRound.status === "player_rolling" && !hasCurrentPlayerFinal) {
        applyTriplet = null;
      }
      const serverHasBankerTriplet = !!tripletFromDiceJson(
        (activeRound as Round).banker_dice
      );
      if (applyTriplet) {
        setDice(applyTriplet);
        feltTiedToRoundIdRef.current = null;
      } else {
        const clobber = shouldClobberFeltTripletOnFetch({
          rollingActionInProgress: rollingActionRef.current,
          activeStatus: activeRound.status,
          serverHasBankerTriplet,
          hasPlayerFinalWinLoss: hasCurrentPlayerFinal,
          hasLocalFeltTriplet: tripletFromDiceJson(diceRef.current) != null,
          localFeltTiedToThisRound: feltTiedToRoundIdRef.current === activeRound.id,
        });
        if (clobber) {
          setDice(null);
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
    } else if (!activeRound && !rollingActionRef.current) {
      if (isStaleFetch()) {
        console.log("[C-Lo] skipping stale fetch");
        return;
      }
      setDice(null);
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
  }, [supabase, roomId, commitCeloAggregateMerge, me]);

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
                setDice(null);
              }
              if (
                n.banker_dice != null &&
                (p.eventType === "UPDATE" || p.eventType === "INSERT") &&
                n.banker_roll_in_flight !== true
              ) {
                const trip = tripletFromDiceJson(n.banker_dice);
                if (trip) setDice(trip);
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
          const n = (payload as { new: { dice?: unknown; outcome?: string } | null }).new;
          if (CELO_DEBUG) {
            console.log("[C-Lo room] realtime celo_player_rolls", et, n ?? (payload as { old?: unknown }).old);
            console.log("[C-Lo room] dice sync: player_rolls event → merge triplet if present");
          }
          if ((et === "INSERT" || et === "UPDATE") && n?.dice) {
            const t = tripletFromDiceJson(n.dice);
            if (t) {
              setDice(t);
              if (n.outcome === "win" || n.outcome === "loss") {
                setCurrentPlayerResolvedRoll(true);
              }
              if (rollingRef.current) {
                setRolling(false);
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
  }, [supabase, roomId, fetchAll, refreshRoomPlayers, commitCeloAggregateMerge]);

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
            const trip = tripletFromDiceJson(n.banker_dice);
            if (trip) setDice(trip);
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
  }, [supabase, round?.id]);

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
  /**
   * Some realtime room patches may briefly omit banker_id, so derive banker user id
   * from seated rows as a fallback to keep banker gating/status correct.
   */
  const bankerUserIdResolved =
    room?.banker_id ??
    players.find((p) => String(p.role ?? "").toLowerCase() === "banker")?.user_id ??
    null;
  const myRoleLc = String(myRow?.role ?? "").toLowerCase();
  const isBanker =
    myRoleLc === "banker" ||
    (me != null &&
      normalizeCeloUserId(me) === normalizeCeloUserId(bankerUserIdResolved));
  const isPlayer = myRoleLc === "player";
  const isSpec = myRoleLc === "spectator";
  const minE = room ? minVal(room) : 1000;
  useEffect(() => {
    if (room) {
      const m = minVal(room);
      setEntryAmount((e) => (e < m ? m : e));
    }
  }, [room]);

  const prize = round?.prize_pool_sc ?? 0;
  const inProgress = !!(
    round &&
    ["banker_rolling", "player_rolling", "betting"].includes(round.status)
  );
  const roomStatusLc = String(room?.status ?? "").toLowerCase();
  const roundHasBankerTriplet = !!tripletFromDiceJson(round?.banker_dice);
  const feltTripletPresent = dice != null;

  const bankerRollInFlight = round?.banker_roll_in_flight === true;

  const visualDiceMode = useMemo(
    () =>
      computeCeloVisualDiceMode({
        inProgress,
        roundStatus: round?.status,
        roundHasBankerTriplet,
        feltTripletPresent,
        currentPlayerHasFinalRoll: currentPlayerResolvedRoll,
        localRolling: rolling,
      }),
    [
      inProgress,
      round?.status,
      roundHasBankerTriplet,
      feltTripletPresent,
      currentPlayerResolvedRoll,
      rolling,
    ]
  );

  useEffect(() => {
    console.log("[C-Lo] state", {
      isRolling: rolling,
      dice,
      bankerDice: round?.banker_dice,
      roundId: round?.id,
      mode: visualDiceMode,
    });
  }, [rolling, dice, round?.banker_dice, round?.id, visualDiceMode]);

  /** Tumble animation: waiting on banker write, waiting on current player final, or local roll window. */
  const isRollingFaces =
    visualDiceMode === "banker_tumble" || visualDiceMode === "player_tumble";

  const showIdleDice = !inProgress && !rolling;
  const facePips: [number, number, number] = isRollingFaces
    ? CELO_IDLE_DICE
    : dice
      ? [clampDie(dice[0]), clampDie(dice[1]), clampDie(dice[2])]
      : CELO_IDLE_DICE;
  const stakedPlayerCount = useMemo(() => {
    const n = players.filter((p) => {
      const bankerRow =
        p.is_banker === true ||
        (bankerUserIdResolved != null &&
          normalizeCeloUserId(p.user_id) ===
            normalizeCeloUserId(bankerUserIdResolved));
      if (bankerRow) return false;
      return (
        p.entry_posted === true && Number(p.stake_amount_sc || 0) > 0
      );
    }).length;
    return n;
  }, [players, bankerUserIdResolved]);

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

  const CELO_TUMBLE: { variant: TumbleVariant; durationSec: number }[] = [
    { variant: "a", durationSec: 1.65 },
    { variant: "b", durationSec: 1.8 },
    { variant: "c", durationSec: 1.95 },
  ];

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

  const myEntryScRaw = Math.max(
    Math.floor(Number(myRow?.stake_amount_sc ?? 0)),
    Math.floor(Number(myRow?.entry_sc ?? 0))
  );
  const myEntrySc = Number.isFinite(myEntryScRaw) ? myEntryScRaw : 0;

  const tableStatusText = (() => {
    if (!uiReady) return "Loading table…";
    if (!room) return roomFetchError ? "Could not load room" : "Loading…";
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
        ? "Waiting for players to post entries…"
        : "When ready, start the round to open the felt.";
    }
    if (roomStatusLc === "waiting" && isBanker && seatedPlayerCount < 1) {
      return "No players seated yet. Players can post entries when seated.";
    }
    if (
      (roomStatusLc === "entry_phase" || roomStatusLc === "active") &&
      !isBanker &&
      isPlayer &&
      myEntrySc === 0
    ) {
      return "Post your entry to join this round’s pot.";
    }
    if (roomStatusLc === "entry_phase" && !isBanker && isPlayer && myEntrySc > 0) {
      return "Entry posted. Waiting for the banker to start the round…";
    }
    if (
      (roomStatusLc === "waiting" || roomStatusLc === "active") &&
      !isBanker &&
      isPlayer &&
      myEntrySc > 0
    ) {
      return "Entry posted. Waiting for the banker to start the round…";
    }
    if (roomStatusLc === "waiting" && !isBanker) {
      return "Waiting for the banker to start the round…";
    }
    if (isBanker) return "Start the round when at least one player has posted an entry.";
    return "Waiting for banker";
  })();

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
  const postEntryBalanceOk = !(myBalance > 0 && entryAmount > myBalance);
  const postEntryNotYetPosted =
    myRow != null && myRow.entry_posted !== true && myEntrySc <= 0;
  const canPostEntry =
    !!room &&
    !!me &&
    !isBanker &&
    isPlayer &&
    !inProgress &&
    postEntryRoomOk &&
    entryAmount > 0 &&
    Number.isFinite(entryAmount) &&
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
      bankerUserIdResolved,
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
    bankerUserIdResolved,
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
  const startableRoomStatuses = ["waiting", "active", "entry_phase"];
  const showStartRound =
    !!room &&
    isBanker &&
    !inProgress &&
    startableRoomStatuses.includes(roomPhase);
  const canStartRound =
    showStartRound && stakedPlayerCount >= 1 && !rollingAction;
  const startRoundDisabledReason = (() => {
    if (!showStartRound) return null;
    if (rollingAction) return "round_action_in_progress";
    if (stakedPlayerCount < 1) return "no_posted_entries";
    return null;
  })();

  const feltIdleLabel = (() => {
    if (roomPhase === "rolling" && !round) {
      return "SYNCING ROUND…";
    }
    if (
      roomPhase === "waiting" ||
      roomPhase === "entry_phase" ||
      roomPhase === "active"
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
    setCurrentPlayerResolvedRoll(false);
    feltTiedToRoundIdRef.current = null;
  }, [round?.id]);

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
    round?.status === "banker_rolling" && isBanker
      ? !canRollBanker && !CELO_DEBUG
      : rollingAction;

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

  async function handleStart() {
    if (!room || !canStartRound) return;
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
    setRollingAction(true);
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
      setRollingAction(false);
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
      console.error("[C-Lo] roll: aborting fetch (hard 8s)", {
        roomId: room.id,
        roundId: round.id,
      });
      ac.abort();
    }, ROLL_HARD_TIMEOUT_MS);
    type RollJson = {
      error?: string;
      dice?: number[];
      rollName?: string;
      outcome?: string;
      canLowerBank?: boolean;
      player_can_become_banker?: boolean;
      newBalance?: number;
      newBank?: number;
      room?: Record<string, unknown>;
      currentRound?: Record<string, unknown>;
    };
    rollWatchdogRef.current = setTimeout(() => {
      rollWatchdogRef.current = null;
      if (!rollingRef.current) return;
      console.warn("[C-Lo] watchdog fired (rolling still true after 8s cap)");
      console.error("[C-Lo] roll: watchdog — rolling still true after 8s", {
        roomId: room.id,
        roundId: round.id,
      });
      setRollError("Roll timed out — please retry");
      setRolling(false);
      setRollingAction(false);
      void fetchAll();
    }, ROLL_HARD_TIMEOUT_MS);
    setRollingAction(true);
    setRolling(true);
    setRollName(null);
    setDice(null);
    let sawOkResponse = false;
    const rollUrl = "/api/celo/round/roll";
    try {
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
      if (j.dice?.length === 3) {
        setDice([j.dice[0], j.dice[1], j.dice[2]]);
        feltTiedToRoundIdRef.current = round.id;
      } else {
        console.error("[C-Lo] roll: ok but missing j.dice (expected 3)", { j, roundId: round.id });
      }
      setRolling(false);
      if (j.rollName) {
        setTimeout(() => setRollName(j.rollName ?? null), 300);
      }
      setRollError(null);
      if (typeof j.newBalance === "number") setMyBalance(j.newBalance);
      if (j.canLowerBank) setShowLower(true);
      if (j.player_can_become_banker) {
        setBankerAcceptError(null);
        setShowBanker(true);
      }
      const rollRoomFromApi =
        j.room && String((j.room as { id?: string }).id ?? "") === room.id
          ? j.room
          : undefined;
      const rollRoomPatch: Record<string, unknown> | undefined = (() => {
        if (rollRoomFromApi) return { ...rollRoomFromApi };
        if (typeof j.newBank === "number") {
          return { current_bank_sc: j.newBank };
        }
        return undefined;
      })();
      const rollRoundPatch: Record<string, unknown> | undefined =
        j.currentRound && String((j.currentRound as { id?: string }).id ?? round.id) === round.id
          ? j.currentRound
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
      setTimeout(() => setRollName(null), 2800);
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
      bankerUserIdResolved,
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
    setJoinHint(null);
    postEntryInFlightRef.current = true;
    setJoinSubmitting(true);
    const postEntryUrl = "/api/celo/post-entry";
    try {
      const postBody = JSON.stringify({ roomId: room.id, amount: entryAmount });
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

  const feltW = "min(100%, 28rem)";
  const feltH = "min(100%, max(13.5rem, 75vw))";

  const gamePanelClass =
    "relative flex min-h-0 w-full min-w-0 max-w-3xl flex-1 flex-col self-center overflow-hidden rounded-2xl border border-amber-400/20 bg-gradient-to-b from-[#0f0a1c] via-[#0a0514] to-[#040208] p-3 shadow-[0_0_0_1px_rgba(245,200,66,0.12),0_4px_40px_rgba(120,50,200,0.12),0_24px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-5 md:p-6 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:opacity-40 before:shadow-[inset_0_0_60px_rgba(245,200,66,0.06),inset_0_-40px_80px_rgba(0,0,0,0.45)]";
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
                    String(room.banker_id) === p.user_id || p.role === "banker";
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
        {roomFetchError && (
          <div className="mt-2 rounded-lg border border-red-500/30 bg-red-950/50 px-3 py-2 text-center text-xs text-red-200">
            {roomFetchError}
          </div>
        )}
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col gap-3 px-4 pb-3 md:gap-5 md:px-6 md:pb-6">
        <div
          className="grid min-h-0 w-full min-w-0 flex-1 grid-cols-1 place-items-stretch content-stretch gap-4 sm:gap-5 md:min-h-0 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:items-start md:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-6"
        >
          <main className="relative z-0 order-1 flex min-w-0 flex-col md:order-none">
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
                  {isBanker && room?.last_round_was_celo && (
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

              <p className="relative z-10 mx-auto mb-3 max-w-md text-center text-xs leading-relaxed text-zinc-300/95 md:mb-4 md:text-sm">
                {tableStatusText}
              </p>

              <div className="relative z-10 flex flex-1 flex-col items-center justify-center py-1 md:min-h-[12rem] md:py-4">
                <div
                  className="pointer-events-none absolute -inset-6 -z-10 opacity-90 md:-inset-8"
                  style={{
                    background:
                      "radial-gradient(52% 48% at 50% 40%, rgba(255,235,180,0.22) 0%, rgba(245,200,66,0.12) 28%, rgba(80,30,120,0.08) 45%, transparent 72%)",
                  }}
                  aria-hidden
                />
                <div
                  className="relative w-full max-w-[280px] md:max-w-[480px]"
                  style={{
                    width: feltW,
                    height: feltH,
                    minHeight: "12rem",
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
                    {[0, 1, 2].map((i) => (
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
                    ))}
                  </div>
                  <RollNameDisplay rollName={rollName} onComplete={() => setRollName(null)} />
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

              <div className="mt-auto w-full max-w-3xl border-t border-white/5 pt-4">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 items-center justify-center gap-2 rounded-lg border border-amber-400/10 bg-black/25 px-3 py-2 sm:max-w-[7.5rem] sm:flex-col sm:items-start sm:py-3">
                    <span className="font-mono text-[9px] uppercase text-zinc-500">Your balance</span>
                    <span className="font-mono text-sm font-bold text-amber-200">{myBalance.toLocaleString()} GPC</span>
                    <span className="hidden text-[9px] text-zinc-500 sm:inline">{gpcToUsdDisplay(myBalance)}</span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    {canRoll && (
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
                    {showStartRound && isBanker && !canRoll && (
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
                              : "Start round"}
                        </button>
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
                        <p className="text-center text-sm text-amber-200/90">
                          Your entry: {myEntrySc.toLocaleString()} GPC posted. Waiting for the banker
                          to start the round…
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
                        <div className="mx-auto flex w-full max-w-md flex-col gap-2">
                          {joinHint && (
                            <p className="text-center text-xs leading-snug text-amber-200/80">{joinHint}</p>
                          )}
                          <div className="flex flex-wrap justify-center gap-1.5">
                            {[minE, minE * 2, minE * 5, 2500, bankVal(room)]
                              .filter((x, i, a) => x > 0 && a.indexOf(x) === i)
                              .sort((a, b) => a - b)
                              .map((amt) => (
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
                                  {amt}
                                </button>
                              ))}
                          </div>
                          <button
                            type="button"
                            disabled={joinSubmitting}
                            aria-disabled={joinSubmitting || !canPostEntry}
                            aria-busy={joinSubmitting}
                            onClick={() => {
                              void handlePostEntry();
                            }}
                            className="w-full min-h-[48px] rounded-xl font-bold text-zinc-950 touch-manipulation"
                            style={{
                              background: "linear-gradient(135deg, #F5C842, #B8860B)",
                              opacity: joinSubmitting || !canPostEntry ? 0.45 : 1,
                              cursor:
                                joinSubmitting || !canPostEntry ? "not-allowed" : "pointer",
                            }}
                          >
                            {joinSubmitting
                              ? "Posting…"
                              : `Post entry — ${entryAmount} GPC`}
                          </button>
                        </div>
                      )}
                    {isSpec && (
                      <p className="text-center text-sm text-zinc-400/95">You’re spectating this table.</p>
                    )}
                  </div>
                  <div className="flex justify-center sm:flex-col sm:items-center sm:justify-start">
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
      <div className="mx-auto mt-5 w-full max-w-[1500px] px-4 pb-2 md:mt-0 md:hidden md:px-6">
      <div
        className="grid h-11 w-full min-w-0 shrink-0 rounded-t-xl border border-b-0 border-amber-400/10 text-xs"
        style={{
          background: "rgba(5,1,15,0.9)",
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
        className="shrink-0 overflow-hidden rounded-b-xl border border-t-0 border-amber-400/10 transition-[height] duration-200 ease-out md:hidden"
        style={{
          background: "rgba(8,5,15,0.98)",
          height: panelOpen ? "min(44vh, 320px)" : 0,
        }}
      >
        <CeloRoomChatPanel
          className="h-full min-h-0"
          minHeightStyle={{ minHeight: "min(42vh, 300px)" }}
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
      {showBanker && room && (
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
              Take the bank?
            </p>
            {bankerAcceptError && (
              <p className="mt-2 text-sm text-red-300/95">{bankerAcceptError}</p>
            )}
            <p className="mt-1 text-sm text-[#9CA3AF]">
              Cover {bankVal(room).toLocaleString()} GPC
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  setBankerAcceptError(null);
                  if (!supabase) {
                    setBankerAcceptError("Connect to the app to take the bank.");
                    return;
                  }
                  const res = await fetchCeloApi(supabase, "/api/celo/banker/accept", {
                    method: "POST",
                    body: JSON.stringify({
                      room_id: room.id,
                      round_id: round?.id,
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
                }}
              >
                Become banker
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
