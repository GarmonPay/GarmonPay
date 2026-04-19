"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import DiceFace from "@/components/celo/DiceFace";
import RollNameDisplay, { type RollResultKind } from "@/components/celo/RollNameDisplay";
import { localeInt } from "@/lib/format-number";
import { parseCeloSystemChatMessage } from "@/lib/celo-system-chat";
import { getCeloStartRoundBlockReason } from "@/lib/celo-start-round-eligibility";
import { celoPlayerStakeCents } from "@/lib/celo-player-stake";

interface Player {
  id: string;
  user_id: string;
  role: "banker" | "player" | "spectator";
  seat_number: number;
  entry_sc: number;
  /** Present on some rows; stake may live here when `entry_sc` is 0 (see celoPlayerStakeCents). */
  bet_cents?: number;
  dice_type: string;
  user?: { full_name: string; email: string };
}

interface Round {
  id: string;
  status: string;
  banker_dice: number[] | null;
  banker_roll_name: string | null;
  banker_roll_result: string | null;
  banker_point: number | null;
  prize_pool_sc: number;
  platform_fee_sc: number;
  bank_covered: boolean;
  covered_by: string | null;
  round_number: number;
}

interface Room {
  id: string;
  name: string;
  banker_id: string;
  status: string;
  minimum_entry_sc: number;
  current_bank_sc: number;
  max_players: number;
  last_round_was_celo: boolean;
  banker_celo_at: string | null;
  platform_fee_pct: number;
  banker?: { full_name: string; email: string };
}

interface Message {
  id: string;
  user_id: string;
  message: string;
  is_system: boolean;
  created_at: string;
  user?: { full_name: string; email: string };
}

interface SideBet {
  id: string;
  creator_id: string;
  acceptor_id: string | null;
  bet_type: string;
  amount_sc: number;
  odds_multiplier: number;
  status: string;
  expires_at: string;
  creator?: { full_name: string };
}

type DiceType =
  | "standard"
  | "gold"
  | "street"
  | "midnight"
  | "blood"
  | "fire"
  | "diamond";

type TabType = "side" | "chat";

const MOBILE_NAV_OFFSET = "calc(5rem + env(safe-area-inset-bottom, 0px))";
const CHAT_MAX = 150;

function parseRollResultKind(s: string | null): RollResultKind {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("no_count") || t.includes("reroll")) return "no_count";
  if (t.includes("point")) return "point";
  if (t.includes("loss") || t === "loss") return "instant_loss";
  if (t.includes("win") || t === "instant_win") return "instant_win";
  return null;
}

export default function CeloRoomPage() {
  const supabase = useMemo(() => {
    const c = createBrowserClient();
    if (!c) throw new Error("Supabase not configured");
    return c;
  }, []);
  const router = useRouter();
  const params = useParams();
  const roomId =
    typeof params?.roomId === "string"
      ? params.roomId
      : Array.isArray(params?.roomId)
        ? params.roomId[0] ?? ""
        : "";

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sideBets, setSideBets] = useState<SideBet[]>([]);
  const [myBalance, setMyBalance] = useState(0);
  const [myUserId, setMyUserId] = useState("");
  const [myRole, setMyRole] = useState<"banker" | "player" | "spectator">("spectator");
  const [myEntry, setMyEntry] = useState(0);
  const [myDiceType, setMyDiceType] = useState<DiceType>("standard");

  const [rolling, setRolling] = useState(false);
  const [dice, setDice] = useState<[number, number, number] | null>(null);
  const [rollName, setRollName] = useState<string | null>(null);
  const [rollResult, setRollResult] = useState<string | null>(null);
  const rollingRef = useRef(false);

  const [activeTab, setActiveTab] = useState<TabType>("chat");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<"live" | "connecting" | "offline">("connecting");
  const [rollingAction, setRollingAction] = useState(false);
  const [entryAmount, setEntryAmount] = useState(0);
  const [showDiceShop, setShowDiceShop] = useState(false);
  const [showLowerBank, setShowLowerBank] = useState(false);
  const [newBankAmount, setNewBankAmount] = useState(0);
  const [showBecomeBanker, setShowBecomeBanker] = useState(false);
  const [bankerOfferExpiry, setBankerOfferExpiry] = useState<Date | null>(null);
  const [bankerCountdown, setBankerCountdown] = useState(30);
  const [lowerBankCountdown, setLowerBankCountdown] = useState(60);
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [sideBetForm, setSideBetForm] = useState({
    bet_type: "celo",
    amount_sc: 100,
    specific_point: 5,
  });
  const [startRoundBusy, setStartRoundBusy] = useState(false);
  const [startRoundError, setStartRoundError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const gpcToUsd = (gpc: number) => `$${(gpc / 100).toFixed(2)}`;

  const getName = (u?: { full_name: string; email: string }) =>
    u?.full_name || u?.email?.split("@")[0] || "?";

  const getInitial = (u?: { full_name: string; email: string }) =>
    getName(u).charAt(0).toUpperCase();

  const myPlayer = players.find((p) => p.user_id === myUserId);
  const bankerPlayer = players.find((p) => p.role === "banker");
  const activePlayers = players.filter((p) => p.role === "player");

  const fetchAll = useCallback(async () => {
    if (!roomId) return;
    const [roomRes, playersRes, roundRes, chatRes, betsRes] = await Promise.all([
      supabase
        .from("celo_rooms")
        .select(`*, banker:users!celo_rooms_banker_id_fkey(full_name, email)`)
        .eq("id", roomId)
        .maybeSingle(),
      supabase
        .from("celo_room_players")
        .select(`*, user:users(full_name, email)`)
        .eq("room_id", roomId)
        .order("seat_number"),
      supabase
        .from("celo_rounds")
        .select("*")
        .eq("room_id", roomId)
        .neq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("celo_chat")
        .select(`*, user:users(full_name, email)`)
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("celo_side_bets")
        .select(`*, creator:users!celo_side_bets_creator_id_fkey(full_name)`)
        .eq("room_id", roomId)
        .eq("status", "open"),
    ]);

    if (roomRes.data) setRoom(roomRes.data as Room);
    if (playersRes.data) {
      setPlayers(playersRes.data as Player[]);
      setSpectatorCount(playersRes.data.filter((p) => p.role === "spectator").length);
    }
    const r0 = roundRes.data?.[0];
    if (r0) {
      setRound(r0 as Round);
      const bd = r0.banker_dice;
      if (bd && bd.length === 3 && bd[0]! > 0) {
        setDice([bd[0]!, bd[1]!, bd[2]!]);
        setRollName(r0.banker_roll_name);
      } else {
        setDice(null);
      }
    } else {
      setRound(null);
      setDice(null);
    }
    if (chatRes.data) setMessages([...(chatRes.data as Message[])].reverse());
    if (betsRes.data) setSideBets(betsRes.data as SideBet[]);
  }, [supabase, roomId]);

  const triggerAnimation = useCallback(async (newDice: [number, number, number], name: string) => {
    if (rollingRef.current) return;
    rollingRef.current = true;
    setRolling(true);
    setRollName(null);
    await new Promise((r) => setTimeout(r, 2500));
    setRolling(false);
    setDice(newDice);
    await new Promise((r) => setTimeout(r, 400));
    setRollName(name);
    rollingRef.current = false;
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) {
        void fetchAll();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (sess?.access_token) {
        supabase.realtime.setAuth(sess.access_token);
      }
    });

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      if (cancelled) return;
      // Realtime postgres_changes + RLS: JWT must be set on the Realtime socket or events are not delivered.
      supabase.realtime.setAuth(session.access_token);
      setMyUserId(session.user.id);
      const { data: user } = await supabase
        .from("users")
        .select("gpay_coins")
        .eq("id", session.user.id)
        .single();
      if (user && !cancelled) setMyBalance((user as { gpay_coins?: number }).gpay_coins || 0);
      await fetchAll();
      if (!cancelled) setLoading(false);

      channel = supabase
        .channel(`room-${roomId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "celo_rooms", filter: `id=eq.${roomId}` },
          () => {
            void fetchAll();
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
            const row = p.new as { status?: string } | null;
            if (row?.status === "banker_rolling") {
              setDice(null);
              setRollName(null);
              setRollResult(null);
            }
            void fetchAll();
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "celo_player_rolls", filter: `room_id=eq.${roomId}` },
          (p) => {
            const row = p.new as { user_id?: string; dice?: number[]; roll_name?: string } | null;
            if (row && row.user_id !== session.user.id && row.dice?.length === 3 && row.roll_name) {
              void triggerAnimation(
                [row.dice[0]!, row.dice[1]!, row.dice[2]!],
                row.roll_name
              );
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "celo_chat", filter: `room_id=eq.${roomId}` },
          async (p) => {
            if (!p.new) return;
            const { data: msg } = await supabase
              .from("celo_chat")
              .select(`*, user:users(full_name, email)`)
              .eq("id", (p.new as { id: string }).id)
              .single();
            if (msg) {
              setMessages((prev) => {
                if (prev.find((m) => m.id === msg.id)) return prev;
                return [...prev, msg as Message];
              });
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "celo_side_bets", filter: `room_id=eq.${roomId}` },
          () => {
            void fetchAll();
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setConnectionStatus("live");
            void fetchAll();
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
            setConnectionStatus("offline");
          }
        });
    };

    void init();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      authSubscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
      setDice(null);
      setRollName(null);
      setRollResult(null);
    };
  }, [supabase, router, roomId, fetchAll, triggerAnimation]);

  useEffect(() => {
    const me = players.find((p) => p.user_id === myUserId);
    if (me) {
      setMyRole(me.role);
      setMyEntry(celoPlayerStakeCents(me));
      setMyDiceType((me.dice_type || "standard") as DiceType);
    }
  }, [players, myUserId]);

  useEffect(() => {
    if (room && entryAmount === 0) setEntryAmount(room.minimum_entry_sc);
  }, [room, entryAmount]);

  useEffect(() => {
    if (!room?.last_round_was_celo || !room.banker_celo_at) return;
    const celoTime = new Date(room.banker_celo_at).getTime();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - celoTime) / 1000;
      const remaining = 60 - elapsed;
      if (remaining <= 0) {
        setShowLowerBank(false);
        clearInterval(timer);
      } else {
        setLowerBankCountdown(Math.ceil(remaining));
        if (myRole === "banker") setShowLowerBank(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [room?.last_round_was_celo, room?.banker_celo_at, myRole]);

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const fn = () => setIsDesktop(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    if (round?.status !== "completed") return;
    const t = window.setTimeout(() => {
      setDice(null);
      setRollName(null);
      setRollResult(null);
      setRolling(false);
    }, 3000);
    return () => window.clearTimeout(t);
  }, [round?.status, round?.id]);

  const handleRoll = async () => {
    if (rollingAction || rollingRef.current) return;
    setRollingAction(true);
    try {
      const res = await fetch("/api/celo/round/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ room_id: roomId, round_id: round?.id }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        console.error("Roll error:", d.error);
        return;
      }
      const data = (await res.json()) as {
        dice?: [number, number, number];
        rollName?: string;
        outcome?: string;
        player_can_become_banker?: boolean;
      };
      if (data.dice && data.rollName) {
        await triggerAnimation(data.dice, data.rollName);
        setRollResult(data.outcome ?? null);
        if (data.player_can_become_banker) {
          setBankerOfferExpiry(new Date(Date.now() + 30000));
          setShowBecomeBanker(true);
        }
      }
      await fetchAll();
      const { data: user } = await supabase
        .from("users")
        .select("gpay_coins")
        .eq("id", myUserId)
        .single();
      if (user) setMyBalance((user as { gpay_coins?: number }).gpay_coins || 0);
    } finally {
      setRollingAction(false);
    }
  };

  const startRoundBlockReason = useMemo(() => {
    if (!room || !myUserId) return "Loading…";
    return getCeloStartRoundBlockReason({
      room,
      myUserId,
      myRole,
      currentRound: round,
      players,
      startRoundBusy,
    });
  }, [room, myUserId, myRole, round, players, startRoundBusy]);

  useEffect(() => {
    setStartRoundError(null);
  }, [round?.id, room?.status]);

  const roomAllowsNewRound =
    room != null && (room.status === "waiting" || room.status === "active");

  const handleStartRound = async () => {
    if (!room || !roomId || startRoundBusy) return;

    const preBlock = getCeloStartRoundBlockReason({
      room,
      myUserId,
      myRole,
      currentRound: round,
      players,
      startRoundBusy: false,
    });
    if (preBlock) {
      setStartRoundError(preBlock);
      console.warn("[celo/start-round client] blocked before fetch", { preBlock, roomId });
      return;
    }

    const seatedWithStake = players.filter(
      (p) => p.role === "player" && celoPlayerStakeCents(p) > 0,
    );
    console.info("[celo/start-round client] START ROUND CLICKED", {
      roomId,
      myUserId,
      bankerId: room.banker_id,
      roomStatus: room.status,
      roundStatus: round?.status ?? null,
      seatedWithStakeCount: seatedWithStake.length,
      canStartRound: true,
    });

    setStartRoundBusy(true);
    setStartRoundError(null);
    try {
      const res = await fetch("/api/celo/round/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ room_id: roomId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        details?: string;
        round?: unknown;
      };
      console.info("[celo/start-round client] API response", {
        ok: res.ok,
        status: res.status,
        body: data,
      });
      if (!res.ok) {
        const msg =
          typeof data.error === "string" && data.error.length > 0
            ? data.error
            : `Request failed (${res.status})`;
        setStartRoundError(data.details ? `${msg}: ${data.details}` : msg);
        return;
      }
      await fetchAll();
      setStartRoundError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      console.error("[celo/start-round client] fetch error", e);
      setStartRoundError(msg);
    } finally {
      setStartRoundBusy(false);
    }
  };

  const handleJoinRound = async () => {
    if (entryAmount <= 0 || !room) return;
    const res = await fetch("/api/celo/room/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        room_id: roomId,
        role: "player",
        entry_cents: entryAmount,
      }),
    });
    if (res.ok) await fetchAll();
  };

  const handleCoverBank = async () => {
    if (!room) return;
    const res = await fetch("/api/celo/room/cover-bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ room_id: roomId }),
    });
    if (res.ok) await fetchAll();
  };

  const handleLowerBank = async () => {
    if (!room) return;
    const res = await fetch("/api/celo/room/lower-bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        room_id: roomId,
        new_bank_sc: newBankAmount,
      }),
    });
    if (res.ok) {
      setShowLowerBank(false);
      await fetchAll();
    }
  };

  const handleBecomeBanker = async () => {
    const res = await fetch("/api/celo/banker/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ room_id: roomId, round_id: round?.id }),
    });
    if (res.ok) {
      setShowBecomeBanker(false);
      await fetchAll();
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim().slice(0, CHAT_MAX);
    setChatInput("");
    await supabase.from("celo_chat").insert({
      room_id: roomId,
      user_id: myUserId,
      message: msg,
    });
  };

  const handlePostSideBet = async () => {
    const res = await fetch("/api/celo/sidebet/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        room_id: roomId,
        round_id: round?.id,
        ...sideBetForm,
      }),
    });
    if (res.ok) await fetchAll();
  };

  const handleAcceptSideBet = async (betId: string) => {
    const res = await fetch("/api/celo/sidebet/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ side_bet_id: betId }),
    });
    if (res.ok) await fetchAll();
  };

  const canRoll = () => {
    if (!round || rollingAction || rollingRef.current) return false;
    if (round.status === "banker_rolling" && myRole === "banker") return true;
    if (round.status === "player_rolling" && myRole === "player" && myEntry > 0) return true;
    return false;
  };

  const onMobileTab = (tab: TabType) => {
    if (activeTab === tab && mobilePanelOpen) {
      setMobilePanelOpen(false);
    } else {
      setActiveTab(tab);
      setMobilePanelOpen(true);
    }
  };

  const tabBarHeight = 40;
  const actionBarHeight = isDesktop ? 52 : 56;
  const panelMax = 180;

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#05010F",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#F5C842",
          fontFamily: "Courier New",
          fontSize: 16,
        }}
      >
        Loading room...
      </div>
    );
  }

  if (!room) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#05010F",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <div style={{ color: "#EF4444", fontFamily: "Courier New", fontSize: 16 }}>Room not found</div>
        <button
          type="button"
          onClick={() => router.push("/dashboard/games/celo")}
          style={{
            background: "linear-gradient(135deg, #F5C842, #D4A017)",
            border: "none",
            borderRadius: 8,
            color: "#0A0A0F",
            padding: "12px 24px",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "Courier New",
          }}
        >
          BACK TO LOBBY
        </button>
      </div>
    );
  }

  const chatMessagesEl = messages.map((msg) => {
    const parsed = parseCeloSystemChatMessage(msg.message);
    if (parsed.variant) {
      const color =
        parsed.variant === "gold" ? "#F5C842" : parsed.variant === "red" ? "#EF4444" : "#22C55E";
      return (
        <div key={msg.id} style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color, fontFamily: "Courier New", letterSpacing: "0.03em" }}>{parsed.text}</div>
        </div>
      );
    }
    if (msg.is_system) {
      return (
        <div key={msg.id} style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#F5C842", fontFamily: "Courier New", letterSpacing: "0.03em" }}>
            {msg.message}
          </div>
        </div>
      );
    }
    return (
      <div key={msg.id} style={{ display: "flex", gap: 8, textAlign: "left" }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #4C1D95, #7C3AED)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          {getInitial(msg.user)}
        </div>
        <div>
          <span style={{ fontSize: 11, color: "#A855F7", fontFamily: "Courier New", marginRight: 6 }}>
            {getName(msg.user).split(" ")[0]}
          </span>
          <span style={{ fontSize: 12, color: "#D1D5DB" }}>{msg.message}</span>
        </div>
      </div>
    );
  });

  const sidePanelInner = (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "8px 10px",
        gap: 6,
        overflowY: "auto",
        minHeight: 0,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: 8 }}>
        <div
          style={{
            fontSize: 10,
            color: "#A78BFA",
            fontFamily: "Courier New",
            letterSpacing: "0.12em",
            fontWeight: 700,
          }}
        >
          SIDE MARKETS
        </div>
        <button
          type="button"
          onClick={() => void handlePostSideBet()}
          style={{
            background: "rgba(124,58,237,0.2)",
            border: "1px solid rgba(124,58,237,0.4)",
            borderRadius: 6,
            color: "#A855F7",
            fontSize: 10,
            padding: "4px 10px",
            cursor: "pointer",
            fontFamily: "Courier New",
            fontWeight: 700,
          }}
        >
          + POST
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <select
          value={sideBetForm.bet_type}
          onChange={(e) =>
            setSideBetForm((f) => ({
              ...f,
              bet_type: e.target.value,
            }))
          }
          style={{
            flex: 2,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(124,58,237,0.3)",
            borderRadius: 6,
            color: "#fff",
            padding: "6px 8px",
            fontSize: 11,
            fontFamily: "Courier New",
            outline: "none",
          }}
        >
          <option value="celo">C-Lo (8×)</option>
          <option value="shit">Shit (8×)</option>
          <option value="hand_crack">Hand Crack (4.5×)</option>
          <option value="trips">Trips (8×)</option>
          <option value="banker_wins">Banker wins (1.8×)</option>
          <option value="player_wins">Players win (1.8×)</option>
        </select>
        <input
          type="number"
          value={sideBetForm.amount_sc}
          onChange={(e) =>
            setSideBetForm((f) => ({
              ...f,
              amount_sc: Math.max(100, Math.round(parseInt(e.target.value, 10) / 100) * 100),
            }))
          }
          style={{
            flex: 1,
            minWidth: 0,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(124,58,237,0.3)",
            borderRadius: 6,
            color: "#F5C842",
            padding: "6px 8px",
            fontSize: 11,
            fontFamily: "Courier New",
            outline: "none",
          }}
        />
      </div>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
        {sideBets.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "#6B7280",
              fontSize: 11,
              fontFamily: "Courier New",
              padding: "12px 10px",
              borderRadius: 10,
              border: "1px dashed rgba(124,58,237,0.28)",
              background: "rgba(124,58,237,0.06)",
              lineHeight: 1.45,
            }}
          >
            <span style={{ display: "block", color: "#9CA3AF", fontSize: 10, letterSpacing: "0.06em", marginBottom: 4 }}>
              NO OPEN OFFERS
            </span>
            Post a side entry — other players can take the other side of your bet.
          </div>
        ) : (
          sideBets.map((bet) => (
            <div
              key={bet.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(255,255,255,0.03)",
                borderRadius: 6,
                padding: "8px 10px",
              }}
            >
              <div style={{ flex: 1 }}>
                <span style={{ color: "#9CA3AF", fontSize: 11, fontFamily: "Courier New" }}>
                  {bet.creator?.full_name?.split(" ")[0] || "?"}
                </span>
                <span style={{ color: "#6B7280", fontSize: 10, fontFamily: "Courier New" }}>
                  {" "}
                  → {bet.bet_type.replace("_", " ")}
                </span>
              </div>
              <div style={{ color: "#F5C842", fontSize: 11, fontFamily: "Courier New", fontWeight: 700 }}>{bet.amount_sc} GPC</div>
              {bet.creator_id !== myUserId && !bet.acceptor_id ? (
                <button
                  type="button"
                  onClick={() => void handleAcceptSideBet(bet.id)}
                  style={{
                    background: "linear-gradient(135deg, #F5C842, #D4A017)",
                    border: "none",
                    borderRadius: 5,
                    color: "#0A0A0F",
                    fontSize: 10,
                    padding: "4px 8px",
                    cursor: "pointer",
                    fontFamily: "Courier New",
                    fontWeight: 700,
                  }}
                >
                  TAKE
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const chatPanelInner = (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {isDesktop ? (
        <div
          style={{
            flexShrink: 0,
            padding: "6px 10px 4px",
            borderBottom: "1px solid rgba(124,58,237,0.12)",
            fontSize: 10,
            color: "#A78BFA",
            fontFamily: "Courier New",
            letterSpacing: "0.12em",
            fontWeight: 700,
          }}
        >
          TABLE CHAT
        </div>
      ) : null}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "6px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 5,
          minHeight: 0,
        }}
      >
        {chatMessagesEl}
        <div ref={chatEndRef} />
      </div>
      <div
        style={{
          padding: "6px 10px",
          borderTop: "1px solid rgba(124,58,237,0.14)",
          display: "flex",
          gap: 6,
          flexShrink: 0,
          flexWrap: "wrap",
          alignItems: "center",
          background: "rgba(5,1,15,0.5)",
        }}
      >
        <div style={{ display: "flex", gap: 4, marginRight: 4, flexWrap: "wrap" }}>
          {["🎲", "💰", "🔥", "😂", "💀", "👑"].map((e) => (
            <button
              type="button"
              key={e}
              onClick={async () => {
                await supabase.from("celo_chat").insert({
                  room_id: roomId,
                  user_id: myUserId,
                  message: e,
                });
              }}
              style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", padding: "2px" }}
            >
              {e}
            </button>
          ))}
        </div>
        <input
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value.slice(0, CHAT_MAX))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSendChat();
            }
          }}
          placeholder="Hype the table..."
          style={{
            flex: 1,
            minWidth: 120,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(124,58,237,0.2)",
            borderRadius: 8,
            color: "#fff",
            padding: "8px 10px",
            fontSize: 13,
            outline: "none",
            fontFamily: "DM Sans",
          }}
        />
        {!isDesktop ? (
          <button
            type="button"
            onClick={() => void handleSendChat()}
            style={{
              background: "linear-gradient(135deg, #7C3AED, #A855F7)",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "Courier New",
            }}
          >
            SEND
          </button>
        ) : null}
      </div>
    </div>
  );

  const rollKind = parseRollResultKind(rollResult);
  const showRollingUi = rolling || rollingAction;
  const dieSize =
    typeof window !== "undefined" && !isDesktop
      ? Math.min(68, Math.max(48, Math.round(window.innerWidth * 0.12)))
      : 76;

  const headerH = isDesktop ? 48 : 48;
  const bankH = isDesktop ? 58 : 56;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        top: 0,
        bottom: isDesktop ? 0 : MOBILE_NAV_OFFSET,
        background: "#05010F",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "DM Sans, sans-serif",
        minHeight: 0,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: isDesktop ? "row" : "column",
          minHeight: 0,
          width: "100%",
          maxWidth: isDesktop ? "min(100%, 1360px)" : undefined,
          margin: isDesktop ? "0 auto" : undefined,
          padding: isDesktop ? "8px 12px 10px" : 0,
          gap: isDesktop ? 12 : 0,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            flex: isDesktop ? "1 1 70%" : 1,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          borderRadius: isDesktop ? 14 : 0,
          border: isDesktop ? "1px solid rgba(124,58,237,0.28)" : "none",
          background: isDesktop
            ? "linear-gradient(165deg, rgba(18,8,42,0.97) 0%, rgba(5,1,15,0.99) 45%, rgba(8,4,22,1) 100%)"
            : "transparent",
          boxShadow: isDesktop ? "0 12px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)" : "none",
          overflow: "hidden",
        }}
      >
      <div
        style={{
          height: headerH,
          flexShrink: 0,
          background: "rgba(5,1,15,0.97)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(124,58,237,0.2)",
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          gap: 6,
          zIndex: 60,
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/dashboard/games/celo")}
          style={{
            background: "none",
            border: "none",
            color: "#9CA3AF",
            fontSize: 20,
            cursor: "pointer",
            padding: 0,
            lineHeight: 1,
          }}
        >
          ←
        </button>
        <div
          style={{
            flex: 1,
            fontFamily: '"Cinzel Decorative", serif',
            color: "#fff",
            fontSize: 13,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {room.name}
        </div>
        {isDesktop ? (
          <div style={{ fontFamily: "Courier New", color: "#F5C842", fontSize: 12, whiteSpace: "nowrap" }}>
            {round ? `ROUND ${round.round_number}` : "—"}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background:
                connectionStatus === "live" ? "#10B981" : connectionStatus === "connecting" ? "#F59E0B" : "#EF4444",
              boxShadow: connectionStatus === "live" ? "0 0 6px #10B981" : "none",
              animation: connectionStatus === "live" ? "pulse 2s infinite" : "none",
            }}
          />
          <span style={{ fontSize: 10, fontFamily: "Courier New", color: "#6B7280" }}>
            {connectionStatus === "live" ? "LIVE" : connectionStatus === "connecting" ? "CONNECTING" : "OFFLINE"}
          </span>
        </div>
        {isDesktop ? (
          <div style={{ fontSize: 11, color: "#6B7280", fontFamily: "Courier New", whiteSpace: "nowrap" }}>
            👁 {spectatorCount}
          </div>
        ) : null}
      </div>

      <div
        style={{
          height: bankH,
          flexShrink: 0,
          background: "linear-gradient(135deg, rgba(13,5,32,0.95), rgba(30,10,60,0.95))",
          borderBottom: "1px solid rgba(245,200,66,0.12)",
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          gap: 0,
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
          <div style={{ fontSize: 9, color: "#6B7280", fontFamily: "Courier New", letterSpacing: "0.08em" }}>BANKER</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                border: "1.5px solid #F5C842",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              {getInitial(bankerPlayer?.user)}
            </div>
            <div
              style={{
                fontSize: isDesktop ? 12 : 10,
                color: "#fff",
                fontFamily: "Courier New",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: isDesktop ? 80 : 72,
              }}
            >
              {getName(bankerPlayer?.user)}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ fontSize: 9, color: "#F5C842", fontFamily: "Courier New", letterSpacing: "0.08em" }}>PRIZE POOL</div>
          <div
            style={{
              fontSize: isDesktop ? 16 : 11,
              fontWeight: 700,
              color: "#fff",
              fontFamily: "Courier New",
            }}
          >
            {localeInt(round?.prize_pool_sc)}
            <span style={{ fontSize: isDesktop ? 10 : 9, color: "#F5C842", marginLeft: 3 }}>GPC</span>
          </div>
          {isDesktop ? (
            <div style={{ fontSize: 10, color: "#6B7280", fontFamily: "Courier New" }}>
              ({gpcToUsd(round?.prize_pool_sc || 0)})
            </div>
          ) : null}
          {round?.bank_covered ? (
            <div style={{ fontSize: 9, color: "#F5C842", fontFamily: "Courier New", letterSpacing: "0.05em" }}>🔒 COVERED</div>
          ) : null}
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <div style={{ fontSize: 9, color: "#6B7280", fontFamily: "Courier New", letterSpacing: "0.08em" }}>BANK</div>
          <div
            style={{
              fontSize: isDesktop ? 16 : 11,
              fontWeight: 700,
              color: "#F5C842",
              fontFamily: "Courier New",
            }}
          >
            {localeInt(room.current_bank_sc)}
            <span style={{ fontSize: isDesktop ? 10 : 9, color: "#D4A017", marginLeft: 3 }}>GPC</span>
          </div>
          {isDesktop ? (
            <div style={{ fontSize: 10, color: "#6B7280", fontFamily: "Courier New" }}>({gpcToUsd(room.current_bank_sc)})</div>
          ) : null}
          {myRole === "banker" && room.last_round_was_celo ? (
            <button
              type="button"
              onClick={() => {
                setNewBankAmount(room.minimum_entry_sc);
                setShowLowerBank(true);
              }}
              style={{
                background: "rgba(245,200,66,0.15)",
                border: "1px solid rgba(245,200,66,0.4)",
                borderRadius: 4,
                color: "#F5C842",
                fontSize: 9,
                padding: "2px 6px",
                cursor: "pointer",
                fontFamily: "Courier New",
                animation: "pulse 1.5s infinite",
              }}
            >
              LOWER BANK ↓
            </button>
          ) : null}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: isDesktop ? 240 : 200,
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: isDesktop ? "4px 8px 0" : 0,
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: "#05010F", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              left: "-10%",
              top: "20%",
              width: 200,
              height: 200,
              borderRadius: "50%",
              background: "rgba(124,58,237,0.06)",
              filter: "blur(60px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: "-5%",
              top: "10%",
              width: 150,
              height: 150,
              borderRadius: "50%",
              background: "rgba(245,200,66,0.04)",
              filter: "blur(50px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 2,
              background: "#7C3AED",
              boxShadow: "0 0 8px #7C3AED, 0 0 20px rgba(124,58,237,0.5)",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 2,
              background: "#F5C842",
              boxShadow: "0 0 8px #F5C842, 0 0 20px rgba(245,200,66,0.4)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 3,
              background: "#10B981",
              boxShadow: "0 0 12px #10B981, 0 0 24px rgba(16,185,129,0.4)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(
              ellipse 60% 50% at 50% -10%,
              rgba(245,200,66,0.1) 0%,
              transparent 70%
            )`,
            }}
          />
        </div>

        <div
          style={{
            position: "relative",
            zIndex: 2,
            width: isDesktop ? "min(400px, 92%)" : "min(280px, 85vw)",
            height: isDesktop ? "min(220px, 36vh)" : "min(180px, 30vh)",
            borderRadius: "50%",
            background: `
            repeating-linear-gradient(
              45deg,
              rgba(255,255,255,0.008) 0px,
              rgba(255,255,255,0.008) 1px,
              transparent 1px, transparent 8px
            ),
            #0D2B0D
          `,
            border: "10px solid #5C3A1A",
            boxShadow: `
            0 0 0 2px #8B5E3C,
            0 4px 24px rgba(0,0,0,0.7),
            inset 0 0 40px rgba(0,0,0,0.5)
          `,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: '"Cinzel Decorative", serif',
              fontSize: 48,
              color: "#F5C842",
              opacity: 0.06,
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            GP
          </div>

          <div
            style={{
              position: "relative",
              zIndex: 5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {showRollingUi ? (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  animation: "feltVibrate 0.15s ease-in-out infinite",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={`shake-${i}`}
                    style={{
                      width: dieSize,
                      height: dieSize,
                      borderRadius: 12,
                      background: "linear-gradient(135deg, #DC2626, #991B1B)",
                      border: "1.5px solid rgba(255,255,255,0.2)",
                      boxShadow: "2px 3px 8px rgba(0,0,0,0.6)",
                      animation: `diceShake 0.4s ease-in-out ${[0, 133, 266][i]}ms infinite`,
                      filter: "blur(0.5px)",
                    }}
                  />
                ))}
              </div>
            ) : dice && dice[0] > 0 ? (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {dice.map((value, i) => (
                  <DiceFace
                    key={`face-${i}`}
                    value={Math.max(1, Math.min(6, value)) as 1 | 2 | 3 | 4 | 5 | 6}
                    diceType={myDiceType || "standard"}
                    size={dieSize}
                    rolling={false}
                    delay={[0, 133, 266][i]}
                  />
                ))}
              </div>
            ) : null}
            {!showRollingUi && (!dice || dice[0] === 0) ? (
              <div
                style={{
                  color: "rgba(156,163,175,0.9)",
                  fontSize: 12,
                  fontFamily: "Courier New, monospace",
                  letterSpacing: "0.06em",
                  marginTop: 8,
                  textAlign: "center",
                }}
              >
                {!round ? "Waiting to start..." : "Waiting for roll..."}
              </div>
            ) : null}
          </div>

          <RollNameDisplay
            rollName={showRollingUi ? null : rollName}
            result={rollKind}
            onComplete={() => setRollName(null)}
          />
        </div>

        {bankerPlayer ? (
          <div
            style={{
              position: "absolute",
              top: isDesktop ? 4 : 8,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 3,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
            }}
          >
            <div
              style={{
                fontSize: 8,
                color: "#F5C842",
                fontFamily: "Courier New",
                letterSpacing: "0.1em",
                background: "rgba(245,200,66,0.15)",
                padding: "2px 8px",
                borderRadius: 10,
                border: "1px solid rgba(245,200,66,0.3)",
              }}
            >
              BANKER
            </div>
            <div
              style={{
                width: isDesktop ? 44 : 36,
                height: isDesktop ? 44 : 36,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                border: "2px solid #F5C842",
                boxShadow: "0 0 12px rgba(245,200,66,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: isDesktop ? 16 : 14,
                fontWeight: 700,
                color: "#fff",
              }}
            >
              {getInitial(bankerPlayer.user)}
            </div>
          </div>
        ) : null}

        <div
          style={{
            position: "absolute",
            bottom: isDesktop ? 6 : 8,
            left: 0,
            right: 0,
            zIndex: 3,
            display: "flex",
            justifyContent: "center",
            gap: isDesktop ? 6 : 8,
            padding: "0 10px",
            flexWrap: "wrap",
          }}
        >
          {Array.from({ length: Math.min(5, room.max_players) }, (_, i) => {
            const player = activePlayers.find((p) => p.seat_number === i + 1);
            const isActive = round?.status === "player_rolling" && player?.user_id === myUserId;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  width: isDesktop ? 44 : 36,
                }}
              >
                {player ? (
                  <>
                    <div
                      style={{
                        width: isDesktop ? 36 : 32,
                        height: isDesktop ? 36 : 32,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #4C1D95, #7C3AED)",
                        border: isActive ? "2px solid #F5C842" : "1.5px solid rgba(124,58,237,0.4)",
                        boxShadow: isActive ? "0 0 8px rgba(245,200,66,0.5)" : "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#fff",
                        animation: isActive ? "pulse 1s infinite" : "none",
                      }}
                    >
                      {getInitial(player.user)}
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: "#9CA3AF",
                        fontFamily: "Courier New",
                        maxWidth: 44,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textAlign: "center",
                      }}
                    >
                      {getName(player.user).slice(0, 6)}
                    </div>
                    <div style={{ fontSize: 9, color: "#F5C842", fontFamily: "Courier New" }}>
                      {celoPlayerStakeCents(player) > 0 ? `${celoPlayerStakeCents(player)}G` : "—"}
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        border: "1.5px dashed rgba(124,58,237,0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#7C3AED",
                        fontSize: 18,
                        cursor: myRole === "spectator" ? "pointer" : "default",
                        background: "transparent",
                      }}
                      onClick={() => {
                        if (myRole === "spectator") void handleJoinRound();
                      }}
                    >
                      +
                    </button>
                    <div style={{ fontSize: 9, color: "#4B5563", fontFamily: "Courier New" }}>OPEN</div>
                  </>
                )}
              </div>
            );
          })}
          {room.max_players > 5 ? (
            <div style={{ display: "flex", alignItems: "center", alignSelf: "center", paddingLeft: 4 }}>
              <span style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "Courier New", fontWeight: 700 }}>
                +{room.max_players - 5}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div
        style={{
          height: actionBarHeight,
          flexShrink: 0,
          background: "linear-gradient(180deg, rgba(8,4,24,0.98) 0%, rgba(5,1,15,0.99) 100%)",
          backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(124,58,237,0.22)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
          display: "flex",
          alignItems: "center",
          padding: isDesktop ? "6px 10px" : "0 12px",
          gap: isDesktop ? 8 : 10,
          zIndex: 55,
        }}
      >
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 0, justifyContent: "center" }}>
          <div style={{ fontSize: 9, color: "#6B7280", fontFamily: "Courier New", letterSpacing: "0.06em" }}>BALANCE</div>
          <div style={{ fontSize: 12, color: "#F5C842", fontFamily: "Courier New", fontWeight: 700 }}>
            {localeInt(myBalance)}
            <span style={{ fontSize: 9, marginLeft: 2 }}>GPC</span>
          </div>
          {isDesktop ? (
            <div style={{ fontSize: 9, color: "#6B7280", fontFamily: "Courier New" }}>{gpcToUsd(myBalance)}</div>
          ) : null}
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
          {myRole === "banker" && !round && roomAllowsNewRound ? (
            <div style={{ width: "100%" }}>
              <button
                type="button"
                onClick={() => void handleStartRound()}
                disabled={startRoundBusy || startRoundBlockReason !== null}
                style={{
                  width: "100%",
                  height: isDesktop ? 44 : 40,
                  background:
                    startRoundBusy || startRoundBlockReason !== null
                      ? "rgba(255,255,255,0.08)"
                      : "linear-gradient(135deg, #F5C842, #D4A017)",
                  border: "none",
                  borderRadius: 10,
                  color: startRoundBusy || startRoundBlockReason !== null ? "#6B7280" : "#0A0A0F",
                  fontSize: isDesktop ? 14 : 13,
                  fontWeight: 700,
                  cursor:
                    startRoundBusy || startRoundBlockReason !== null ? "not-allowed" : "pointer",
                  fontFamily: '"Cinzel Decorative", serif',
                  letterSpacing: "0.03em",
                  boxShadow:
                    startRoundBusy || startRoundBlockReason !== null
                      ? "none"
                      : "0 0 0 1px rgba(245,200,66,0.35), 0 6px 20px rgba(245,200,66,0.18)",
                }}
              >
                {startRoundBusy ? "STARTING…" : "🎲 START ROUND"}
              </button>
              {startRoundError || (startRoundBlockReason && startRoundBlockReason !== "Loading…") ? (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 10,
                    color: "#F87171",
                    fontFamily: "Courier New",
                    textAlign: "center",
                    lineHeight: 1.35,
                  }}
                >
                  {startRoundError ?? startRoundBlockReason}
                </div>
              ) : null}
            </div>
          ) : null}

          {myRole === "banker" && !round && !roomAllowsNewRound && room ? (
            <div
              style={{
                width: "100%",
                minHeight: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 8px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                color: "#9CA3AF",
                fontSize: 11,
                fontFamily: "Courier New",
                textAlign: "center",
              }}
            >
              {room.status === "rolling"
                ? "Round in progress (syncing…)"
                : `Cannot start — room is ${room.status}`}
            </div>
          ) : null}

          {canRoll() ? (
            <button
              type="button"
              onClick={() => void handleRoll()}
              disabled={rollingAction}
              style={{
                width: "100%",
                height: isDesktop ? 44 : 40,
                background: rollingAction ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #F5C842, #D4A017)",
                border: "none",
                borderRadius: 10,
                color: rollingAction ? "#6B7280" : "#0A0A0F",
                fontSize: 13,
                fontWeight: 700,
                cursor: rollingAction ? "not-allowed" : "pointer",
                fontFamily: '"Cinzel Decorative", serif',
                letterSpacing: "0.03em",
                boxShadow: !rollingAction ? "0 0 16px rgba(245,200,66,0.4)" : "none",
                animation: !rollingAction ? "goldPulse 1.5s infinite" : "none",
              }}
            >
              {rollingAction ? "ROLLING..." : "🎲 ROLL DICE"}
            </button>
          ) : null}

          {round && !canRoll() ? (
            <div
              style={{
                width: "100%",
                height: 40,
                background: "rgba(255,255,255,0.04)",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#6B7280",
                fontSize: 12,
                fontFamily: "Courier New",
              }}
            >
              {round.status === "banker_rolling"
                ? `${getName(bankerPlayer?.user)} rolling...`
                : round.status === "player_rolling"
                  ? "Players rolling..."
                  : "Waiting..."}
            </div>
          ) : null}

          {myRole === "player" && myEntry === 0 && (!round || round.status === "waiting") ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 6 }}>
                {(["MIN", "2×", "5×", "MAX"] as const).map((label, i) => {
                  const amounts = [
                    room.minimum_entry_sc,
                    room.minimum_entry_sc * 2,
                    room.minimum_entry_sc * 5,
                    room.current_bank_sc,
                  ];
                  const amt = amounts[i];
                  return (
                    <button
                      type="button"
                      key={label}
                      onClick={() => setEntryAmount(amt)}
                      style={{
                        flex: 1,
                        padding: "6px 0",
                        borderRadius: 6,
                        border: entryAmount === amt ? "1.5px solid #F5C842" : "1px solid rgba(124,58,237,0.3)",
                        background: entryAmount === amt ? "rgba(245,200,66,0.12)" : "transparent",
                        color: entryAmount === amt ? "#F5C842" : "#6B7280",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "Courier New",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => void handleJoinRound()}
                  disabled={entryAmount <= 0 || entryAmount > myBalance}
                  style={{
                    flex: 2,
                    height: 36,
                    background: entryAmount > myBalance ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #F5C842, #D4A017)",
                    border: "none",
                    borderRadius: 8,
                    color: entryAmount > myBalance ? "#6B7280" : "#0A0A0F",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "Courier New",
                  }}
                >
                  JOIN {localeInt(entryAmount)} GPC
                </button>
                {myBalance >= room.current_bank_sc ? (
                  <button
                    type="button"
                    onClick={() => void handleCoverBank()}
                    style={{
                      flex: 1,
                      height: 36,
                      background: "rgba(245,200,66,0.15)",
                      border: "1px solid rgba(245,200,66,0.4)",
                      borderRadius: 8,
                      color: "#F5C842",
                      fontSize: 9,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "Courier New",
                    }}
                  >
                    COVER BANK
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {myRole === "spectator" ? (
            <div
              style={{
                width: "100%",
                height: 44,
                background: "rgba(255,255,255,0.04)",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#6B7280",
                fontSize: 12,
                fontFamily: "Courier New",
              }}
            >
              SPECTATING — Tap + to join a seat
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setShowDiceShop(true)}
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            background: "rgba(124,58,237,0.15)",
            border: "1px solid rgba(124,58,237,0.35)",
            borderRadius: 10,
            color: "#A855F7",
            fontSize: 18,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          🎲
        </button>
      </div>
      </div>

      {!isDesktop ? (
        <>
      <div
        style={{
          height: tabBarHeight,
          flexShrink: 0,
          background: "rgba(5,1,15,0.97)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(124,58,237,0.12)",
          display: "flex",
          zIndex: 54,
        }}
      >
        {(
          [
            ["side", "🎰 SIDE"],
            ["chat", "💬 CHAT"],
          ] as [TabType, string][]
        ).map(([key, label]) => (
          <button
            type="button"
            key={key}
            onClick={() => onMobileTab(key)}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              borderBottom:
                activeTab === key && mobilePanelOpen ? "2px solid #F5C842" : "2px solid transparent",
              color: activeTab === key && mobilePanelOpen ? "#F5C842" : "#6B7280",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "Courier New",
              letterSpacing: "0.05em",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          maxHeight: mobilePanelOpen ? panelMax : 0,
          height: mobilePanelOpen ? panelMax : 0,
          flexShrink: 0,
          transition: "max-height 0.22s ease, height 0.22s ease",
          background: "rgba(13,5,32,0.98)",
          overflow: "hidden",
          borderTop: "1px solid rgba(124,58,237,0.08)",
          zIndex: 53,
        }}
      >
        <button
          type="button"
          aria-label="Close panel"
          onClick={() => setMobilePanelOpen(false)}
          style={{
            height: 14,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <span
            style={{
              width: 32,
              height: 4,
              borderRadius: 999,
              background: "rgba(156,163,175,0.45)",
              display: "block",
            }}
          />
        </button>
        <div style={{ height: "calc(100% - 14px)", overflow: "hidden" }}>
          {activeTab === "side" ? sidePanelInner : chatPanelInner}
        </div>
      </div>
        </>
      ) : null}

      </div>

      {isDesktop ? (
        <div
          style={{
            flex: "0 0 clamp(280px, 30%, 380px)",
            minWidth: 0,
            minHeight: 0,
            maxWidth: 400,
            display: "flex",
            flexDirection: "column",
            borderRadius: 14,
            border: "1px solid rgba(124,58,237,0.28)",
            background: "linear-gradient(180deg, rgba(14,6,36,0.98) 0%, rgba(5,1,15,0.99) 100%)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              flex: "0 1 38%",
              minHeight: 118,
              maxHeight: 280,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              borderBottom: "1px solid rgba(124,58,237,0.15)",
            }}
          >
            {sidePanelInner}
          </div>
          <div
            style={{
              flex: "1 1 62%",
              minHeight: 160,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {chatPanelInner}
          </div>
        </div>
      ) : null}

      </div>

      {showLowerBank ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end" }}>
          <div style={{ width: "100%", background: "#0D0520", borderTop: "2px solid #F5C842", borderRadius: "20px 20px 0 0", padding: 24 }}>
            <h3 style={{ fontFamily: '"Cinzel Decorative", serif', color: "#F5C842", fontSize: 18, margin: "0 0 6px" }}>Lower Your Bank?</h3>
            <div style={{ color: "#6B7280", fontSize: 12, fontFamily: "Courier New", marginBottom: 16 }}>Available for: {lowerBankCountdown}s</div>
            <div style={{ height: 4, background: "rgba(245,200,66,0.2)", borderRadius: 2, marginBottom: 20, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(lowerBankCountdown / 60) * 100}%`, background: "#F5C842", transition: "width 1s linear" }} />
            </div>
            <div style={{ fontSize: 13, color: "#9CA3AF", fontFamily: "Courier New", marginBottom: 12 }}>
              Current bank: <span style={{ color: "#F5C842" }}>{localeInt(room.current_bank_sc)} GPC</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {[room.minimum_entry_sc, room.minimum_entry_sc * 2, room.minimum_entry_sc * 5, Math.floor(room.current_bank_sc / 2)]
                .filter(
                  (v) =>
                    v < room.current_bank_sc && v >= room.minimum_entry_sc && v % room.minimum_entry_sc === 0
                )
                .map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => setNewBankAmount(v)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: newBankAmount === v ? "2px solid #F5C842" : "1px solid rgba(124,58,237,0.3)",
                      background: newBankAmount === v ? "rgba(245,200,66,0.1)" : "transparent",
                      color: newBankAmount === v ? "#F5C842" : "#6B7280",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "Courier New",
                    }}
                  >
                    {localeInt(v)} GPC
                  </button>
                ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowLowerBank(false)}
                style={{
                  flex: 1,
                  padding: "14px",
                  borderRadius: 10,
                  background: "transparent",
                  border: "1px solid rgba(124,58,237,0.3)",
                  color: "#6B7280",
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "Courier New",
                }}
              >
                KEEP SAME
              </button>
              <button
                type="button"
                onClick={() => void handleLowerBank()}
                disabled={newBankAmount <= 0 || newBankAmount >= room.current_bank_sc}
                style={{
                  flex: 2,
                  padding: "14px",
                  borderRadius: 10,
                  background:
                    newBankAmount > 0 && newBankAmount < room.current_bank_sc
                      ? "linear-gradient(135deg, #F5C842, #D4A017)"
                      : "rgba(255,255,255,0.08)",
                  border: "none",
                  color: newBankAmount > 0 && newBankAmount < room.current_bank_sc ? "#0A0A0F" : "#6B7280",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: '"Cinzel Decorative", serif',
                }}
              >
                CONFIRM LOWER BANK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showBecomeBanker ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "flex-end" }}>
          <div
            style={{
              width: "100%",
              background: "#0D0520",
              borderTop: "2px solid #F5C842",
              borderRadius: "20px 20px 0 0",
              padding: 24,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎲</div>
            <h3 style={{ fontFamily: '"Cinzel Decorative", serif', color: "#F5C842", fontSize: 22, margin: "0 0 8px" }}>YOU ROLLED C-LO!</h3>
            <div style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 16 }}>Do you want to become the Banker?</div>
            <div style={{ color: "#6B7280", fontSize: 13, fontFamily: "Courier New", marginBottom: 8 }}>
              You need <span style={{ color: "#F5C842" }}>{localeInt(room.current_bank_sc)} GPC</span> to take the bank
            </div>
            <div
              style={{
                fontSize: 13,
                fontFamily: "Courier New",
                marginBottom: 4,
                color: myBalance >= room.current_bank_sc ? "#10B981" : "#EF4444",
              }}
            >
              You have: {localeInt(myBalance)} GPC {myBalance >= room.current_bank_sc ? "✓" : "✗"}
            </div>
            <div style={{ height: 4, background: "rgba(245,200,66,0.2)", borderRadius: 2, margin: "16px 0", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(bankerCountdown / 30) * 100}%`, background: "#F5C842", transition: "width 1s linear" }} />
            </div>
            <div style={{ color: "#6B7280", fontSize: 12, fontFamily: "Courier New", marginBottom: 20 }}>{bankerCountdown} seconds to decide</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowBecomeBanker(false)}
                style={{
                  flex: 1,
                  padding: "14px",
                  borderRadius: 10,
                  background: "transparent",
                  border: "1px solid rgba(124,58,237,0.3)",
                  color: "#6B7280",
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "Courier New",
                }}
              >
                NO THANKS
              </button>
              <button
                type="button"
                onClick={() => void handleBecomeBanker()}
                disabled={myBalance < room.current_bank_sc}
                style={{
                  flex: 2,
                  padding: "14px",
                  borderRadius: 10,
                  background: myBalance >= room.current_bank_sc ? "linear-gradient(135deg, #F5C842, #D4A017)" : "rgba(255,255,255,0.08)",
                  border: "none",
                  color: myBalance >= room.current_bank_sc ? "#0A0A0F" : "#6B7280",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: myBalance >= room.current_bank_sc ? "pointer" : "not-allowed",
                  fontFamily: '"Cinzel Decorative", serif',
                }}
              >
                BECOME BANKER
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDiceShop ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#0D0520",
              border: "1px solid rgba(124,58,237,0.3)",
              borderRadius: 20,
              padding: 24,
              width: "100%",
              maxWidth: 360,
              maxHeight: "80vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontFamily: '"Cinzel Decorative", serif', color: "#F5C842", fontSize: 16, margin: 0 }}>UPGRADE YOUR DICE</h3>
              <button
                type="button"
                onClick={() => setShowDiceShop(false)}
                style={{ background: "none", border: "none", color: "#6B7280", fontSize: 22, cursor: "pointer" }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {(
                [
                  ["standard", "Standard", 0],
                  ["street", "Street", 100],
                  ["midnight", "Midnight", 100],
                  ["gold", "Gold", 100],
                  ["blood", "Blood", 150],
                  ["fire", "Fire", 150],
                  ["diamond", "Diamond", 200],
                ] as [DiceType, string, number][]
              ).map(([type, name, cost]) => (
                <div
                  key={type}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (cost === 0 || myBalance >= cost) setMyDiceType(type);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      if (cost === 0 || myBalance >= cost) setMyDiceType(type);
                    }
                  }}
                  style={{
                    background: myDiceType === type ? "rgba(245,200,66,0.1)" : "rgba(255,255,255,0.03)",
                    border: myDiceType === type ? "1.5px solid #F5C842" : "1px solid rgba(124,58,237,0.2)",
                    borderRadius: 10,
                    padding: "12px 8px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                  }}
                >
                  <DiceFace value={6} diceType={type} size={44} rolling={false} />
                  <div style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Courier New", textAlign: "center" }}>{name}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: cost === 0 ? "#10B981" : "#F5C842",
                      fontFamily: "Courier New",
                      fontWeight: 700,
                    }}
                  >
                    {cost === 0 ? "FREE" : `${cost} GPC`}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ color: "#6B7280", fontSize: 11, fontFamily: "Courier New", textAlign: "center", marginBottom: 16 }}>
              Your balance: <span style={{ color: "#F5C842" }}>{localeInt(myBalance)} GPC</span>
            </div>

            <button
              type="button"
              onClick={() => setShowDiceShop(false)}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 10,
                background: "linear-gradient(135deg, #F5C842, #D4A017)",
                border: "none",
                color: "#0A0A0F",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: '"Cinzel Decorative", serif',
              }}
            >
              DONE
            </button>
          </div>
        </div>
      ) : null}

      <style>{`
        @keyframes diceShake {
          0%   { transform: rotate(0deg) scale(1) }
          10%  { transform: rotate(-15deg) scale(0.95) }
          20%  { transform: rotate(15deg) scale(1.05) }
          30%  { transform: rotate(-10deg) scale(0.98) }
          40%  { transform: rotate(10deg) scale(1.02) }
          50%  { transform: rotate(-8deg) scale(0.99) }
          60%  { transform: rotate(8deg) scale(1.01) }
          70%  { transform: rotate(-5deg) scale(1) }
          80%  { transform: rotate(5deg) scale(1) }
          90%  { transform: rotate(-2deg) scale(1) }
          100% { transform: rotate(0deg) scale(1) }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1 }
          50% { opacity: 0.4 }
        }
        @keyframes goldPulse {
          0%, 100% {
            box-shadow: 0 0 8px rgba(245,200,66,0.3)
          }
          50% {
            box-shadow: 0 0 20px rgba(245,200,66,0.6)
          }
        }
        @keyframes feltVibrate {
          0%, 100% { transform: translateY(0) }
          25% { transform: translateY(-1px) }
          75% { transform: translateY(1px) }
        }
      `}</style>
    </div>
  );
}
