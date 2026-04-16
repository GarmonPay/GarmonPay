"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import DiceFace from "@/components/celo/DiceFace";
import RollNameDisplay, { type RollResultKind } from "@/components/celo/RollNameDisplay";

interface Player {
  id: string;
  user_id: string;
  role: "banker" | "player" | "spectator";
  seat_number: number;
  entry_sc: number;
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

type TabType = "side" | "chat" | "voice";

function parseRollResultKind(s: string | null): RollResultKind {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("no_count") || t.includes("reroll")) return "no_count";
  if (t.includes("point")) return "point";
  if (t.includes("loss") || t === "loss") return "instant_loss";
  if (t.includes("win") || t === "instant_win") return "instant_win";
  return null;
}

function clampDie(n: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (!Number.isFinite(n)) return 1;
  const x = Math.min(6, Math.max(1, Math.round(n)));
  return x as 1 | 2 | 3 | 4 | 5 | 6;
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
  const [dice, setDice] = useState<[number, number, number]>([1, 1, 1]);
  const [rollName, setRollName] = useState<string | null>(null);
  const [rollResult, setRollResult] = useState<string | null>(null);
  const rollingRef = useRef(false);

  const [activeTab, setActiveTab] = useState<TabType>("chat");
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
      if (r0.banker_dice && r0.banker_dice.length === 3) {
        setDice([r0.banker_dice[0]!, r0.banker_dice[1]!, r0.banker_dice[2]!]);
        setRollName(r0.banker_roll_name);
      }
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

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      if (cancelled) return;
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
          (p) => {
            if (p.new) setRoom(p.new as Room);
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
            if (p.new) setRound(p.new as Round);
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
          if (status === "SUBSCRIBED") setConnectionStatus("live");
          else if (status === "CLOSED" || status === "CHANNEL_ERROR") setConnectionStatus("offline");
        });
    };

    void init();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, router, roomId, fetchAll, triggerAnimation]);

  useEffect(() => {
    const me = players.find((p) => p.user_id === myUserId);
    if (me) {
      setMyRole(me.role);
      setMyEntry(me.entry_sc || 0);
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

  const handleStartRound = async () => {
    const res = await fetch("/api/celo/round/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ room_id: roomId }),
    });
    if (res.ok) await fetchAll();
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
    const msg = chatInput.trim();
    setChatInput("");
    await supabase.from("celo_chat").insert({
      room_id: roomId,
      user_id: myUserId,
      message: msg,
      is_system: false,
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

  const tabHeight = 44;
  const actionBarHeight = 64;

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

  const rollKind = parseRollResultKind(rollResult);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#05010F",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <div
        style={{
          height: 56,
          flexShrink: 0,
          background: "rgba(5,1,15,0.97)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(124,58,237,0.2)",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 12,
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
        <div style={{ fontFamily: "Courier New", color: "#F5C842", fontSize: 12, whiteSpace: "nowrap" }}>
          {round ? `ROUND ${round.round_number}` : "—"}
        </div>
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
        <div style={{ fontSize: 11, color: "#6B7280", fontFamily: "Courier New", whiteSpace: "nowrap" }}>
          👁 {spectatorCount}
        </div>
      </div>

      <div
        style={{
          height: 72,
          flexShrink: 0,
          background: "linear-gradient(135deg, rgba(13,5,32,0.95), rgba(30,10,60,0.95))",
          borderBottom: "1px solid rgba(245,200,66,0.12)",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 0,
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
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
                fontSize: 12,
                color: "#fff",
                fontFamily: "Courier New",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 80,
              }}
            >
              {getName(bankerPlayer?.user)}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ fontSize: 9, color: "#F5C842", fontFamily: "Courier New", letterSpacing: "0.08em" }}>PRIZE POOL</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: "Courier New" }}>
            {(round?.prize_pool_sc || 0).toLocaleString()}
            <span style={{ fontSize: 10, color: "#F5C842", marginLeft: 3 }}>GPC</span>
          </div>
          <div style={{ fontSize: 10, color: "#6B7280", fontFamily: "Courier New" }}>({gpcToUsd(round?.prize_pool_sc || 0)})</div>
          {round?.bank_covered ? (
            <div style={{ fontSize: 9, color: "#F5C842", fontFamily: "Courier New", letterSpacing: "0.05em" }}>🔒 COVERED</div>
          ) : null}
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <div style={{ fontSize: 9, color: "#6B7280", fontFamily: "Courier New", letterSpacing: "0.08em" }}>BANK</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#F5C842", fontFamily: "Courier New" }}>
            {room.current_bank_sc.toLocaleString()}
            <span style={{ fontSize: 10, color: "#D4A017", marginLeft: 3 }}>GPC</span>
          </div>
          <div style={{ fontSize: 10, color: "#6B7280", fontFamily: "Courier New" }}>({gpcToUsd(room.current_bank_sc)})</div>
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
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
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
            width: "min(320px, 90vw)",
            height: "clamp(160px, 25vw, 240px)",
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
              display: "flex",
              gap: 12,
              position: "relative",
              zIndex: 5,
              animation: rolling ? "feltVibrate 0.15s ease-in-out infinite" : "none",
            }}
          >
            {([0, 1, 2] as const).map((i) => (
              <DiceFace
                key={i}
                value={clampDie(dice[i] ?? 1)}
                diceType={myDiceType}
                size={typeof window !== "undefined" && window.innerWidth < 400 ? 56 : 68}
                rolling={rolling}
                delay={[0, 133, 266][i]}
              />
            ))}
          </div>

          <RollNameDisplay
            rollName={rollName}
            result={rollKind}
            onComplete={() => setRollName(null)}
          />
        </div>

        {bankerPlayer ? (
          <div
            style={{
              position: "absolute",
              top: 8,
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
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                border: "2px solid #F5C842",
                boxShadow: "0 0 12px rgba(245,200,66,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
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
            bottom: 8,
            left: 0,
            right: 0,
            zIndex: 3,
            display: "flex",
            justifyContent: "center",
            gap: 10,
            padding: "0 12px",
            flexWrap: "wrap",
          }}
        >
          {Array.from({ length: room.max_players }, (_, i) => {
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
                  width: 44,
                }}
              >
                {player ? (
                  <>
                    <div
                      style={{
                        width: 36,
                        height: 36,
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
                      {player.entry_sc > 0 ? `${player.entry_sc}G` : "—"}
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
        </div>
      </div>

      <div
        style={{
          height: actionBarHeight,
          flexShrink: 0,
          background: "rgba(5,1,15,0.97)",
          backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(124,58,237,0.2)",
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          gap: 10,
          zIndex: 55,
        }}
      >
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{ fontSize: 9, color: "#6B7280", fontFamily: "Courier New", letterSpacing: "0.06em" }}>BALANCE</div>
          <div style={{ fontSize: 13, color: "#F5C842", fontFamily: "Courier New", fontWeight: 700 }}>
            {myBalance.toLocaleString()}
            <span style={{ fontSize: 9, marginLeft: 2 }}>GPC</span>
          </div>
          <div style={{ fontSize: 9, color: "#6B7280", fontFamily: "Courier New" }}>{gpcToUsd(myBalance)}</div>
        </div>

        <div style={{ flex: 1 }}>
          {myRole === "banker" && !round ? (
            <button
              type="button"
              onClick={() => void handleStartRound()}
              disabled={activePlayers.filter((p) => p.entry_sc > 0).length === 0}
              style={{
                width: "100%",
                height: 44,
                background:
                  activePlayers.filter((p) => p.entry_sc > 0).length === 0
                    ? "rgba(255,255,255,0.08)"
                    : "linear-gradient(135deg, #F5C842, #D4A017)",
                border: "none",
                borderRadius: 10,
                color: activePlayers.filter((p) => p.entry_sc > 0).length === 0 ? "#6B7280" : "#0A0A0F",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: '"Cinzel Decorative", serif',
                letterSpacing: "0.03em",
              }}
            >
              🎲 START ROUND
            </button>
          ) : null}

          {canRoll() ? (
            <button
              type="button"
              onClick={() => void handleRoll()}
              disabled={rollingAction}
              style={{
                width: "100%",
                height: 44,
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
                  JOIN {entryAmount.toLocaleString()} GPC
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
            width: 44,
            height: 44,
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

      <div
        style={{
          height: tabHeight,
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
            ["voice", "🎤 VOICE"],
          ] as [TabType, string][]
        ).map(([key, label]) => (
          <button
            type="button"
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              borderBottom: activeTab === key ? "2px solid #F5C842" : "2px solid transparent",
              color: activeTab === key ? "#F5C842" : "#6B7280",
              fontSize: 11,
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
          height: 220,
          flexShrink: 0,
          background: "rgba(13,5,32,0.98)",
          overflow: "hidden",
          borderTop: "1px solid rgba(124,58,237,0.08)",
          zIndex: 53,
        }}
      >
        {activeTab === "side" ? (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "10px 12px", gap: 8, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "Courier New", letterSpacing: "0.08em" }}>SIDE ENTRIES</div>
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
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {sideBets.length === 0 ? (
                <div style={{ textAlign: "center", color: "#4B5563", fontSize: 12, fontFamily: "Courier New", padding: "20px 0" }}>
                  No open side entries
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
        ) : null}

        {activeTab === "chat" ? (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: msg.is_system ? "block" : "flex",
                    gap: 8,
                    textAlign: msg.is_system ? "center" : "left",
                  }}
                >
                  {msg.is_system ? (
                    <div style={{ fontSize: 11, color: "#F5C842", fontFamily: "Courier New", letterSpacing: "0.03em" }}>{msg.message}</div>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: "6px 12px", borderTop: "1px solid rgba(124,58,237,0.1)", display: "flex", gap: 6, flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 4, marginRight: 4 }}>
                {["🔥", "😂", "💀", "🎲", "💰"].map((e) => (
                  <button
                    type="button"
                    key={e}
                    onClick={async () => {
                      await supabase.from("celo_chat").insert({
                        room_id: roomId,
                        user_id: myUserId,
                        message: e,
                        is_system: false,
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
                onChange={(e) => setChatInput(e.target.value.slice(0, 200))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSendChat();
                }}
                placeholder="Say something..."
                style={{
                  flex: 1,
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
            </div>
          </div>
        ) : null}

        {activeTab === "voice" ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 32 }}>🎤</div>
            <div style={{ fontFamily: '"Cinzel Decorative", serif', color: "#F5C842", fontSize: 14 }}>VOICE CHAT</div>
            <div style={{ color: "#6B7280", fontSize: 12, fontFamily: "Courier New", textAlign: "center" }}>
              Voice coming soon. Use chat to communicate.
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
              Current bank: <span style={{ color: "#F5C842" }}>{room.current_bank_sc.toLocaleString()} GPC</span>
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
                    {v.toLocaleString()} GPC
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
              You need <span style={{ color: "#F5C842" }}>{room.current_bank_sc.toLocaleString()} GPC</span> to take the bank
            </div>
            <div
              style={{
                fontSize: 13,
                fontFamily: "Courier New",
                marginBottom: 4,
                color: myBalance >= room.current_bank_sc ? "#10B981" : "#EF4444",
              }}
            >
              You have: {myBalance.toLocaleString()} GPC {myBalance >= room.current_bank_sc ? "✓" : "✗"}
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
              Your balance: <span style={{ color: "#F5C842" }}>{myBalance.toLocaleString()} GPC</span>
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
