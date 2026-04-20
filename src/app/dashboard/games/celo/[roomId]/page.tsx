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

type Room = Record<string, unknown> & { id: string; name?: string; banker_id?: string; status?: string };
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
  const [tab, setTab] = useState<"side" | "chat">("chat");
  const [panelOpen, setPanelOpen] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{ id: string; message: string; user_id: string; created_at: string }[]>([]);

  const [joinEntry, setJoinEntry] = useState(500);
  const [busy, setBusy] = useState(false);

  const minEntry = Math.floor(Number(room?.minimum_entry_sc ?? room?.min_bet_cents ?? 500));
  const bank = Math.floor(Number(room?.current_bank_sc ?? room?.current_bank_cents ?? 0));

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
      .select("id,message,user_id,created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(15);
    setMessages((ch ?? []).reverse());

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
    void loadAll();
  }, [loadAll]);

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
  const inRoom = Boolean(mePlayer);

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
    });
    if (!sErr) {
      setChatInput("");
      void loadAll();
    }
  }

  if (!room && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white" style={{ backgroundColor: "#05010F" }}>
        <p className={dmSans.className}>Loading…</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen p-6 text-white" style={{ backgroundColor: "#05010F" }}>
        <p>{error ?? "Not found"}</p>
        <Link href="/dashboard/games/celo" className="text-[#7C3AED] underline mt-4 inline-block">
          Back to lobby
        </Link>
      </div>
    );
  }

  const roundOpen = round && round.status !== "completed";
  const canStart = isBanker && !roundOpen && players.some((p) => p.role === "player" && (p.entry_sc ?? 0) > 0);
  const myTurn =
    round &&
    ((round.status === "banker_rolling" && isBanker) ||
      (round.status === "player_rolling" &&
        mePlayer?.role === "player" &&
        mePlayer.seat_number === round.current_player_seat));

  return (
    <div
      className={`${dmSans.className} min-h-screen flex flex-col md:flex-row text-white overflow-hidden`}
      style={{ backgroundColor: "#05010F", paddingBottom: 72 }}
    >
      <div className="flex-1 flex flex-col min-h-0 min-w-0 max-w-[1200px] mx-auto w-full">
        <header
          className="h-12 shrink-0 flex items-center justify-between px-3 border-b border-white/10"
          style={{ backgroundColor: "#0D0520" }}
        >
          <button type="button" onClick={() => router.push("/dashboard/games/celo")} className="text-[#F5C842] text-sm">
            ←
          </button>
          <span className={`${cinzel.className} text-sm truncate max-w-[40vw]`} style={{ color: "#F5C842" }}>
            {(room.name ?? "Table").slice(0, 16)}
          </span>
          <span className="text-xs text-emerald-400">●</span>
        </header>

        <div
          className="h-[52px] shrink-0 grid grid-cols-3 border-b border-white/10 text-[10px] md:text-xs"
          style={{ backgroundColor: "#0a0518" }}
        >
          <div className="flex flex-col justify-center px-2 truncate">
            <span className="text-white/40">Banker</span>
            <span className="text-white font-medium truncate">
              {displayNames[String(room.banker_id ?? "")] ?? "—"}
            </span>
          </div>
          <div className="flex flex-col justify-center items-center">
            <span className="text-white/40">Prize pool</span>
            <span style={{ color: "#F5C842" }}>{(round?.prize_pool_sc ?? 0).toLocaleString()} GPC</span>
          </div>
          <div className="flex flex-col justify-center items-end px-2">
            <span className="text-white/40">Bank</span>
            <span style={{ color: "#F5C842" }}>{bank.toLocaleString()} GPC</span>
          </div>
        </div>

        <div className="flex-1 min-h-[200px] relative flex flex-col items-center justify-center px-3 py-4">
          <div
            className="absolute inset-0 pointer-events-none opacity-90"
            style={{
              background:
                "linear-gradient(90deg, rgba(124,58,237,0.12), transparent 30%), linear-gradient(270deg, rgba(245,200,66,0.1), transparent 30%)",
            }}
          />
          <div
            className="relative flex flex-col items-center justify-center rounded-[50%] border-[10px] border-[#5C3A1A]"
            style={{
              backgroundColor: "#0D2B0D",
              width: "min(280px, 85vw)",
              height: "clamp(160px, 28vh, 220px)",
              boxShadow: "inset 0 0 80px rgba(0,0,0,0.45)",
            }}
          >
            <span
              className="absolute pointer-events-none text-[80px] font-black select-none"
              style={{ color: "rgba(255,255,255,0.06)" }}
            >
              GP
            </span>
            {dice ? (
              <div className="relative z-[1] flex gap-2">
                <DiceFace value={dice[0] as 0 | 1 | 2 | 3 | 4 | 5 | 6} size={52} rolling={rolling} delay={0} />
                <DiceFace value={dice[1] as 0 | 1 | 2 | 3 | 4 | 5 | 6} size={52} rolling={rolling} delay={133} />
                <DiceFace value={dice[2] as 0 | 1 | 2 | 3 | 4 | 5 | 6} size={52} rolling={rolling} delay={266} />
              </div>
            ) : (
              <p className="text-white/40 text-sm z-[1]">Waiting for roll…</p>
            )}
            <RollNameDisplay rollName={rollName} result={null} />
          </div>

          {!inRoom && (
            <div className="mt-6 w-full max-w-sm space-y-2 z-[2]">
              <p className="text-sm text-white/70">Join this table with an entry (multiplier of {minEntry} GPC).</p>
              <input
                type="number"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2"
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

        <div
          className="h-[52px] shrink-0 flex items-center justify-between px-3 border-t border-white/10 gap-2"
          style={{ backgroundColor: "#0D0520" }}
        >
          <span className="text-xs font-mono" style={{ color: "#F5C842" }}>
            {formatGPC(gpayCoins)}
          </span>
          {inRoom && (
            <div className="flex-1 flex justify-center">
              {canStart && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleStartRound()}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
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
                  className="rounded-xl px-5 py-2 text-sm font-semibold text-black animate-pulse disabled:opacity-40"
                  style={{ backgroundColor: "#F5C842" }}
                >
                  ROLL DICE
                </button>
              )}
              {roundOpen && !myTurn && (
                <span className="text-xs text-white/40">Waiting for roll…</span>
              )}
            </div>
          )}
        </div>

        <div className="h-10 shrink-0 flex border-t border-white/10">
          {(["side", "chat"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className="flex-1 text-xs font-semibold"
              style={{
                color: tab === t ? "#F5C842" : "rgba(255,255,255,0.45)",
                borderBottom: tab === t ? "2px solid #F5C842" : undefined,
              }}
              onClick={() => {
                if (tab === t) setPanelOpen((o) => !o);
                else {
                  setTab(t);
                  setPanelOpen(true);
                }
              }}
            >
              {t === "side" ? "SIDE" : "CHAT"}
            </button>
          ))}
        </div>

        {panelOpen && (
          <div className="max-h-[160px] overflow-y-auto border-t border-white/10 px-3 py-2 text-sm" style={{ backgroundColor: "#0a0518" }}>
            {tab === "chat" ? (
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className="text-xs text-white/80">
                    <span className="text-[#7C3AED]">{displayNames[m.user_id] ?? "?"}:</span> {m.message}
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
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
            ) : (
              <p className="text-xs text-white/50">Side entries: use table actions after joining a round.</p>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="fixed bottom-20 left-3 right-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200 z-50">
          {error}
        </div>
      )}
    </div>
  );
}
