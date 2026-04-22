"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Cinzel_Decorative, DM_Sans } from "next/font/google";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";
import { gpcToUsdDisplay } from "@/lib/coins";
import DiceFace, { type DiceType } from "@/components/celo/DiceFace";
import RollNameDisplay from "@/components/celo/RollNameDisplay";

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
  const [panelOpen, setPanelOpen] = useState(false);
  const [chat, setChat] = useState("");
  const [messages, setMessages] = useState<
    { id: string; user_id: string; message: string; created_at: string }[]
  >([]);

  const fetchAll = useCallback(async () => {
    if (!supabase || !roomId) return;
    const [
      { data: r },
      { data: p },
      { data: activeRounds },
      { data: ch },
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
    ]);
    if (r) setRoom(r as Room);
    setPlayers((p as Player[]) ?? []);
    const ar = (activeRounds as Round[] | null) ?? [];
    setRound(ar[0] ?? null);
    setMessages(
      (ch as { id: string; user_id: string; message: string; created_at: string }[]) ?? []
    );
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
    })();
  }, [router, roomId, supabase, fetchAll]);

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
        () => void fetchAll()
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
          void fetchAll();
          const n = payload.new as { status?: string } | null;
          if (n?.status === "banker_rolling") {
            setDice(null);
            setRollName(null);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "celo_chat", filter: `room_id=eq.${roomId}` },
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
  const canRoll = !!(
    room &&
    round &&
    inProgress &&
    ((round.status === "banker_rolling" && isBanker) ||
      (round.status === "player_rolling" && isPlayer && (myRow?.entry_sc ?? 0) > 0))
  );
  const mustStart = !!(room && isBanker && !inProgress);

  async function handleStart() {
    if (!room) return;
    setRollingAction(true);
    try {
      const res = await fetch("/api/celo/round/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ room_id: room.id }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert((j as { error?: string }).error ?? "Start failed");
        return;
      }
      await fetchAll();
    } finally {
      setRollingAction(false);
    }
  }

  async function handleRoll() {
    if (!room || !round || rollingAction) return;
    setRollingAction(true);
    setRolling(true);
    setRollName(null);
    setDice(null);
    const wait = new Promise((r) => setTimeout(r, 2200));
    const [res] = await Promise.all([
      fetch("/api/celo/round/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ room_id: room.id, round_id: round.id }),
      }),
      wait,
    ]);
    setRolling(false);
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
      alert(j.error ?? "Roll failed");
      setRollingAction(false);
      return;
    }
    if (j.dice?.length === 3) {
      setDice([j.dice[0], j.dice[1], j.dice[2]]);
    }
    if (j.rollName) {
      setTimeout(() => setRollName(j.rollName ?? null), 300);
    }
    if (typeof j.newBalance === "number") setMyBalance(j.newBalance);
    if (j.canLowerBank) setShowLower(true);
    if (j.player_can_become_banker) setShowBanker(true);
    await fetchAll();
    setTimeout(() => setRollName(null), 2800);
    setRollingAction(false);
  }

  async function handleJoin() {
    if (!room) return;
    const res = await fetch("/api/celo/room/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        room_id: room.id,
        role: "player",
        entry_sc: entryAmount,
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      alert((j as { error?: string }).error ?? "Join failed");
      return;
    }
    await fetchAll();
    if (typeof (j as { room?: { current_bank_sc?: number } }).room === "object") {
      setMyBalance((b) => b);
    }
  }

  const diceSize = 48;
  const spectators = players.filter((p) => p.role === "spectator").length;

  return (
    <div
      className={`flex h-full min-h-0 w-full flex-col text-white ${dm.className}`}
      style={{ background: "#05010F" }}
    >
      <header
        className="flex h-12 shrink-0 items-center gap-2 border-b px-3"
        style={{
          background: "rgba(5,1,15,0.97)",
          borderColor: "rgba(124,58,237,0.2)",
        }}
      >
        <Link
          href="/dashboard/games/celo"
          className="shrink-0 min-h-touch rounded px-2 text-lg"
          style={{ color: "#F5C842" }}
        >
          ←
        </Link>
        <span className={`truncate text-[13px] text-white ${cinzel.className}`}>
          {room?.name?.slice(0, 20) ?? "…"}
        </span>
        <div className="ml-auto font-mono text-[11px] text-[#9CA3AF]">
          {round ? `R${round.round_number}` : ""}
        </div>
        <span
          className="font-mono text-[10px] uppercase"
          style={{
            color: connection === "live" ? "#10B981" : connection === "offline" ? "#EF4444" : "#F59E0B",
          }}
        >
          {connection === "live" ? "● live" : connection}
        </span>
        <span className="font-mono text-[10px] text-[#6B7280]">👁 {spectators}</span>
      </header>
      <div
        className="flex h-[52px] shrink-0 items-center border-b px-3"
        style={{
          background: "rgba(13,5,32,0.95)",
          borderColor: "rgba(245,200,66,0.1)",
        }}
      >
        <div className="flex-1" />
        <div className="text-center">
          <div
            className="font-mono text-[9px] tracking-wider"
            style={{ color: "#F5C842" }}
          >
            PRIZE POOL
          </div>
          <div
            className="font-mono text-sm font-bold text-white"
            style={{ fontFamily: "ui-monospace, 'Courier New', monospace" }}
          >
            {prize.toLocaleString()} GPC
          </div>
          <div className="text-[10px] text-[#6B7280]">{gpcToUsdDisplay(prize)}</div>
        </div>
        <div className="flex-1 text-right">
          <div className="font-mono text-[9px] text-[#6B7280]">BANK</div>
          <div
            className="font-mono text-sm font-bold"
            style={{ color: "#F5C842", fontFamily: "ui-monospace, 'Courier New', monospace" }}
          >
            {room ? bankVal(room).toLocaleString() : 0} GPC
          </div>
          {isBanker && room?.last_round_was_celo && (
            <button
              type="button"
              onClick={() => {
                setLowerAmt(clamp(bankVal(room) - minE, minE, bankVal(room)));
                setShowLower(true);
              }}
              className="text-[9px] font-mono text-[#F5C842] underline"
            >
              LOWER ↓
            </button>
          )}
        </div>
      </div>
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            zIndex: 0,
            background: "#05010F",
            boxShadow: "inset 0 0 0 0 transparent",
          }}
        />
        <div
          className="absolute left-0 top-0 h-full w-0.5"
          style={{
            zIndex: 0,
            background: "#7C3AED",
            boxShadow: "0 0 10px #7C3AED",
          }}
        />
        <div
          className="absolute right-0 top-0 h-full w-0.5"
          style={{
            zIndex: 0,
            background: "#F5C842",
            boxShadow: "0 0 10px #F5C842",
          }}
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 h-1 w-full"
          style={{ background: "#10B981", boxShadow: "0 0 10px #10B981" }}
        />
        <div
          className="relative z-10"
          style={{
            width: "min(280px, 90vw)",
            minHeight: 200,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="relative"
            style={{
              width: "min(260px, 82vw)",
              height: 168,
              borderRadius: "50%",
              background: "#0A2010",
              border: "8px solid #5C3A1A",
              boxShadow:
                "0 0 0 2px #8B5E3C, 0 8px 32px rgba(0,0,0,0.7), inset 0 0 40px rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              className={`absolute ${cinzel.className} select-none pointer-events-none`}
              style={{ fontSize: 44, color: "#F5C842", opacity: 0.05 }}
            >
              GP
            </span>
            <div className="relative z-[5] flex items-center justify-center gap-2">
              {dice && dice[0] > 0
                ? [0, 1, 2].map((i) => (
                    <DiceFace
                      key={i}
                      value={clamp(dice[i], 1, 6) as 1 | 2 | 3 | 4 | 5 | 6}
                      diceType={myDiceType}
                      size={diceSize}
                      rolling={rolling}
                      delay={[0, 133, 266][i]}
                    />
                  ))
                : rolling
                  ? [0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="animate-pulse"
                        style={{
                          width: diceSize,
                          height: diceSize,
                          borderRadius: diceSize * 0.16,
                          background: "linear-gradient(135deg,#DC2626,#991B1B)",
                          flexShrink: 0,
                        }}
                      />
                    ))
                  : (
                      <span
                        className="font-mono text-[11px] tracking-widest"
                        style={{ color: "rgba(255,255,255,0.15)" }}
                      >
                        {round ? "WAITING…" : ""}
                      </span>
                    )}
            </div>
            <RollNameDisplay
              rollName={rollName}
              onComplete={() => setRollName(null)}
            />
          </div>
        </div>
      </div>
      <div
        className="flex h-[52px] shrink-0 items-center gap-2 border-t px-2"
        style={{
          background: "rgba(5,1,15,0.97)",
          borderColor: "rgba(124,58,237,0.2)",
        }}
      >
        <div className="shrink-0 min-w-0 text-[10px] text-[#6B7280]">
          BALANCE
          <div
            className="font-mono text-xs font-bold"
            style={{ color: "#F5C842" }}
          >
            {myBalance.toLocaleString()} GPC
          </div>
          <div className="text-[9px] text-[#6B7280]">
            {gpcToUsdDisplay(myBalance)}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
          {canRoll ? (
            <button
              type="button"
              disabled={rollingAction}
              onClick={() => void handleRoll()}
              className={`w-full min-h-[40px] max-w-xs rounded-lg px-4 text-[13px] font-bold text-[#0A0A0A] ${cinzel.className}`}
              style={{
                background: "linear-gradient(135deg, #F5C842, #D4A017)",
                boxShadow: "0 0 16px rgba(245,200,66,0.3)",
                opacity: rollingAction ? 0.6 : 1,
              }}
            >
              🎲 Roll
            </button>
          ) : null}
          {mustStart && isBanker && !canRoll && (
            <button
              type="button"
              disabled={
                rollingAction || !players.some((p) => p.role === "player" && p.entry_sc > 0)
              }
              onClick={() => void handleStart()}
              className={`w-full min-h-[40px] max-w-xs rounded-lg px-4 text-[13px] font-bold text-[#0A0A0A] ${cinzel.className}`}
              style={{
                background: "linear-gradient(135deg, #F5C842, #D4A017)",
                opacity: rollingAction ? 0.6 : 1,
              }}
            >
              🎲 Start round
            </button>
          )}
          {room &&
            !inProgress &&
            !isBanker &&
            (myRow?.entry_sc ?? 0) === 0 &&
            !isSpec && (
            <div className="mt-1 flex w-full max-w-sm flex-col gap-1">
              <div className="flex flex-wrap justify-center gap-1">
                {[minE, minE * 2, minE * 5, bankVal(room)]
                  .filter((x, i, a) => x > 0 && a.indexOf(x) === i)
                  .map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setEntryAmount(amt)}
                      className="min-h-[36px] rounded border px-2 text-xs"
                      style={{
                        borderColor: entryAmount === amt ? "#F5C842" : "rgba(124,58,237,0.4)",
                        background: entryAmount === amt ? "rgba(245,200,66,0.2)" : "transparent",
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
                className="w-full min-h-[40px] font-bold"
                style={{
                  background: "linear-gradient(135deg, #F5C842, #D4A017)",
                  color: "#0A0A0A",
                  borderRadius: 8,
                }}
              >
                {!myRow ? "Join" : "Post"} {entryAmount} GPC
              </button>
            </div>
          )}
          {isSpec && <div className="text-center text-xs text-[#6B7280]">Spectating</div>}
        </div>
        <button
          type="button"
          onClick={() => setDiceModal(true)}
          className="shrink-0 h-9 w-9 rounded border text-sm"
          style={{ borderColor: "rgba(124,58,237,0.35)", background: "rgba(124,58,237,0.12)" }}
          aria-label="Dice"
        >
          🎲
        </button>
      </div>
      <div
        className="grid h-9 shrink-0 border-t text-xs md:hidden"
        style={{
          background: "rgba(5,1,15,0.97)",
          borderColor: "rgba(124,58,237,0.1)",
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
        className="shrink-0 overflow-hidden border-t transition-[height] duration-200 md:hidden"
        style={{
          background: "rgba(13,5,32,0.98)",
          height: panelOpen ? 120 : 0,
          borderColor: "rgba(124,58,237,0.1)",
        }}
      >
        {sideTab === "side" && (
          <p className="p-2 text-center text-xs text-[#6B7280]">Side entries: use the API or expand later</p>
        )}
        {sideTab === "chat" && (
          <div className="flex h-full flex-col p-2">
            <div
              className="min-h-0 flex-1 overflow-y-auto text-xs"
              style={{ maxHeight: 64 }}
            >
              {messages.map((m) => (
                <div key={m.id} className="text-[#9CA3AF]">
                  <span className="text-[#A855F7]">{(m.user_id ?? "").slice(0, 4)}</span>{" "}
                  {m.message}
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1">
              <input
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                className="min-h-[36px] min-w-0 flex-1 rounded border px-2"
                style={{
                  borderColor: "rgba(124,58,237,0.3)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#fff",
                }}
                placeholder="Message…"
              />
              <button
                type="button"
                className="shrink-0 min-h-[36px] rounded px-2 text-xs font-bold"
                style={{ background: "#7C3AED", color: "#fff" }}
                onClick={async () => {
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
              >
                Send
              </button>
            </div>
          </div>
        )}
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
                  const res = await fetch("/api/celo/room/lower-bank", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                      room_id: room.id,
                      new_bank_sc: lowerAmt,
                    }),
                  });
                  if (res.ok) {
                    setShowLower(false);
                    void fetchAll();
                  } else {
                    const j = await res.json();
                    alert((j as { error?: string }).error);
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
                onClick={() => setShowLower(false)}
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
            <p className="mt-1 text-sm text-[#9CA3AF]">
              Cover {bankVal(room).toLocaleString()} GPC
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const res = await fetch("/api/celo/banker/accept", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                      room_id: room.id,
                      round_id: round?.id,
                    }),
                  });
                  if (res.ok) {
                    setShowBanker(false);
                    void fetchAll();
                  } else {
                    const j = await res.json();
                    alert((j as { error?: string }).error);
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
              <button type="button" onClick={() => setShowBanker(false)} className="text-[#6B7280]">
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
