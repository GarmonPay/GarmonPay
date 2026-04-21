"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Cinzel_Decorative, DM_Sans } from "next/font/google";
import { createBrowserClient } from "@/lib/supabase";
import { useCoins } from "@/hooks/useCoins";
import { localeInt } from "@/lib/format-number";
import { deriveCeloUiPhase, getCurrentRollerUserId } from "@/lib/celo-room-ui";
import DiceFace from "@/components/celo/DiceFace";
import RollNameDisplay from "@/components/celo/RollNameDisplay";

const cinzel = Cinzel_Decorative({ weight: "400", subsets: ["latin"] });
const dmSans = DM_Sans({ subsets: ["latin"] });

const ROLL_ANIM_MS = 2500;
const API = "/api/celo";

const SIDE_ODDS: Record<string, number> = {
  celo: 8,
  shit: 8,
  hand_crack: 4.5,
  trips: 8,
  banker_wins: 1.8,
  player_wins: 1.8,
  specific_point: 6,
};

function betPredictionText(betType: string, specificPoint?: number | null): string {
  switch (betType) {
    case "celo":
      return "Next roll is C-LO";
    case "shit":
      return "Next roll is SHIT";
    case "hand_crack":
      return "Next roll is HAND CRACK";
    case "trips":
      return "Next roll is TRIPS";
    case "banker_wins":
      return "Banker wins round";
    case "player_wins":
      return "Players win round";
    case "specific_point":
      return specificPoint != null ? `Point ${specificPoint} wins` : "Specific point";
    default:
      return betType;
  }
}

type Room = Record<string, unknown> & {
  id: string;
  name?: string;
  banker_id?: string;
  status?: string;
  last_round_was_celo?: boolean;
  banker_celo_at?: string | null;
};
type Player = {
  user_id: string;
  role: string;
  seat_number: number | null;
  entry_sc: number | null;
};
type Round = {
  id: string;
  status: string;
  round_number: number;
  banker_id?: string | null;
  prize_pool_sc?: number;
  current_player_seat?: number | null;
  player_celo_offer?: boolean;
  player_celo_expires_at?: string | null;
  bank_covered?: boolean;
  roll_processing?: boolean;
  banker_dice?: unknown;
  banker_dice_name?: string | null;
  banker_dice_result?: string | null;
  banker_point?: number | null;
};

function clampDieNum(n: unknown): number {
  const v = Math.floor(Number(n));
  if (v >= 1 && v <= 6) return v;
  return 1;
}

function parseDiceTuple(raw: unknown): [number, number, number] | null {
  if (raw == null) return null;
  let arr: unknown[] | null = null;
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      if (Array.isArray(p)) arr = p;
    } catch {
      return null;
    }
  }
  if (!arr || arr.length < 3) return null;
  return [clampDieNum(arr[0]), clampDieNum(arr[1]), clampDieNum(arr[2])];
}

type SideBetRow = {
  id: string;
  room_id: string;
  round_id: string | null;
  creator_id: string;
  acceptor_id: string | null;
  bet_type: string;
  specific_point?: number | null;
  amount_cents: number;
  odds_multiplier: number;
  status: string;
  expires_at?: string | null;
  payout_cents?: number;
  winner_id?: string | null;
  settled_at?: string | null;
};

type ChatRow = {
  id: string;
  message: string;
  user_id: string;
  created_at: string;
  is_system?: boolean;
};

export default function CeloRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = typeof params?.roomId === "string" ? params.roomId : "";

  const supabase = useMemo(() => createBrowserClient(), []);
  const { gpayCoins, goldCoins, gpayTokens, formatGPC, refresh, applyServerGpayBalance } = useCoins();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});

  const [dice, setDice] = useState<[number, number, number] | null>(null);
  const [rollName, setRollName] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  /** Latest player roll in DB for current round (so spectators see player dice). */
  const [lastPlayerRoll, setLastPlayerRoll] = useState<{
    dice: [number, number, number];
    rollName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileMainTab, setMobileMainTab] = useState<"game" | "side" | "chat">("game");
  const [walletOpen, setWalletOpen] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [diceSize, setDiceSize] = useState(48);
  useEffect(() => {
    const u = () =>
      setDiceSize(
        Math.min(60, Math.max(40, Math.round(window.innerWidth * 0.1)))
      );
    u();
    window.addEventListener("resize", u);
    return () => window.removeEventListener("resize", u);
  }, []);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatRow[]>([]);

  const [joinEntry, setJoinEntry] = useState(500);
  const [busy, setBusy] = useState(false);

  const [showLowerBank, setShowLowerBank] = useState(false);
  const [lowerBankCountdown, setLowerBankCountdown] = useState(60);
  const [lowerBankSelected, setLowerBankSelected] = useState<number | null>(null);

  const [showBecomeBanker, setShowBecomeBanker] = useState(false);
  const [bankerCountdown, setBankerCountdown] = useState(30);
  const [bankerOfferExpiry, setBankerOfferExpiry] = useState<Date | null>(null);

  const [showCoverConfirm, setShowCoverConfirm] = useState(false);
  const [sideBets, setSideBets] = useState<SideBetRow[]>([]);
  const [sideBetType, setSideBetType] = useState<string>("celo");
  const [sideBetAmount, setSideBetAmount] = useState(100);
  const [sideBetPoint, setSideBetPoint] = useState(4);

  const minEntry = Math.floor(Number(room?.minimum_entry_sc ?? 500));
  const bank = Math.floor(Number(room?.current_bank_sc ?? 0));

  const loadAll = useCallback(async () => {
    if (!supabase || !roomId) return;
    const { data: r } = await supabase.from("celo_rooms").select("*").eq("id", roomId).maybeSingle();
    if (r) setRoom(r as Room);

    const { data: p } = await supabase.from("celo_room_players").select("*").eq("room_id", roomId);
    setPlayers((p ?? []) as Player[]);
    const roomRow = r as Room | null;

    const { data: rnd } = await supabase
      .from("celo_rounds")
      .select("*")
      .eq("room_id", roomId)
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const roundRow = rnd ? (rnd as Round) : null;
    setRound(roundRow);

    let playerRoll: { dice: [number, number, number]; rollName: string } | null = null;
    if (roundRow?.status === "player_rolling") {
      const { data: pr } = await supabase
        .from("celo_player_rolls")
        .select("dice, roll_name")
        .eq("round_id", roundRow.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const d = parseDiceTuple((pr as { dice?: unknown } | null)?.dice);
      if (d) {
        playerRoll = {
          dice: d,
          rollName: String((pr as { roll_name?: string | null }).roll_name ?? ""),
        };
      }
    }
    setLastPlayerRoll(playerRoll);

    const { data: ch } = await supabase
      .from("celo_chat")
      .select("id,message,user_id,created_at,is_system")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(50);
    setMessages(((ch ?? []) as ChatRow[]).reverse());

    const { data: sb } = await supabase
      .from("celo_side_bets")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(100);
    setSideBets((sb ?? []) as SideBetRow[]);

    const bankerUid = roomRow?.banker_id ? String(roomRow.banker_id) : "";
    const uids = Array.from(
      new Set([...(p ?? []).map((x) => (x as Player).user_id), bankerUid].filter(Boolean))
    );
    if (uids.length) {
      const { data: users } = await supabase.from("users").select("id,full_name,email").in("id", uids);
      const nm: Record<string, string> = {};
      for (const u of users ?? []) {
        const row = u as { id: string; full_name?: string | null; email?: string | null };
        nm[row.id] = row.full_name?.trim() || row.email?.split("@")[0] || "Player";
      }
      setDisplayNames(nm);
    }
  }, [supabase, roomId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) setUserId(session?.user?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !roomId) return;
    setIsLive(false);
    const ch = supabase
      .channel(`celo_room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "celo_rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.new && typeof payload.new === "object") {
            setRoom((prev) => ({ ...(prev ?? {}), ...(payload.new as Room) } as Room));
          }
          void loadAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_room_players", filter: `room_id=eq.${roomId}` },
        () => void loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_rounds", filter: `room_id=eq.${roomId}` },
        () => void loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_side_bets", filter: `room_id=eq.${roomId}` },
        () => void loadAll()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "celo_chat", filter: `room_id=eq.${roomId}` },
        () => void loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_player_rolls", filter: `room_id=eq.${roomId}` },
        () => void loadAll()
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });
    return () => {
      setIsLive(false);
      void supabase.removeChannel(ch);
    };
  }, [supabase, roomId, loadAll]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void loadAll();
    };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(() => void loadAll(), 16000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, [loadAll]);

  useEffect(() => {
    if (room?.status === "rolling" && !round) {
      const t = window.setTimeout(() => void loadAll(), 500);
      return () => window.clearTimeout(t);
    }
  }, [room?.status, round, loadAll]);

  const mePlayer = useMemo(
    () => (userId ? players.find((p) => p.user_id === userId) : undefined),
    [players, userId]
  );
  const isBanker = Boolean(userId && room && String(room.banker_id ?? "") === userId);
  const myRole = mePlayer?.role ?? "spectator";
  const myEntry = Math.floor(Number(mePlayer?.entry_sc ?? 0));
  const inRoom = Boolean(mePlayer);

  const lowerBankPills = useMemo(() => {
    const out: number[] = [];
    if (!room || minEntry <= 0 || bank <= minEntry) return out;
    for (let n = minEntry; n < bank && out.length < 6; n += minEntry) {
      out.push(n);
    }
    return out;
  }, [room, minEntry, bank]);

  useEffect(() => {
    if (showLowerBank && lowerBankPills.length > 0) {
      setLowerBankSelected((s) => (s == null ? lowerBankPills[0] : s));
    }
  }, [showLowerBank, lowerBankPills]);

  useEffect(() => {
    if (!room?.last_round_was_celo || !room.banker_celo_at || !isBanker) {
      setShowLowerBank(false);
      return;
    }
    const celoTime = new Date(String(room.banker_celo_at)).getTime();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - celoTime) / 1000;
      const remaining = Math.max(0, 60 - elapsed);
      setLowerBankCountdown(Math.ceil(remaining));
      if (remaining > 0) {
        setShowLowerBank(true);
      } else {
        setShowLowerBank(false);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [room?.last_round_was_celo, room?.banker_celo_at, isBanker]);

  useEffect(() => {
    if (!showBecomeBanker || !bankerOfferExpiry) return;
    const timer = setInterval(() => {
      const remaining = (bankerOfferExpiry.getTime() - Date.now()) / 1000;
      if (remaining <= 0) {
        setShowBecomeBanker(false);
        clearInterval(timer);
      } else {
        setBankerCountdown(Math.ceil(remaining));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [showBecomeBanker, bankerOfferExpiry]);

  async function handleJoin() {
    if (!userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/room/join`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId, role: "player", entry_sc: joinEntry }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.message === "string" ? j.message : "Join failed");
      if (typeof j.gpayCoins === "number") applyServerGpayBalance(j.gpayCoins);
      await loadAll();
      if (supabase) {
        const { data: uRow } = await supabase.from("users").select("full_name,email").eq("id", userId).maybeSingle();
        const u = uRow as { full_name?: string | null; email?: string | null } | null;
        const nm = u?.full_name?.trim() || u?.email?.split("@")[0] || "Player";
        await supabase.from("celo_chat").insert({
          room_id: roomId,
          user_id: userId,
          message: `👤 ${nm} joined the table`,
          is_system: true,
        });
      }
      await loadAll();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Join failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleStartRound() {
    if (!roomId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/round/start`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof j.message === "string"
            ? j.message
            : typeof (j as { error?: string }).error === "string"
              ? (j as { error: string }).error
              : "Could not start";
        if (process.env.NODE_ENV === "development") {
          console.warn("[celo] start round failed", res.status, j);
        }
        throw new Error(msg);
      }
      setDice(null);
      setRollName(null);
      if (j.round) setRound(j.round as Round);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function handleRoll() {
    if (!round || rolling || !roomId) return;
    setRolling(true);
    setError(null);
    setDice(null);
    setRollName(null);
    try {
      const [apiResult] = await Promise.all([
        fetch(`${API}/round/roll`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room_id: roomId, round_id: round.id }),
        }).then(async (r) => {
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(typeof j.message === "string" ? j.message : "Roll failed");
          return j as {
            dice?: number[];
            rollName?: string;
            gpayCoins?: number;
            player_can_become_banker?: boolean;
            room?: Room;
          };
        }),
        new Promise<void>((r) => setTimeout(r, ROLL_ANIM_MS)),
      ]);

      if (Array.isArray(apiResult.dice) && apiResult.dice.length === 3) {
        setDice([apiResult.dice[0], apiResult.dice[1], apiResult.dice[2]]);
      }
      await new Promise((r) => setTimeout(r, 400));
      if (apiResult.rollName) setRollName(apiResult.rollName);
      if (typeof apiResult.gpayCoins === "number") applyServerGpayBalance(apiResult.gpayCoins);
      if (apiResult.player_can_become_banker) {
        setBankerOfferExpiry(new Date(Date.now() + 30_000));
        setBankerCountdown(30);
        setShowBecomeBanker(true);
      }
      if (apiResult.room) setRoom(apiResult.room as Room);
      await new Promise((r) => setTimeout(r, 2200));
      setRollName(null);
      await loadAll();
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Roll failed";
      if (process.env.NODE_ENV === "development") {
        console.warn("[celo] roll failed", msg);
      }
      setError(msg);
    } finally {
      setRolling(false);
    }
  }

  async function sendChat() {
    if (!supabase || !userId || !chatInput.trim() || !roomId) return;
    const { error: sErr } = await supabase.from("celo_chat").insert({
      room_id: roomId,
      user_id: userId,
      message: chatInput.trim(),
      is_system: false,
    });
    if (!sErr) {
      setChatInput("");
      void loadAll();
    }
  }

  async function postSideBet() {
    if (!round?.id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        room_id: roomId,
        round_id: round.id,
        bet_type: sideBetType,
        amount_sc: sideBetAmount,
      };
      if (sideBetType === "specific_point") body.specific_point = sideBetPoint;
      const res = await fetch(`${API}/sidebet/create`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.message === "string" ? j.message : "Failed");
      if (typeof j.gpayCoins === "number") applyServerGpayBalance(j.gpayCoins);
      await loadAll();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Side entry failed");
    } finally {
      setBusy(false);
    }
  }

  async function takeSideBet(betId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/sidebet/accept`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet_id: betId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.message === "string" ? j.message : "Failed");
      if (typeof j.gpayCoins === "number") applyServerGpayBalance(j.gpayCoins);
      await loadAll();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Match failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSideBet(betId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/sidebet/cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet_id: betId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.message === "string" ? j.message : "Failed");
      if (typeof j.gpayCoins === "number") applyServerGpayBalance(j.gpayCoins);
      await loadAll();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmLowerBank(amount: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/room/lower-bank`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId, new_bank_sc: amount }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.message === "string" ? j.message : "Failed");
      if (j.room) setRoom(j.room as Room);
      setShowLowerBank(false);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lower bank failed");
    } finally {
      setBusy(false);
    }
  }

  async function acceptBanker() {
    if (!round?.id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/banker/accept`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId, round_id: round.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.message === "string" ? j.message : "Failed");
      if (typeof j.gpayCoins === "number") applyServerGpayBalance(j.gpayCoins);
      const nm = displayNames[userId ?? ""] || "Player";
      await supabase?.from("celo_chat").insert({
        room_id: roomId,
        user_id: userId ?? "",
        message: `👑 ${nm} is now the Banker`,
        is_system: true,
      });
      setShowBecomeBanker(false);
      await loadAll();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not become banker");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCoverBank() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/room/cover-bank`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.message === "string" ? j.message : "Failed");
      if (typeof j.gpayCoins === "number") applyServerGpayBalance(j.gpayCoins);
      if (j.round) setRound(j.round as Round);
      setShowCoverConfirm(false);
      await loadAll();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cover failed");
    } finally {
      setBusy(false);
    }
  }

  const roundOpen = Boolean(round && round.status !== "completed");
  const totalPlayerEntry = useMemo(
    () =>
      players
        .filter((p) => p.role === "player")
        .reduce((s, p) => s + Math.floor(Number(p.entry_sc ?? 0)), 0),
    [players]
  );
  const minEntryMet = totalPlayerEntry >= minEntry;
  const hasPlayerWithEntry = players.some((p) => p.role === "player" && Number(p.entry_sc ?? 0) > 0);
  const canStart = isBanker && !roundOpen && hasPlayerWithEntry && minEntryMet;
  const myTurn = Boolean(
    round &&
      round.status !== "completed" &&
      !round.roll_processing &&
      ((round.status === "banker_rolling" && isBanker) ||
        (round.status === "player_rolling" &&
          mePlayer?.role === "player" &&
          Number(mePlayer.seat_number ?? -1) === Number(round.current_player_seat ?? -2)))
  );

  const otherPlayersHaveStake = players.some(
    (p) => p.role === "player" && p.user_id !== userId && (p.entry_sc ?? 0) > 0
  );
  const canCoverBank =
    myRole === "player" &&
    myEntry === 0 &&
    bank > 0 &&
    gpayCoins >= bank &&
    round &&
    round.status === "banker_rolling" &&
    !round.bank_covered &&
    !round.roll_processing &&
    !otherPlayersHaveStake;

  const roundSideBets = useMemo(
    () => sideBets.filter((b) => b.round_id === round?.id),
    [sideBets, round?.id]
  );

  const openSideFromOthers = roundSideBets.filter(
    (b) => b.status === "open" && b.creator_id !== userId
  );
  const myOpenSide = roundSideBets.filter((b) => b.creator_id === userId && b.status === "open");
  const myMatched = roundSideBets.filter((b) => b.creator_id === userId && b.status === "matched");
  const settledThisRound = roundSideBets.filter(
    (b) => (b.status === "won" || b.status === "lost") && b.round_id === round?.id
  );

  const bankerPlayer = useMemo(
    () => players.find((p) => p.role === "banker"),
    [players]
  );
  const seatPlayers = useMemo(
    () =>
      [...players]
        .filter((p) => p.role === "player")
        .sort((a, b) => (a.seat_number ?? 0) - (b.seat_number ?? 0)),
    [players]
  );

  const currentRollerId = useMemo(
    () => getCurrentRollerUserId(room, round, players),
    [room, round, players]
  );
  const currentRollerName = currentRollerId ? displayNames[currentRollerId] ?? "Player" : "—";
  const uiPhase = useMemo(
    () => deriveCeloUiPhase(round, { canStartRound: canStart, localRolling: rolling }),
    [round, canStart, rolling]
  );

  const displayDice = useMemo((): [number, number, number] | null => {
    if (Boolean(rolling) && dice) return dice;
    if (round?.status === "player_rolling" && lastPlayerRoll?.dice) return lastPlayerRoll.dice;
    const fromRound = parseDiceTuple(round?.banker_dice);
    if (fromRound) return fromRound;
    return dice;
  }, [rolling, dice, round?.banker_dice, round?.status, lastPlayerRoll]);

  const displayRollName = useMemo((): string | null => {
    if (Boolean(rolling) && rollName) return rollName;
    if (round?.status === "player_rolling" && lastPlayerRoll?.rollName) {
      return lastPlayerRoll.rollName || null;
    }
    if (round?.banker_dice_name) return String(round.banker_dice_name);
    return rollName;
  }, [rolling, rollName, round?.banker_dice_name, round?.status, lastPlayerRoll]);

  const sideBetOdds = SIDE_ODDS[sideBetType] ?? 2;
  const potentialWin = Math.floor(sideBetAmount * sideBetOdds);

  const chatBlock = (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-purple-800/40 bg-gradient-to-br from-purple-950/40 to-black/60 p-4 md:p-6">
      <div className={`${cinzel.className} shrink-0 px-0 py-2 text-xs font-semibold uppercase tracking-wider text-[#f5c842]`}>
        💬 CHAT
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-0">
        {messages.map((m) =>
          m.is_system ? (
            <div
              key={m.id}
              className="w-full text-center text-[11px] px-1 py-1"
              style={{
                color: "#F5C842",
                fontFamily: "Courier New, monospace",
              }}
            >
              {m.message}
            </div>
          ) : (
            <div key={m.id} className="text-xs text-white/80">
              <span className="text-[#7C3AED]">{displayNames[m.user_id] ?? "?"}:</span> {m.message}
            </div>
          )
        )}
      </div>
      <div className="mt-2 flex shrink-0 gap-2 border-t border-[#f5c842]/15 pt-3">
        <input
          className="flex-1 rounded-lg border border-purple-700/50 bg-purple-950/60 px-2 py-2 text-xs text-white placeholder:text-white/35 focus:border-[#f5c842] focus:outline-none focus:ring-1 focus:ring-[#f5c842]/40"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Message…"
        />
        <button
          type="button"
          className="rounded-lg border border-purple-600/60 bg-transparent px-3 py-2 text-xs font-semibold tracking-wide text-[#f5c842] transition hover:border-[#f5c842]/80 hover:bg-purple-950/40"
          onClick={() => void sendChat()}
        >
          SEND
        </button>
      </div>
    </div>
  );

  const sidePanelInner = (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl border border-purple-800/40 bg-gradient-to-br from-purple-950/40 to-black/60 p-4 md:p-6">
      <div className={`${cinzel.className} shrink-0 px-0 py-2 text-xs font-semibold uppercase tracking-wider text-[#f5c842]`}>
        🎰 SIDE ENTRIES
      </div>

      <div className="space-y-3 px-0 pb-3">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#f5c842]">Open from others</p>
          {openSideFromOthers.length === 0 ? (
            <p className="text-xs text-white/50">No open entries</p>
          ) : (
            openSideFromOthers.map((b) => {
              const odds = Number(b.odds_multiplier ?? SIDE_ODDS[b.bet_type] ?? 2);
              const pot = Math.floor(b.amount_cents * odds);
              const exp = b.expires_at ? new Date(b.expires_at).getTime() : 0;
              const left = exp ? Math.max(0, Math.ceil((exp - Date.now()) / 1000)) : 0;
              const creatorLabel = (displayNames[b.creator_id] ?? "?").slice(0, 12);
              return (
                <div
                  key={b.id}
                  className="mb-2 space-y-1 rounded-lg border border-purple-800/35 bg-purple-950/30 p-2 text-[11px]"
                >
                  <div className="text-white/90 font-medium truncate">{creatorLabel}</div>
                  <div className="text-white/70">{betPredictionText(b.bet_type, b.specific_point)}</div>
                  <div>
                    {b.amount_cents.toLocaleString()} GPC · ×{odds.toFixed(1)} · Win {pot.toLocaleString()} GPC
                  </div>
                  <div className="text-[#F5C842]">{left}s</div>
                  <button
                    type="button"
                    disabled={busy || !userId || b.creator_id === userId}
                    className="w-full rounded-lg py-1.5 text-xs font-semibold text-black disabled:opacity-40"
                    style={{ backgroundColor: "#F5C842" }}
                    onClick={() => void takeSideBet(b.id)}
                  >
                    TAKE IT
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-[#f5c842]/15 pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#f5c842]">Post a side entry</p>
          <select
            className="mb-2 w-full rounded-lg border border-purple-700/50 bg-purple-950/60 px-2 py-2 text-xs text-white focus:border-[#f5c842] focus:outline-none focus:ring-1 focus:ring-[#f5c842]/40"
            value={sideBetType}
            onChange={(e) => setSideBetType(e.target.value)}
          >
            {Object.keys(SIDE_ODDS).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          {sideBetType === "specific_point" && (
            <input
              type="number"
              min={2}
              max={6}
              className="mb-2 w-full rounded-lg border border-purple-700/50 bg-purple-950/60 px-2 py-2 text-xs text-white focus:border-[#f5c842] focus:outline-none focus:ring-1 focus:ring-[#f5c842]/40"
              value={sideBetPoint}
              onChange={(e) => setSideBetPoint(parseInt(e.target.value, 10) || 4)}
            />
          )}
          <input
            type="number"
            step={100}
            min={100}
            className="mb-1 w-full rounded-lg border border-purple-700/50 bg-purple-950/60 px-2 py-2 text-xs text-white focus:border-[#f5c842] focus:outline-none focus:ring-1 focus:ring-[#f5c842]/40"
            value={sideBetAmount}
            onChange={(e) => setSideBetAmount(parseInt(e.target.value, 10) || 100)}
          />
          <p className="mb-2 text-sm text-purple-300">
            Potential win: {potentialWin.toLocaleString()} GPC at ×{sideBetOdds.toFixed(1)}
          </p>
          <button
            type="button"
            disabled={busy || !round?.id}
            className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 py-2.5 text-xs font-semibold tracking-wide text-[#f5c842] shadow-sm transition hover:from-purple-500 hover:to-purple-600 disabled:opacity-40"
            onClick={() => void postSideBet()}
          >
            POST
          </button>
        </div>

        <div className="border-t border-[#f5c842]/15 pt-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#f5c842]">My open</p>
          {myOpenSide.map((b) => (
            <div key={b.id} className="flex justify-between items-center text-xs py-1">
              <span className="text-white/80 truncate">
                {betPredictionText(b.bet_type, b.specific_point)} · {b.amount_cents} GPC · OPEN
              </span>
              <button
                type="button"
                className="ml-2 shrink-0 text-orange-300/90 hover:text-orange-200"
                onClick={() => void cancelSideBet(b.id)}
              >
                CANCEL
              </button>
            </div>
          ))}
          {myOpenSide.length === 0 && <p className="text-xs text-white/35">None</p>}
        </div>

        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#f5c842]">Matched</p>
          {myMatched.map((b) => (
            <div key={b.id} className="text-xs text-white/70 py-0.5">
              {betPredictionText(b.bet_type, b.specific_point)} · MATCHED
            </div>
          ))}
          {myMatched.length === 0 && <p className="text-xs text-white/35">None</p>}
        </div>

        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#f5c842]">Settled (this round)</p>
          {settledThisRound
            .filter((b) => b.creator_id === userId || b.acceptor_id === userId)
            .map((b) => {
              const iWon = b.winner_id === userId;
              const stake = b.amount_cents ?? 0;
              const pay = b.payout_cents ?? 0;
              return (
                <div
                  key={b.id}
                  className={`text-xs py-0.5 ${iWon ? "text-emerald-400" : "text-orange-300/90"}`}
                >
                  {iWon ? `+${pay.toLocaleString()} GPC` : `-${stake.toLocaleString()} GPC`}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );

  if (!room && !error) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center bg-[#0e0118] text-white">
        <p className={dmSans.className}>Loading…</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className={`flex h-full min-h-0 w-full flex-1 flex-col bg-[#0e0118] p-6 text-white ${dmSans.className}`}>
        <p>{error ?? "Not found"}</p>
        <Link href="/dashboard/games/celo" className="mt-4 inline-block text-violet-400 underline hover:text-violet-300">
          Back to lobby
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`${dmSans.className} flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#0e0118] text-white md:grid md:min-h-0 md:grid-cols-[1fr_min(400px,42vw)] md:gap-4 md:overflow-hidden`}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:min-h-0 md:overflow-hidden">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col">
        <div className="shrink-0 space-y-2 border-b border-purple-800/40 px-2 py-2 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => router.push("/dashboard/games/celo")}
              className="rounded-lg px-2 py-1 text-sm text-[#F5C842] transition hover:bg-white/5"
            >
              ← Lobby
            </button>
            <span className="font-mono text-xs text-[#f5c842]">{formatGPC(gpayCoins)}</span>
            <button
              type="button"
              onClick={() => setWalletOpen(true)}
              className="rounded-lg border border-purple-600/50 px-2 py-1 text-[10px] font-semibold text-purple-200"
            >
              Wallet
            </button>
            <span
              className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                isLive ? "border-emerald-500 text-emerald-400" : "border-gray-600 text-gray-500"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${isLive ? "animate-pulse bg-emerald-400" : "bg-gray-500"}`}
              />
              {isLive ? "LIVE" : "CONNECTING…"}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="w-32 shrink-0 rounded-lg border border-amber-500/20 bg-black/50 px-2 py-1.5">
              <div className="text-[8px] font-bold uppercase tracking-wider text-amber-200/70">Gold</div>
              <div className="font-mono text-[11px] font-semibold tabular-nums text-amber-300">{localeInt(goldCoins)}</div>
            </div>
            <div className="w-32 shrink-0 rounded-lg border border-violet-500/25 bg-black/50 px-2 py-1.5">
              <div className="text-[8px] font-bold uppercase tracking-wider text-violet-300/80">GPC</div>
              <div className="font-mono text-[11px] font-semibold tabular-nums text-violet-200">{localeInt(gpayCoins)}</div>
            </div>
            <div className="w-32 shrink-0 rounded-lg border border-emerald-500/20 bg-black/50 px-2 py-1.5">
              <div className="text-[8px] font-bold uppercase tracking-wider text-emerald-300/75">$GPAY</div>
              <div className="font-mono text-[11px] font-semibold tabular-nums text-emerald-200">{localeInt(gpayTokens)}</div>
            </div>
          </div>
          <div className="flex gap-2 rounded-xl border border-purple-800/40 bg-purple-950/40 p-2">
            {(["game", "side", "chat"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setMobileMainTab(t)}
                className={`flex-1 rounded-lg py-2 text-sm transition ${cinzel.className} ${
                  mobileMainTab === t
                    ? "bg-gradient-to-r from-[#f5c842] to-[#d4a828] font-semibold text-black"
                    : "text-purple-200 hover:bg-purple-900/40"
                }`}
              >
                {t === "game" ? "Game" : t === "side" ? "Side Entries" : "Chat"}
              </button>
            ))}
          </div>
        </div>

        <header className="relative z-10 hidden h-14 shrink-0 items-center justify-between gap-3 border-b border-purple-800/40 bg-[#0e0118]/95 px-4 backdrop-blur-sm md:flex">
          <button
            type="button"
            onClick={() => router.push("/dashboard/games/celo")}
            className="relative z-10 rounded-lg px-2 py-1 text-sm text-[#F5C842] transition hover:bg-white/5"
          >
            ← Lobby
          </button>
          <div className="min-w-0 flex-1 text-center">
            <span className={`${cinzel.className} block truncate text-sm md:text-base`} style={{ color: "#F5C842" }}>
              {room.name ?? "Table"}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-white/45">
              {String(room.status ?? "—").replace(/_/g, " ")} · {uiPhase}
            </span>
          </div>
          <span
            className={`relative z-10 flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              isLive ? "border-emerald-500 text-emerald-400" : "border-gray-600 text-gray-500"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "animate-pulse bg-emerald-400" : "bg-gray-500"}`} />
            {isLive ? "LIVE" : "CONNECTING…"}
          </span>
        </header>

        <div
          className={`mx-3 my-2 shrink-0 rounded-2xl border border-purple-800/40 bg-gradient-to-br from-purple-950/40 to-black/60 p-4 md:mx-3 md:p-6 ${
            mobileMainTab !== "game" ? "hidden md:block" : ""
          }`}
        >
          <div className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:gap-2 md:overflow-visible md:divide-x md:divide-[#f5c842]/20">
            <div className="flex w-40 min-w-0 shrink-0 flex-col justify-center md:w-auto md:pr-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#f5c842]">Banker</span>
              <span className="truncate text-lg font-bold text-white md:text-xl">
                {displayNames[String(room.banker_id ?? "")] ?? "—"}
              </span>
            </div>
            <div className="flex w-40 shrink-0 flex-col items-center justify-center md:w-auto md:px-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#f5c842]">Prize pool</span>
              <span className="text-lg font-bold text-white md:text-xl">{(round?.prize_pool_sc ?? 0).toLocaleString()} GPC</span>
            </div>
            <div className="flex w-40 shrink-0 flex-col items-end justify-center md:w-auto md:pl-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#f5c842]">Bank</span>
              <span className="text-lg font-bold text-white md:text-xl">{bank.toLocaleString()} GPC</span>
            </div>
          </div>
        </div>

        <div
          className={`relative flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2 md:overflow-hidden ${
            mobileMainTab !== "game" ? "hidden md:flex" : "flex"
          }`}
        >
          <div
            className="pointer-events-none absolute inset-0 z-0 opacity-90"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 50% 45%, rgba(124,58,237,0.14), transparent 55%), linear-gradient(90deg, rgba(124,58,237,0.08), transparent 35%), linear-gradient(270deg, rgba(245,200,66,0.08), transparent 35%)",
            }}
          />
          <div className="relative z-[2] mx-auto flex w-full max-w-md flex-col items-center py-2">
            {(bankerPlayer || room.banker_id) && (
              <div className="mb-4 w-full text-center">
                <div className={`${cinzel.className} text-lg tracking-wider text-[#f5c842]`}>BANKER</div>
                <div className="mt-1 text-2xl font-bold text-white">
                  {displayNames[bankerPlayer?.user_id ?? String(room.banker_id ?? "")] ?? "—"}
                </div>
              </div>
            )}

            <div
              className="relative z-[2] mx-auto flex h-64 w-64 max-h-[70vw] max-w-[85vw] shrink-0 flex-col items-center justify-center rounded-full border-4 border-[#f5c842]/60 shadow-[0_0_40px_rgba(245,200,66,0.2)] md:h-[min(280px,28vh)] md:w-[min(280px,85vw)] md:max-w-none md:rounded-[50%]"
              style={{
                background: "radial-gradient(ellipse at center, #064e3b 0%, #022c22 55%, #0f172a 100%)",
                boxShadow:
                  "inset 0 0 80px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.06), 0 12px 48px rgba(0,0,0,0.55), 0 0 40px rgba(245,200,66,0.2)",
              }}
            >
              <span
                className={`${cinzel.className} pointer-events-none absolute select-none text-8xl font-black md:text-[72px]`}
                style={{ color: "rgba(245, 200, 66, 0.1)" }}
              >
                GP
              </span>
              {displayDice ? (
                <div className="relative z-[6] flex items-center justify-center gap-1.5 md:gap-2">
                  <DiceFace
                    value={displayDice[0] as 0 | 1 | 2 | 3 | 4 | 5 | 6}
                    size={Math.min(diceSize, 52)}
                    rolling={Boolean(rolling)}
                    delay={0}
                  />
                  <DiceFace
                    value={displayDice[1] as 0 | 1 | 2 | 3 | 4 | 5 | 6}
                    size={Math.min(diceSize, 52)}
                    rolling={Boolean(rolling)}
                    delay={133}
                  />
                  <DiceFace
                    value={displayDice[2] as 0 | 1 | 2 | 3 | 4 | 5 | 6}
                    size={Math.min(diceSize, 52)}
                    rolling={Boolean(rolling)}
                    delay={266}
                  />
                </div>
              ) : (
                <p
                  className={`${cinzel.className} relative z-[10] max-w-[12rem] px-4 text-center text-sm tracking-wide text-[#f5c842]/80 md:text-base`}
                >
                  Waiting for roll…
                </p>
              )}
              <RollNameDisplay rollName={displayRollName} result={null} />
            </div>

            <div className="mt-6 w-full max-w-md space-y-3 px-1">
              {inRoom && canStart && (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void handleStartRound()}
                  className={`w-full rounded-xl bg-gradient-to-r from-[#f5c842] to-[#d4a828] py-4 text-xl font-semibold text-black shadow-[0_0_30px_rgba(245,200,66,0.4)] transition hover:scale-[1.02] disabled:opacity-40 ${cinzel.className}`}
                >
                  START GAME
                </button>
              )}
              {inRoom && roundOpen && myTurn && (
                <button
                  type="button"
                  disabled={Boolean(rolling) || Boolean(busy) || Boolean(round?.roll_processing)}
                  onClick={() => void handleRoll()}
                  className={`w-full rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 py-4 text-xl font-semibold text-[#f5c842] shadow-[0_0_30px_rgba(124,58,237,0.4)] transition hover:scale-[1.02] disabled:opacity-40 ${cinzel.className}`}
                >
                  ROLL DICE
                </button>
              )}
              {inRoom && roundOpen && !myTurn && !round?.roll_processing && (
                <p className={`${cinzel.className} text-center text-sm tracking-wide text-purple-200/90`}>
                  {currentRollerId ? `Waiting for ${currentRollerName} to roll…` : "Waiting for next roll…"}
                </p>
              )}
              {inRoom && round?.roll_processing && (
                <p className={`${cinzel.className} text-center text-sm text-amber-200/90`}>Resolving roll…</p>
              )}
              {inRoom && canCoverBank && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowCoverConfirm(true)}
                  className="w-full rounded-lg border border-[#f5c842] py-2 text-xs font-semibold text-[#f5c842]"
                >
                  COVER THE BANK ({bank.toLocaleString()} GPC)
                </button>
              )}
            </div>

            <div className="mt-4 flex w-full flex-wrap justify-center gap-2 px-2">
              {seatPlayers.map((p) => (
                <div key={p.user_id} className="max-w-[88px] text-center text-[10px] text-white/80">
                  <div>Seat {p.seat_number ?? "?"}</div>
                  <div className="truncate">{displayNames[p.user_id] ?? "?"}</div>
                </div>
              ))}
            </div>

            {!inRoom && (
              <div className="relative z-[5] mt-4 w-full max-w-sm space-y-2">
                <p className="text-center text-sm text-white/70">
                  Join this table with an entry (multiplier of {minEntry} GPC).
                </p>
                <input
                  type="number"
                  className="w-full rounded-xl border border-purple-700/50 bg-purple-950/60 px-3 py-2 text-white focus:border-[#f5c842] focus:outline-none focus:ring-1 focus:ring-[#f5c842]/40"
                  value={joinEntry}
                  min={minEntry}
                  step={minEntry}
                  onChange={(e) => setJoinEntry(parseInt(e.target.value, 10) || minEntry)}
                />
                <button
                  type="button"
                  disabled={busy || joinEntry < minEntry || joinEntry % minEntry !== 0}
                  className="w-full rounded-xl py-3 font-semibold text-black disabled:opacity-40"
                  style={{ backgroundColor: "#F5C842" }}
                  onClick={() => void handleJoin()}
                >
                  JOIN TABLE
                </button>
              </div>
            )}
          </div>
        </div>

        <div
          className={`min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2 md:hidden ${
            mobileMainTab === "side" ? "flex" : "hidden"
          }`}
        >
          {sidePanelInner}
        </div>
        <div
          className={`min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2 md:hidden ${
            mobileMainTab === "chat" ? "flex" : "hidden"
          }`}
        >
          {chatBlock}
        </div>

        <div className="relative z-10 hidden h-[44px] shrink-0 items-center justify-end gap-2 border-t border-purple-800/40 bg-[#0e0118]/95 px-2.5 backdrop-blur-sm md:flex">
          <span className="shrink-0 font-mono text-xs text-[#f5c842]">{formatGPC(gpayCoins)}</span>
          <Link
            href="/dashboard/coins/buy"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 text-lg leading-none"
            aria-label="Dice shop"
          >
            🛒
          </Link>
        </div>

        <div className="shrink-0 bg-[#0e0118] md:hidden" style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
        </div>
      </div>

      <aside className="hidden min-h-0 flex-[0_0_35%] flex-col gap-3 border-l border-purple-800/40 bg-[#0e0118] p-3 md:flex md:max-w-[35%]">
        <div className="flex min-h-0 flex-[1_1_50%] flex-col overflow-hidden">{sidePanelInner}</div>
        <div className="flex min-h-0 flex-[1_1_50%] flex-col overflow-hidden">{chatBlock}</div>
      </aside>

      {showLowerBank && isBanker && (
        <div className="fixed bottom-0 left-0 right-0 z-[200] rounded-t-[20px] border-t-2 border-[#f5c842] bg-[#0e0118] p-6">
          <h3 className={`${cinzel.className} mb-2 text-center text-lg`} style={{ color: "#F5C842" }}>
            Lower Your Bank?
          </h3>
          <p className="text-center text-sm text-white/80 mb-1">{lowerBankCountdown}s remaining</p>
          <div className="h-2 w-full bg-white/10 rounded-full mb-4 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(lowerBankCountdown / 60) * 100}%`, backgroundColor: "#F5C842" }}
            />
          </div>
          <p className="text-center text-sm mb-3">Current bank: {bank.toLocaleString()} GPC</p>
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {lowerBankPills.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setLowerBankSelected(amt)}
                disabled={busy}
                className="px-3 py-1 rounded-full text-xs border text-white/90"
                style={{
                  borderColor: lowerBankSelected === amt ? "#F5C842" : "rgba(255,255,255,0.2)",
                  backgroundColor: lowerBankSelected === amt ? "rgba(245,200,66,0.15)" : undefined,
                }}
              >
                {amt.toLocaleString()}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || lowerBankSelected == null}
            className="w-full rounded-xl py-3 font-semibold text-black mb-2 disabled:opacity-40"
            style={{ backgroundColor: "#F5C842" }}
            onClick={() => {
              if (lowerBankSelected != null) void confirmLowerBank(lowerBankSelected);
            }}
          >
            CONFIRM LOWER BANK
          </button>
          <button
            type="button"
            className="w-full py-2 text-sm text-white/50"
            onClick={() => setShowLowerBank(false)}
          >
            KEEP SAME
          </button>
        </div>
      )}

      {showBecomeBanker && (
        <div className="fixed bottom-0 left-0 right-0 z-[200] rounded-t-[20px] border-t-2 border-[#f5c842] bg-[#0e0118] p-6 text-center">
          <div className="text-5xl mb-2">🎲</div>
          <h3 className={`${cinzel.className} text-2xl mb-2`} style={{ color: "#F5C842" }}>
            YOU ROLLED C-LO!
          </h3>
          <p className="text-sm text-white/85 mb-2">Do you want to become the Banker?</p>
          <p className="text-sm mb-2">You need {bank.toLocaleString()} GPC</p>
          <p className={`mb-2 text-sm ${gpayCoins >= bank ? "text-emerald-400" : "text-orange-300/95"}`}>
            You have: {gpayCoins.toLocaleString()} GPC {gpayCoins >= bank ? "✓" : "✗"}
          </p>
          <div className="h-2 w-full bg-white/10 rounded-full mb-2 overflow-hidden max-w-xs mx-auto">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(bankerCountdown / 30) * 100}%`, backgroundColor: "#F5C842" }}
            />
          </div>
          <p className="text-xs text-white/60 mb-4">{bankerCountdown} seconds to decide</p>
          <button
            type="button"
            disabled={busy || gpayCoins < bank}
            className="w-full rounded-xl py-3 font-semibold text-black mb-2 disabled:opacity-40"
            style={{ backgroundColor: "#F5C842" }}
            onClick={() => void acceptBanker()}
          >
            BECOME BANKER
          </button>
          <button type="button" className="text-sm text-white/50" onClick={() => setShowBecomeBanker(false)}>
            NO THANKS
          </button>
        </div>
      )}

      {showCoverConfirm && (
        <div className="fixed bottom-0 left-0 right-0 z-[200] rounded-t-[20px] border-t-2 border-[#f5c842] bg-[#0e0118] p-6">
          <h3 className={`${cinzel.className} text-lg mb-2 text-center`} style={{ color: "#F5C842" }}>
            Cover the Entire Bank
          </h3>
          <p className="text-sm text-white/80 text-center mb-1">You will enter {bank.toLocaleString()} GPC</p>
          <p className="text-sm text-white/60 text-center mb-4">Other players locked out this round. Side entries stay open.</p>
          <button
            type="button"
            disabled={busy}
            className="w-full rounded-xl py-3 font-semibold text-black mb-2"
            style={{ backgroundColor: "#F5C842" }}
            onClick={() => void confirmCoverBank()}
          >
            CONFIRM
          </button>
          <button type="button" className="w-full py-2 text-sm text-white/50" onClick={() => setShowCoverConfirm(false)}>
            CANCEL
          </button>
        </div>
      )}

      {walletOpen && (
        <div
          className="fixed inset-0 z-[250] flex items-end justify-center bg-black/60 p-4 md:items-center"
          role="dialog"
          aria-modal
        >
          <div className="w-full max-w-md rounded-t-2xl border border-purple-800/40 bg-[#0e0118] p-5 md:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className={`${cinzel.className} text-lg text-[#f5c842]`}>Wallet</h3>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm text-white/60 hover:bg-white/10"
                onClick={() => setWalletOpen(false)}
              >
                Close
              </button>
            </div>
            <p className="mb-3 text-xs text-white/55">Buy, convert, or redeem without leaving the table.</p>
            <div className="grid grid-cols-1 gap-2">
              <Link
                href="/dashboard/wallet"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-gradient-to-b from-amber-100 to-amber-600 px-3 text-sm font-bold uppercase tracking-wide text-[#0a0610] shadow-sm ring-1 ring-amber-300/40"
                onClick={() => setWalletOpen(false)}
              >
                Buy GC
              </Link>
              <Link
                href="/dashboard/wallet#convert"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-violet-500/45 bg-violet-950/80 px-3 text-sm font-semibold uppercase tracking-wide text-violet-100"
                onClick={() => setWalletOpen(false)}
              >
                Convert
              </Link>
              <Link
                href="/dashboard/wallet#redeem"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-3 text-sm font-semibold uppercase tracking-wide text-emerald-100"
                onClick={() => setWalletOpen(false)}
              >
                Redeem
              </Link>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-4 left-3 right-3 z-[300] rounded-xl border border-amber-500/35 bg-amber-950/35 px-3 py-2 text-xs text-amber-100">
          {error}
        </div>
      )}
    </div>
  );
}
