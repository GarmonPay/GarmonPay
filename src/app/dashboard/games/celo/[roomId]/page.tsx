"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Cinzel_Decorative, DM_Sans } from "next/font/google";
import { createBrowserClient } from "@/lib/supabase";
import { useCoins } from "@/hooks/useCoins";
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
};

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
  const { gpayCoins, formatGPC, refresh, applyServerGpayBalance } = useCoins();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});

  const [dice, setDice] = useState<[number, number, number] | null>(null);
  const [rollName, setRollName] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"side" | "chat">("chat");
  const [tabOpen, setTabOpen] = useState(false);
  const handleTabClick = (t: "side" | "chat") => {
    if (activeTab === t && tabOpen) setTabOpen(false);
    else {
      setActiveTab(t);
      setTabOpen(true);
    }
  };
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

    const { data: rnd } = await supabase
      .from("celo_rounds")
      .select("*")
      .eq("room_id", roomId)
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    setRound(rnd ? (rnd as Round) : null);

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

    const uids = Array.from(new Set((p ?? []).map((x) => (x as Player).user_id)));
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
    const ch = supabase
      .channel(`celo-room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_rooms", filter: `id=eq.${roomId}` },
        () => void loadAll()
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
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, roomId, loadAll]);

  const mePlayer = useMemo(
    () => (userId ? players.find((p) => p.user_id === userId) : undefined),
    [players, userId]
  );
  const isBanker = mePlayer?.role === "banker";
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
      if (!res.ok) throw new Error(typeof j.message === "string" ? j.message : "Could not start");
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
      setError(e instanceof Error ? e.message : "Roll failed");
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

  const roundOpen = round && round.status !== "completed";
  const canStart = isBanker && !roundOpen && players.some((p) => p.role === "player" && (p.entry_sc ?? 0) > 0);
  const myTurn =
    round &&
    ((round.status === "banker_rolling" && isBanker) ||
      (round.status === "player_rolling" &&
        mePlayer?.role === "player" &&
        mePlayer.seat_number === round.current_player_seat));

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

  const sideBetOdds = SIDE_ODDS[sideBetType] ?? 2;
  const potentialWin = Math.floor(sideBetAmount * sideBetOdds);

  const chatBlock = (
    <div className="flex flex-col flex-1 min-h-0">
      <div className={`${cinzel.className} text-xs px-2 py-2 shrink-0`} style={{ color: "#F5C842" }}>
        💬 CHAT
      </div>
      <div className="flex-1 overflow-y-auto px-2 space-y-2 min-h-0">
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
      <div className="flex gap-2 p-2 border-t border-white/10 shrink-0">
        <input
          className="flex-1 rounded-lg bg-black/40 border border-white/10 px-2 py-1 text-xs"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Message…"
        />
        <button type="button" className="text-xs px-3 py-1 rounded-lg bg-[#7C3AED]" onClick={() => void sendChat()}>
          SEND
        </button>
      </div>
    </div>
  );

  const sidePanelInner = (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div className={`${cinzel.className} text-xs px-2 py-2 shrink-0`} style={{ color: "#F5C842" }}>
        🎰 SIDE ENTRIES
      </div>

      <div className="px-2 space-y-3 pb-3">
        <div>
          <p className="text-[10px] text-white/50 mb-1">Open from others</p>
          {openSideFromOthers.length === 0 ? (
            <p className="text-xs text-white/40">No open entries</p>
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
                  className="rounded-lg border border-white/10 bg-black/20 p-2 mb-2 text-[11px] space-y-1"
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

        <div className="border-t border-white/10 pt-2">
          <p className="text-[10px] text-white/50 mb-1">Post a side entry</p>
          <select
            className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1 text-xs mb-2"
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
              className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1 text-xs mb-2"
              value={sideBetPoint}
              onChange={(e) => setSideBetPoint(parseInt(e.target.value, 10) || 4)}
            />
          )}
          <input
            type="number"
            step={100}
            min={100}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-2 py-1 text-xs mb-1"
            value={sideBetAmount}
            onChange={(e) => setSideBetAmount(parseInt(e.target.value, 10) || 100)}
          />
          <p className="text-[10px] text-white/50 mb-2">
            Potential win: {potentialWin.toLocaleString()} GPC at ×{sideBetOdds.toFixed(1)}
          </p>
          <button
            type="button"
            disabled={busy || !round?.id}
            className="w-full rounded-lg py-2 text-xs font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: "#7C3AED" }}
            onClick={() => void postSideBet()}
          >
            POST
          </button>
        </div>

        <div className="border-t border-white/10 pt-2">
          <p className="text-[10px] text-white/50 mb-1">My open</p>
          {myOpenSide.map((b) => (
            <div key={b.id} className="flex justify-between items-center text-xs py-1">
              <span className="text-white/80 truncate">
                {betPredictionText(b.bet_type, b.specific_point)} · {b.amount_cents} GPC · OPEN
              </span>
              <button type="button" className="text-red-400 shrink-0 ml-2" onClick={() => void cancelSideBet(b.id)}>
                CANCEL
              </button>
            </div>
          ))}
          {myOpenSide.length === 0 && <p className="text-xs text-white/35">None</p>}
        </div>

        <div>
          <p className="text-[10px] text-white/50 mb-1">Matched</p>
          {myMatched.map((b) => (
            <div key={b.id} className="text-xs text-white/70 py-0.5">
              {betPredictionText(b.bet_type, b.specific_point)} · MATCHED
            </div>
          ))}
          {myMatched.length === 0 && <p className="text-xs text-white/35">None</p>}
        </div>

        <div>
          <p className="text-[10px] text-white/50 mb-1">Settled (this round)</p>
          {settledThisRound
            .filter((b) => b.creator_id === userId || b.acceptor_id === userId)
            .map((b) => {
              const iWon = b.winner_id === userId;
              const stake = b.amount_cents ?? 0;
              const pay = b.payout_cents ?? 0;
              return (
                <div
                  key={b.id}
                  className={`text-xs py-0.5 ${iWon ? "text-emerald-400" : "text-red-400"}`}
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
      <div className="flex h-full w-full items-center justify-center text-white" style={{ background: "#05010F" }}>
        <p className={dmSans.className}>Loading…</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex h-full w-full flex-col p-6 text-white" style={{ background: "#05010F" }}>
        <p>{error ?? "Not found"}</p>
        <Link href="/dashboard/games/celo" className="mt-4 inline-block text-[#7C3AED] underline">
          Back to lobby
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`${dmSans.className} flex flex-col overflow-hidden text-white md:flex-row`}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "#05010F",
      }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:max-w-[65%] md:flex-[0_0_65%]">
        <header
          className="relative z-10 flex h-12 shrink-0 items-center justify-between gap-2.5 border-b px-3"
          style={{
            background: "rgba(5,1,15,0.97)",
            borderBottom: "1px solid rgba(124,58,237,0.2)",
          }}
        >
          <button
            type="button"
            onClick={() => router.push("/dashboard/games/celo")}
            className="relative z-10 text-sm text-[#F5C842]"
          >
            ←
          </button>
          <span className={`${cinzel.className} max-w-[40vw] truncate text-sm`} style={{ color: "#F5C842" }}>
            {(room.name ?? "Table").slice(0, 16)}
          </span>
          <span className="relative z-10 text-xs text-emerald-400">●</span>
        </header>

        <div
          className="grid h-[52px] shrink-0 grid-cols-3 border-b text-[10px] md:text-xs"
          style={{
            background: "rgba(13,5,32,0.95)",
            borderBottom: "1px solid rgba(245,200,66,0.1)",
          }}
        >
          <div className="flex flex-col justify-center truncate px-2">
            <span className="text-white/40">Banker</span>
            <span className="truncate font-medium text-white">
              {displayNames[String(room.banker_id ?? "")] ?? "—"}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center">
            <span className="text-white/40">Prize pool</span>
            <span style={{ color: "#F5C842" }}>{(round?.prize_pool_sc ?? 0).toLocaleString()} GPC</span>
          </div>
          <div className="flex flex-col items-end justify-center px-2">
            <span className="text-white/40">Bank</span>
            <span style={{ color: "#F5C842" }}>{bank.toLocaleString()} GPC</span>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 z-0 opacity-90"
            style={{
              background:
                "linear-gradient(90deg, rgba(124,58,237,0.12), transparent 30%), linear-gradient(270deg, rgba(245,200,66,0.1), transparent 30%)",
            }}
          />
          {bankerPlayer && (
            <div className="pointer-events-none absolute left-1/2 top-2 z-[3] flex -translate-x-1/2 flex-col items-center gap-0.5 text-[10px] text-white/90">
              <span className="text-white/50">BANKER</span>
              <span className="max-w-[120px] truncate font-medium">
                {displayNames[bankerPlayer.user_id] ?? "—"}
              </span>
            </div>
          )}
          <div
            className="relative z-[2] flex shrink-0 flex-col items-center justify-center"
            style={{
              width: "min(260px, 80vw)",
              height: "min(170px, 26vh)",
              borderRadius: "50%",
              background: "#0D2B0D",
              border: "8px solid #5C3A1A",
              boxShadow: "inset 0 0 60px rgba(0,0,0,0.45)",
            }}
          >
            <span
              className="pointer-events-none absolute select-none text-[72px] font-black"
              style={{ color: "rgba(255,255,255,0.06)" }}
            >
              GP
            </span>
            {dice ? (
              <div className="relative z-[1] flex items-center justify-center gap-2">
                <DiceFace
                  value={dice[0] as 0 | 1 | 2 | 3 | 4 | 5 | 6}
                  size={diceSize}
                  rolling={rolling}
                  delay={0}
                />
                <DiceFace
                  value={dice[1] as 0 | 1 | 2 | 3 | 4 | 5 | 6}
                  size={diceSize}
                  rolling={rolling}
                  delay={133}
                />
                <DiceFace
                  value={dice[2] as 0 | 1 | 2 | 3 | 4 | 5 | 6}
                  size={diceSize}
                  rolling={rolling}
                  delay={266}
                />
              </div>
            ) : (
              <p className="relative z-[1] text-sm text-white/40">Waiting for roll…</p>
            )}
            <RollNameDisplay rollName={rollName} result={null} />
          </div>

          <div className="absolute bottom-2 left-0 right-0 z-[3] flex flex-wrap justify-center gap-2 px-2">
            {seatPlayers.map((p) => (
              <div
                key={p.user_id}
                className="pointer-events-none max-w-[80px] text-center text-[10px] text-white/80"
              >
                <div>Seat {p.seat_number ?? "?"}</div>
                <div className="truncate">{displayNames[p.user_id] ?? "?"}</div>
              </div>
            ))}
          </div>

          {!inRoom && (
            <div className="relative z-[5] mt-3 w-full max-w-sm space-y-2 px-3">
              <p className="text-sm text-white/70">Join this table with an entry (multiplier of {minEntry} GPC).</p>
              <input
                type="number"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2"
                value={joinEntry}
                min={minEntry}
                step={minEntry}
                onChange={(e) => setJoinEntry(parseInt(e.target.value, 10) || minEntry)}
              />
              <button
                type="button"
                disabled={busy || joinEntry < minEntry || joinEntry % minEntry !== 0}
                className="relative z-10 w-full rounded-xl py-3 font-semibold text-black disabled:opacity-40"
                style={{ backgroundColor: "#F5C842" }}
                onClick={() => void handleJoin()}
              >
                JOIN TABLE
              </button>
            </div>
          )}
        </div>

        <div
          className="relative z-10 flex h-[52px] shrink-0 items-center gap-2 border-t px-2.5"
          style={{
            background: "rgba(5,1,15,0.97)",
            borderTop: "1px solid rgba(124,58,237,0.2)",
          }}
        >
          <span className="relative z-10 shrink-0 text-xs font-mono" style={{ color: "#F5C842" }}>
            {formatGPC(gpayCoins)}
          </span>
          {inRoom ? (
            <div className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-1">
              <div className="flex w-full justify-center">
                {canStart && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleStartRound()}
                    className="relative z-10 h-10 rounded-xl px-4 text-sm font-semibold text-black disabled:opacity-40"
                    style={{ backgroundColor: "#7C3AED" }}
                  >
                    START ROUND
                  </button>
                )}
                {roundOpen && myTurn && (
                  <button
                    type="button"
                    disabled={rolling || busy}
                    onClick={() => void handleRoll()}
                    className="relative z-10 h-10 animate-pulse rounded-xl px-5 text-sm font-semibold text-black disabled:opacity-40"
                    style={{ backgroundColor: "#F5C842" }}
                  >
                    ROLL DICE
                  </button>
                )}
                {roundOpen && !myTurn && (
                  <span className="text-xs text-white/40">Waiting for roll…</span>
                )}
              </div>
              {canCoverBank && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowCoverConfirm(true)}
                  className="relative z-10 rounded-lg border px-2 py-1 text-[10px] font-semibold"
                  style={{ borderColor: "#F5C842", color: "#F5C842" }}
                >
                  COVER THE BANK ({bank.toLocaleString()} GPC)
                </button>
              )}
            </div>
          ) : (
            <div className="relative z-10 min-w-0 flex-1" />
          )}
          <Link
            href="/dashboard/coins/buy"
            className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 text-lg leading-none"
            aria-label="Dice shop"
          >
            🛒
          </Link>
        </div>

        <div
          className="relative z-10 flex h-10 shrink-0 md:hidden"
          style={{
            background: "rgba(5,1,15,0.97)",
            borderTop: "1px solid rgba(124,58,237,0.1)",
          }}
        >
          <button
            type="button"
            className="relative z-10 flex h-full flex-1 items-center justify-center text-xs font-semibold"
            style={{
              color: activeTab === "side" ? "#F5C842" : "rgba(255,255,255,0.45)",
              borderBottom:
                activeTab === "side" && tabOpen ? "2px solid #F5C842" : "2px solid transparent",
            }}
            onClick={() => handleTabClick("side")}
          >
            SIDE
          </button>
          <button
            type="button"
            className="relative z-10 flex h-full flex-1 items-center justify-center text-xs font-semibold"
            style={{
              color: activeTab === "chat" ? "#F5C842" : "rgba(255,255,255,0.45)",
              borderBottom:
                activeTab === "chat" && tabOpen ? "2px solid #F5C842" : "2px solid transparent",
            }}
            onClick={() => handleTabClick("chat")}
          >
            CHAT
          </button>
        </div>

        <div
          className="flex-shrink-0 overflow-hidden transition-[height] duration-200 ease-out md:hidden"
          style={{
            height: tabOpen ? 160 : 0,
            background: "rgba(13,5,32,0.98)",
          }}
        >
          {tabOpen && (
            <div className="flex h-[160px] flex-col overflow-hidden">
              {activeTab === "chat" ? (
                <div className="flex h-full min-h-0 flex-col">{chatBlock}</div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto px-2">{sidePanelInner}</div>
              )}
            </div>
          )}
        </div>

        <div
          className="shrink-0 md:hidden"
          style={{
            height: "env(safe-area-inset-bottom, 0px)",
            background: "rgba(5,1,15,0.97)",
          }}
        />
      </div>

      <aside
        className="hidden min-h-0 flex-[0_0_35%] flex-col border-l md:flex md:max-w-[35%]"
        style={{
          borderLeft: "1px solid rgba(124,58,237,0.2)",
          background: "rgba(5,1,15,0.97)",
        }}
      >
        <div className="flex min-h-0 flex-[1_1_50%] flex-col overflow-hidden border-b border-white/10">
          {sidePanelInner}
        </div>
        <div className="flex min-h-0 flex-[1_1_50%] flex-col overflow-hidden">{chatBlock}</div>
      </aside>

      {showLowerBank && isBanker && (
        <div
          className="fixed left-0 right-0 bottom-0 p-6 z-[200] rounded-t-[20px] border-t-2"
          style={{ backgroundColor: "#0D0520", borderColor: "#F5C842" }}
        >
          <h3 className={`${cinzel.className} text-lg mb-2 text-center`} style={{ color: "#F5C842" }}>
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
        <div
          className="fixed left-0 right-0 bottom-0 p-6 z-[200] rounded-t-[20px] border-t-2 text-center"
          style={{ backgroundColor: "#0D0520", borderColor: "#F5C842" }}
        >
          <div className="text-5xl mb-2">🎲</div>
          <h3 className={`${cinzel.className} text-2xl mb-2`} style={{ color: "#F5C842" }}>
            YOU ROLLED C-LO!
          </h3>
          <p className="text-sm text-white/85 mb-2">Do you want to become the Banker?</p>
          <p className="text-sm mb-2">You need {bank.toLocaleString()} GPC</p>
          <p className={`text-sm mb-2 ${gpayCoins >= bank ? "text-emerald-400" : "text-red-400"}`}>
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
        <div
          className="fixed left-0 right-0 bottom-0 p-6 z-[200] rounded-t-[20px] border-t-2"
          style={{ backgroundColor: "#0D0520", borderColor: "#F5C842" }}
        >
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

      {error && (
        <div className="fixed bottom-4 left-3 right-3 z-[300] rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
