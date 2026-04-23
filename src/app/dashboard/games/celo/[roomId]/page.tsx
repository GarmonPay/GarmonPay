"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  tripletFromDiceJson,
} from "@/lib/celo-room-dice";
import DiceFace, { type DiceType } from "@/components/celo/DiceFace";
import RollNameDisplay from "@/components/celo/RollNameDisplay";
import { CeloRoomChatPanel } from "@/components/celo/CeloRoomChatPanel";
import {
  CeloRoomSideBetsPanel,
  type CeloSideBetRow,
} from "@/components/celo/CeloRoomSideBetsPanel";
import {
  countStakedEntryPlayers,
  mergeCeloPlayerRealtime,
  normalizeCeloPlayerRow,
} from "@/lib/celo-player-state";
import { alertCeloUnauthorized, fetchCeloApi } from "@/lib/celo-api-fetch";

const CELO_DEBUG = process.env.NODE_ENV === "development";

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

type Player = {
  id: string;
  user_id: string;
  role: string;
  entry_sc: number;
  bet_cents: number;
  seat_number: number | null;
  dice_type: string;
};

type Round = {
  id: string;
  room_id: string;
  round_number: number;
  status: string;
  prize_pool_sc: number | null;
  banker_point: number | null;
  current_player_seat: number | null;
  player_celo_offer: boolean;
  player_celo_expires_at: string | null;
  /** Set when the banker has rolled; source of truth for their dice in this round. */
  banker_dice?: unknown;
  banker_dice_result?: string | null;
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
  const [sideTab, setSideTab] = useState<"side" | "chat">("side");
  const [panelOpen, setPanelOpen] = useState(true);
  const [chat, setChat] = useState("");
  const [messages, setMessages] = useState<
    { id: string; user_id: string; message: string; created_at: string }[]
  >([]);
  const [sideBets, setSideBets] = useState<CeloSideBetRow[]>([]);
  const [sideBetsLoading, setSideBetsLoading] = useState(false);
  const [roomFetchError, setRoomFetchError] = useState<string | null>(null);
  const [startRoundError, setStartRoundError] = useState<string | null>(null);
  const [uiReady, setUiReady] = useState(false);
  /** At least one full `fetchAll` has applied; avoids stale copy before players load. */
  const [playersSnapshotReady, setPlayersSnapshotReady] = useState(false);
  const [diceSize, setDiceSize] = useState(60);
  const [joinHint, setJoinHint] = useState<string | null>(null);
  const [rollError, setRollError] = useState<string | null>(null);
  /** Current seat has a final win/loss row this round (server); drives player-phase tumble for all clients. */
  const [currentPlayerResolvedRoll, setCurrentPlayerResolvedRoll] = useState(false);
  const [lowerBankError, setLowerBankError] = useState<string | null>(null);
  const [bankerAcceptError, setBankerAcceptError] = useState<string | null>(null);
  const rollingRef = useRef(false);
  const rollingActionRef = useRef(false);
  const fetchTokenRef = useRef(0);

  useEffect(() => {
    rollingRef.current = rolling;
  }, [rolling]);
  useEffect(() => {
    rollingActionRef.current = rollingAction;
  }, [rollingAction]);

  const fetchAll = useCallback(async () => {
    if (!supabase || !roomId) return;
    const myToken = ++fetchTokenRef.current;
    setSideBetsLoading(true);
    setRoomFetchError(null);
    const [
      roomRes,
      playersRes,
      roundsRes,
      chatRes,
      sideRes,
    ] = await Promise.all([
      supabase.from("celo_rooms").select("*").eq("id", roomId).maybeSingle(),
      supabase
        .from("celo_room_players")
        .select("*")
        .eq("room_id", roomId)
        .order("seat_number", { ascending: true }),
      supabase
        .from("celo_rounds")
        .select("*")
        .eq("room_id", roomId)
        .in("status", ["banker_rolling", "player_rolling", "betting"])
        .order("round_number", { ascending: false })
        .limit(1),
      supabase
        .from("celo_chat")
        .select("id, user_id, message, created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(50),
      supabase
        .from("celo_side_bets")
        .select(
          "id, bet_type, amount_cents, status, odds_multiplier, creator_id, acceptor_id, created_at, expires_at"
        )
        .eq("room_id", roomId)
        .in("status", ["open", "matched", "locked"])
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    if (myToken !== fetchTokenRef.current) return;

    setSideBetsLoading(false);

    if (roomRes.error) {
      setRoomFetchError(roomRes.error.message);
    }
    if (roomRes.data) setRoom(roomRes.data as Room);
    else if (roomRes.error) setRoom(null);

    if (myToken !== fetchTokenRef.current) return;

    const playerRows: Player[] = ((playersRes.data ?? []) as unknown[]).map(
      (row) => normalizeCeloPlayerRow(row) as Player
    );
    setPlayers(playerRows);
    if (playersRes.error && CELO_DEBUG) console.warn("[C-Lo room] players", playersRes.error);

    const ar = (roundsRes.data as Round[] | null) ?? [];
    const activeRound = ar[0] ?? null;
    setRound(activeRound);
    if (roundsRes.error && CELO_DEBUG) console.warn("[C-Lo room] rounds", roundsRes.error);

    if (myToken !== fetchTokenRef.current) return;

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
        if (myToken !== fetchTokenRef.current) return;
        hasCurrentPlayerFinal = !!prRow;
      }
    }
    if (myToken === fetchTokenRef.current) {
      setCurrentPlayerResolvedRoll(hasCurrentPlayerFinal);
    }

    setMessages(
      (chatRes.data as { id: string; user_id: string; message: string; created_at: string }[]) ?? []
    );
    if (chatRes.error && CELO_DEBUG) console.warn("[C-Lo room] chat", chatRes.error);

    setSideBets((sideRes.data as CeloSideBetRow[]) ?? []);
    if (sideRes.error && CELO_DEBUG) console.warn("[C-Lo room] side bets", sideRes.error);

    if (activeRound?.id && !rollingRef.current) {
      const { data: lastPr } = await supabase
        .from("celo_player_rolls")
        .select("dice")
        .eq("round_id", activeRound.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (myToken !== fetchTokenRef.current) return;
      const rRow = activeRound as Round;
      const t = resolveCeloFeltDice(lastPr?.dice, rRow.banker_dice);
      let applyTriplet = t;
      if (activeRound.status === "player_rolling" && !hasCurrentPlayerFinal) {
        applyTriplet = null;
      }
      if (applyTriplet) {
        setDice(applyTriplet);
      } else if (!rollingActionRef.current) {
        setDice(null);
      }
    } else if (!activeRound && !rollingActionRef.current) {
      if (myToken === fetchTokenRef.current) {
        setDice(null);
      }
    }

    if (myToken === fetchTokenRef.current) {
      setPlayersSnapshotReady(true);
    }

    if (CELO_DEBUG) {
      console.log("[C-Lo room] sync", {
        roomId,
        room: roomRes.data,
        activeRound: activeRound?.id,
        players: playerRows.length,
        sideBets: sideRes.data?.length,
        staked: countStakedEntryPlayers(playerRows),
        diceComponent: "mounted",
        chatMounted: true,
        sideBetsMounted: true,
        fetchToken: myToken,
      });
    }
  }, [supabase, roomId]);

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
    if (!supabase || !roomId) return;
    const ch = supabase
      .channel(`celo_room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_rooms", filter: `id=eq.${roomId}` },
        () => void fetchAll()
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
          if (CELO_DEBUG) {
            const p = payload as { eventType?: string; new?: unknown; old?: unknown };
            console.log("[C-Lo room] realtime celo_room_players", p.eventType, p.new ?? p.old);
          }
          setPlayers((prev) => {
            const m = mergeCeloPlayerRealtime(
              prev,
              {
                eventType: (payload as { eventType: string }).eventType,
                new: (payload as { new: Record<string, unknown> | null }).new,
                old: (payload as { old: Record<string, unknown> | null }).old,
              },
              roomId
            );
            return m as Player[];
          });
          setPlayersSnapshotReady(true);
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
          const p = payload as {
            eventType?: string;
            new?: Record<string, unknown> | null;
            old?: Record<string, unknown> | null;
          };
          if (CELO_DEBUG) {
            console.log("[C-Lo room] realtime celo_rounds", p.eventType, p.new);
          }
          const n = p.new as Partial<Round> | null | undefined;
          if (n?.id && typeof n.id === "string") {
            setRound((prev) => {
              if (!prev || prev.id !== n.id) return prev;
              return { ...prev, ...n } as Round;
            });
            if (n.status === "player_rolling") {
              setCurrentPlayerResolvedRoll(false);
            }
            if (n.status === "banker_rolling" && n.banker_dice == null) {
              setDice(null);
            }
            if (
              n.status === "banker_rolling" &&
              n.banker_dice != null &&
              p.eventType === "UPDATE"
            ) {
              const trip = tripletFromDiceJson(n.banker_dice);
              if (trip) setDice(trip);
            }
          }
          void fetchAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_player_rolls", filter: `room_id=eq.${roomId}` },
        (payload) => {
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
            }
          }
          void fetchAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_side_bets", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const p = payload as unknown as {
            eventType: string;
            new?: CeloSideBetRow | null;
            old?: CeloSideBetRow | null;
          };
          if (CELO_DEBUG) {
            console.log("[C-Lo room] realtime celo_side_bets", p.eventType, p.new ?? p.old);
          }
          if (p.eventType === "INSERT" && p.new) {
            setSideBets((prev) => {
              if (prev.some((x) => x.id === p.new!.id)) return prev;
              return [p.new!, ...prev].slice(0, 40);
            });
          }
          if (p.eventType === "UPDATE" && p.new) {
            setSideBets((prev) =>
              prev.map((b) => (b.id === p.new!.id ? { ...b, ...p.new! } : b))
            );
          }
          void fetchAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_chat", filter: `room_id=eq.${roomId}` },
        () => void fetchAll()
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          setConnection("offline");
      });
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, roomId, fetchAll]);

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

  const myRow = players.find((p) => p.user_id === me);
  const isBanker = myRow?.role === "banker" || me === room?.banker_id;
  const isPlayer = myRow?.role === "player";
  const isSpec = myRow?.role === "spectator";
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
  const hasBankerTriplet = !!tripletFromDiceJson(round?.banker_dice);

  const visualDiceMode = useMemo(
    () =>
      computeCeloVisualDiceMode({
        inProgress,
        roundStatus: round?.status,
        hasBankerTriplet,
        currentPlayerHasFinalRoll: currentPlayerResolvedRoll,
        localRolling: rolling,
      }),
    [
      inProgress,
      round?.status,
      hasBankerTriplet,
      currentPlayerResolvedRoll,
      rolling,
    ]
  );

  /** Tumble animation: waiting on banker write, waiting on current player final, or local roll window. */
  const isRollingFaces =
    visualDiceMode === "banker_tumble" || visualDiceMode === "player_tumble";

  const showIdleDice = !inProgress && !rolling;
  const facePips: [number, number, number] = isRollingFaces
    ? CELO_IDLE_DICE
    : dice
      ? [clampDie(dice[0]), clampDie(dice[1]), clampDie(dice[2])]
      : CELO_IDLE_DICE;
  const stakedPlayerCount = useMemo(
    () => countStakedEntryPlayers(players),
    [players]
  );
  const spectators = useMemo(
    () => players.filter((p) => p.role === "spectator").length,
    [players]
  );
  const seatedAtTable = useMemo(
    () => players.filter((p) => p.role !== "spectator").length,
    [players]
  );

  const tableStatusText = (() => {
    if (!uiReady) return "Loading table…";
    if (!room) return roomFetchError ? "Could not load room" : "Loading…";
    if (inProgress && round) {
      if (round.status === "banker_rolling") return "Banker's roll";
      if (round.status === "player_rolling") return "Player's roll";
      if (round.status === "betting") return "Betting / payouts";
    }
    if (isBanker && !inProgress && !playersSnapshotReady) {
      return "Syncing table…";
    }
    if (isBanker && stakedPlayerCount < 1) {
      return "Need at least one player with a posted entry to start";
    }
    if (isBanker) return "Start a round when ready";
    return "Waiting for banker";
  })();

  const myEntrySc = Math.floor(Number(myRow?.entry_sc ?? 0));
  const canRoll = !!(
    room &&
    round &&
    inProgress &&
    ((round.status === "banker_rolling" && isBanker) ||
      (round.status === "player_rolling" && isPlayer && myEntrySc > 0))
  );
  const mustStart = !!(room && isBanker && !inProgress);
  const canStartRound = mustStart && (stakedPlayerCount >= 1) && !rollingAction;
  const startRoundDisabledReason = (() => {
    if (!mustStart || !isBanker) return null;
    if (rollingAction) return "round_action_in_progress";
    if (stakedPlayerCount < 1) return "no_staked_non_banker_player";
    return null;
  })();

  useEffect(() => {
    if (!CELO_DEBUG) return;
    console.log("[C-Lo room] start eligibility (dev)", {
      roomId,
      players: players.length,
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
  }, [round?.id]);

  useEffect(() => {
    if (!CELO_DEBUG) return;
    const src =
      dice != null
        ? "felt_triplet_state"
        : round?.banker_dice
          ? "banker_dice_pending_merge"
          : "none";
    console.log("[C-Lo room] felt (dev)", {
      visualDiceMode,
      diceSourceLogged: src,
      hasDice: dice != null,
      isRollingFaces,
      localRolling: rolling,
      roundStatus: round?.status,
      currentPlayerResolvedRoll,
      hasBankerTriplet,
    });
  }, [
    visualDiceMode,
    dice,
    isRollingFaces,
    rolling,
    round?.status,
    round?.banker_dice,
    currentPlayerResolvedRoll,
    hasBankerTriplet,
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
    if (!room) return;
    if (!supabase) {
      setStartRoundError("Not connected. Please refresh and try again.");
      return;
    }
    setStartRoundError(null);
    if (CELO_DEBUG) {
      console.log("[C-Lo room] Start round click", { roomId: room.id, banker: room.banker_id, stakedPlayerCount });
    }
    setRollingAction(true);
    try {
      const res = await fetchCeloApi(supabase, "/api/celo/round/start", {
        method: "POST",
        body: JSON.stringify({ room_id: room.id }),
      });
      const text = await res.text();
      let j: { error?: string; round?: unknown } = {};
      try {
        j = text ? (JSON.parse(text) as { error?: string }) : {};
      } catch {
        setStartRoundError("Invalid response from server");
        if (CELO_DEBUG) console.error("[C-Lo room] Start round bad JSON", text);
        return;
      }
      if (CELO_DEBUG) console.log("[C-Lo room] Start round response", res.status, j);
      if (!res.ok) {
        if (res.status === 401) {
          setStartRoundError("Session expired. Please log in again.");
          return;
        }
        setStartRoundError(j.error ?? "Could not start round");
        return;
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
    if (!room || !round || rollingAction) return;
    if (!supabase) {
      setRollError("Please log in to roll.");
      return;
    }
    setRollError(null);
    setRollingAction(true);
    setRolling(true);
    setRollName(null);
    setDice(null);
    const wait = new Promise((r) => setTimeout(r, 2200));
    const [res] = await Promise.all([
      fetchCeloApi(supabase, "/api/celo/round/roll", {
        method: "POST",
        body: JSON.stringify({ room_id: room.id, round_id: round.id }),
      }),
      wait,
    ]);
    const j = (await res.json()) as {
      error?: string;
      dice?: number[];
      rollName?: string;
      outcome?: string;
      canLowerBank?: boolean;
      player_can_become_banker?: boolean;
      newBalance?: number;
    };
    if (!res.ok) {
      setRolling(false);
      if (res.status === 401) {
        setRollError("Session expired. Please log in again.");
      } else {
        setRollError(j.error ?? "Could not complete roll");
      }
      setRollingAction(false);
      return;
    }
    if (j.dice?.length === 3) {
      setDice([j.dice[0], j.dice[1], j.dice[2]]);
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
    await fetchAll();
    setTimeout(() => setRollName(null), 2800);
    setRollingAction(false);
  }

  async function handleJoin() {
    if (!room) return;
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
    const res = await fetchCeloApi(supabase, "/api/celo/room/join", {
      method: "POST",
      body: JSON.stringify({
        room_id: room.id,
        role: "player",
        entry_sc: entryAmount,
      }),
    });
    const j = (await res.json()) as { error?: string; already_seated?: boolean };
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
        await fetchAll();
        return;
      }
      setJoinHint(j.error ?? "Couldn’t post entry");
      return;
    }
    if (j.already_seated) {
      setJoinHint("You’re already seated — syncing the table…");
      await fetchAll();
      return;
    }
    setJoinHint(null);
    await fetchAll();
    if (typeof (j as { room?: { current_bank_sc?: number } }).room === "object") {
      setMyBalance((b) => b);
    }
  }

  const feltW = "min(100%, 32rem)";
  const feltH = "clamp(13.5rem, 34vw, 20rem)";

  const gamePanelClass =
    "relative flex min-h-0 w-full min-w-0 max-w-4xl flex-1 flex-col self-center overflow-hidden rounded-2xl border border-amber-400/20 bg-gradient-to-b from-[#0f0a1c] via-[#0a0514] to-[#040208] p-3 shadow-[0_0_0_1px_rgba(245,200,66,0.12),0_4px_40px_rgba(120,50,200,0.12),0_24px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-5 md:p-6 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:opacity-40 before:shadow-[inset_0_0_60px_rgba(245,200,66,0.06),inset_0_-40px_80px_rgba(0,0,0,0.45)]";
  const rightRailClass =
    "hidden min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden md:flex md:max-w-[20rem] md:shrink-0 md:self-stretch lg:max-w-[22rem]";

  return (
    <div
      className={`flex w-full min-w-0 max-w-full flex-col overflow-x-hidden text-white ${dm.className}`}
      style={{ background: "radial-gradient(120% 80% at 50% 0%, #1a0a2e 0%, #05010F 45%, #020108 100%)" }}
    >
      <div className="mx-auto w-full max-w-[1500px] shrink-0 px-4 pb-1 pt-2 sm:pt-3 md:px-6 md:pt-4">
        <header className="rounded-2xl border border-amber-400/10 bg-black/30 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-4">
          <div className="flex min-h-10 min-w-0 items-center gap-2">
            <Link
              href="/dashboard/games/celo"
              className="shrink-0 min-h-touch rounded-lg px-1.5 text-base text-amber-300/90 transition hover:text-amber-200 sm:px-2.5 sm:text-lg"
            >
              ←
            </Link>
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
              <div className="mb-3 grid w-full max-w-2xl grid-cols-2 gap-3 self-center border-b border-white/5 px-1 pb-4 sm:max-w-lg md:grid-cols-2 md:gap-6">
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
                  className="relative"
                  style={{
                    width: feltW,
                    height: feltH,
                    maxWidth: "32rem",
                    minHeight: "13rem",
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
                      filter: isRollingFaces ? "drop-shadow(0 6px 14px rgba(0,0,0,0.5))" : "drop-shadow(0 10px 22px rgba(0,0,0,0.55))",
                    }}
                  >
                    {[0, 1, 2].map((i) => (
                      <DiceFace
                        key={`${round?.id ?? "r"}-${visualDiceMode}-d${i}-${facePips[i]}-${isRollingFaces ? "t" : "s"}`}
                        value={facePips[i] as 1 | 2 | 3 | 4 | 5 | 6}
                        diceType={myDiceType}
                        size={diceSize}
                        rolling={isRollingFaces}
                        delay={[0, 120, 240][i]}
                      />
                    ))}
                  </div>
                  <RollNameDisplay rollName={rollName} onComplete={() => setRollName(null)} />
                </div>
                {showIdleDice && !isRollingFaces && (
                  <p className="mt-3 max-w-sm px-2 text-center font-mono text-[10px] uppercase tracking-widest text-amber-200/35">
                    Awaiting the next throw
                  </p>
                )}
                {isRollingFaces && (
                  <p className="mt-2.5 text-center font-mono text-[10px] text-amber-200/50">
                    Rolling…
                  </p>
                )}
              </div>

              <div className="mt-auto border-t border-white/5 pt-4">
                <p className="mb-2 text-center font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                  Action
                </p>
                <div className="mx-auto flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between sm:gap-4">
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
                          disabled={rollingAction}
                          onClick={() => void handleRoll()}
                          className={`w-full min-h-[48px] rounded-xl px-5 text-sm font-bold text-zinc-950 ${cinzel.className} block transition hover:opacity-95`}
                          style={{
                            background: "linear-gradient(135deg, #F5C842, #B8860B)",
                            boxShadow: "0 0 0 1px rgba(0,0,0,0.2), 0 10px 28px rgba(245,200,66,0.2)",
                            opacity: rollingAction ? 0.65 : 1,
                          }}
                        >
                          Roll dice
                        </button>
                      </div>
                    )}
                    {mustStart && isBanker && !canRoll && (
                      <div className="mx-auto flex w-full max-w-md flex-col gap-1.5">
                        <button
                          type="button"
                          disabled={!canStartRound}
                          onClick={() => void handleStart()}
                          className={`w-full min-h-[48px] rounded-xl text-sm font-bold text-zinc-950 ${cinzel.className} transition hover:opacity-95`}
                          style={{
                            background: "linear-gradient(135deg, #F5C842, #B8860B)",
                            boxShadow: "0 0 0 1px rgba(0,0,0,0.2), 0 10px 28px rgba(245,200,66,0.2)",
                            opacity: canStartRound ? 1 : 0.45,
                          }}
                        >
                          Start round
                        </button>
                        {stakedPlayerCount < 1 && playersSnapshotReady && (
                          <p className="px-1 text-center text-xs text-amber-100/80">
                            At least one player must post an entry before you can start.
                          </p>
                        )}
                        {stakedPlayerCount < 1 && !playersSnapshotReady && (
                          <p className="px-1 text-center text-xs text-zinc-500">Syncing players…</p>
                        )}
                        {startRoundError && <p className="px-1 text-center text-xs text-red-300">{startRoundError}</p>}
                      </div>
                    )}
                    {room && !inProgress && isPlayer && myEntrySc > 0 && (
                      <p className="text-center text-sm text-amber-200/90">
                        You’re seated. Entry: {myEntrySc.toLocaleString()} GPC. Waiting for the round to
                        start.
                      </p>
                    )}
                    {room && !inProgress && !isBanker && myEntrySc === 0 && !isSpec && (
                      <div className="mx-auto flex w-full max-w-md flex-col gap-2">
                        {joinHint && (
                          <p className="text-center text-xs leading-snug text-amber-200/80">{joinHint}</p>
                        )}
                        <div className="flex flex-wrap justify-center gap-1.5">
                          {[minE, minE * 2, minE * 5, bankVal(room)]
                            .filter((x, i, a) => x > 0 && a.indexOf(x) === i)
                            .map((amt) => (
                              <button
                                key={amt}
                                type="button"
                                onClick={() => {
                                  setJoinHint(null);
                                  setEntryAmount(amt);
                                }}
                                className="min-h-10 min-w-[3.5rem] rounded-lg border text-xs"
                                style={{
                                  borderColor: entryAmount === amt ? "rgba(245,200,66,0.7)" : "rgba(113,59,200,0.3)",
                                  background: entryAmount === amt ? "rgba(245,200,66,0.12)" : "rgba(0,0,0,0.2)",
                                  color: entryAmount === amt ? "#F5C842" : "#9CA3AF",
                                }}
                              >
                                {amt}
                              </button>
                            ))}
                        </div>
                        <button
                          type="button"
                          disabled={entryAmount > myBalance}
                          onClick={() => void handleJoin()}
                          className="w-full min-h-12 rounded-xl font-bold text-zinc-950"
                          style={{
                            background: "linear-gradient(135deg, #F5C842, #B8860B)",
                            borderRadius: 10,
                            opacity: entryAmount > myBalance ? 0.4 : 1,
                          }}
                        >
                          {!myRow ? "Join" : "Post"} {entryAmount} GPC
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
          </main>

          <aside className={`${rightRailClass} min-h-0`}>
            <div className="grid h-full w-full min-h-0 max-h-[min(100dvh,52rem)] grid-rows-[minmax(8rem,0.4fr)_minmax(0,1fr)] overflow-hidden rounded-2xl border border-amber-400/12 bg-[#08050f] p-0 shadow-lg md:max-h-none">
              <CeloRoomSideBetsPanel
                bets={sideBets}
                loading={sideBetsLoading}
                className="min-h-0 overflow-y-auto border-b-0"
                supabase={supabase}
                me={me}
                roomId={room?.id ?? roomId}
                roundId={round?.id ?? null}
                minAmount={room ? minE : 1000}
                onAfterMutate={() => void fetchAll()}
              />
              <CeloRoomChatPanel
                className="min-h-0 border-t border-amber-400/10"
                messages={messages}
                value={chat}
                onChange={setChat}
                onSend={async () => {
                  if (!supabase || !me || !room || !chat.trim()) return;
                  const { error } = await supabase.from("celo_chat").insert({
                    room_id: room.id,
                    user_id: me,
                    message: chat.trim().slice(0, 500),
                  });
                  if (!error) {
                    setChat("");
                    void fetchAll();
                  } else if (CELO_DEBUG) {
                    console.warn("[C-Lo room] chat send", error);
                  }
                }}
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
          gridTemplateColumns: "1fr 1fr",
        }}
      >
        <button
          type="button"
          onClick={() => {
            setSideTab("side");
            setPanelOpen((o) => !o || sideTab !== "side");
          }}
          className="min-h-touch font-mono"
          style={{
            borderBottom: sideTab === "side" && panelOpen ? "2px solid #F5C842" : "2px solid transparent",
            color: sideTab === "side" && panelOpen ? "#F5C842" : "#6B7280",
          }}
        >
          🎰 Side
        </button>
        <button
          type="button"
          onClick={() => {
            setSideTab("chat");
            setPanelOpen((o) => !o || sideTab !== "chat");
          }}
          className="min-h-touch font-mono"
          style={{
            borderBottom: sideTab === "chat" && panelOpen ? "2px solid #F5C842" : "2px solid transparent",
            color: sideTab === "chat" && panelOpen ? "#F5C842" : "#6B7280",
          }}
        >
          💬 Chat
        </button>
      </div>
      <div
        className="shrink-0 overflow-hidden rounded-b-xl border border-t-0 border-amber-400/10 transition-[height] duration-200 ease-out md:hidden"
        style={{
          background: "rgba(8,5,15,0.98)",
          height: panelOpen ? "min(44vh, 320px)" : 0,
        }}
      >
        {sideTab === "side" && (
          <CeloRoomSideBetsPanel
            className="h-full min-h-0"
            bets={sideBets}
            loading={sideBetsLoading}
            supabase={supabase}
            me={me}
            roomId={room?.id ?? roomId}
            roundId={round?.id ?? null}
            minAmount={room ? minE : 1000}
            onAfterMutate={() => void fetchAll()}
          />
        )}
        {sideTab === "chat" && (
          <CeloRoomChatPanel
            className="h-full"
            minHeightStyle={{ minHeight: "min(42vh, 300px)" }}
            messages={messages}
            value={chat}
            onChange={setChat}
            onSend={async () => {
              if (!supabase || !me || !room || !chat.trim()) return;
              const { error } = await supabase.from("celo_chat").insert({
                room_id: room.id,
                user_id: me,
                message: chat.trim().slice(0, 500),
              });
              if (!error) {
                setChat("");
                void fetchAll();
              }
            }}
            canSend={!!(supabase && me && room && chat.trim().length > 0)}
          />
        )}
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
