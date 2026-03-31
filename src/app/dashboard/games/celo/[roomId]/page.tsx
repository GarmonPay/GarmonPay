"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";
import DiceDisplay from "@/components/celo/DiceDisplay";

type ChatRow = { id: string; user_id: string; message: string; created_at: string };

const MIN_ROLL_MS = 2500;

function authHeaders(token: string | null): HeadersInit {
  const h: HeadersInit = {};
  if (token) (h as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  return h;
}

function shortId(uid: string) {
  return `${uid.slice(0, 8)}…`;
}

function SeatAvatar({
  label,
  sub,
  gold,
  dashed,
}: {
  label: string;
  sub: string;
  gold?: boolean;
  dashed?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center gap-1 min-w-[56px] ${gold ? "ring-2 ring-amber-400/80 rounded-full p-0.5" : ""}`}>
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white ${
          dashed ? "border-2 border-dashed border-white/30 bg-transparent" : "bg-violet-700"
        }`}
      >
        {dashed ? "?" : label.slice(0, 1).toUpperCase()}
      </div>
      <span className="text-[10px] text-white/80 text-center max-w-[72px] truncate">{dashed ? "Open" : label}</span>
      <span className="text-[10px] text-amber-200/90">{sub}</span>
    </div>
  );
}

export default function CeloRoomPage() {
  const router = useRouter();
  const params = useParams();
  const roomId = typeof params.roomId === "string" ? params.roomId : "";

  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{
    room: Record<string, unknown>;
    players: { user_id: string; role: string; bet_cents: number; seat_number: number | null }[];
    active_round: Record<string, unknown> | null;
    player_rolls: unknown[];
    you: { role: string | null };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [joinBet, setJoinBet] = useState(500);
  const [joinCode, setJoinCode] = useState("");
  const [joinRole, setJoinRole] = useState<"player" | "spectator">("player");
  const [chatMessages, setChatMessages] = useState<ChatRow[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const [diceValues, setDiceValues] = useState<[number, number, number]>([1, 2, 3]);
  const [rolling, setRolling] = useState(false);
  const rollingRef = useRef(false);
  const [rollName, setRollName] = useState<string | null>(null);
  const [resultLabel, setResultLabel] = useState<string | null>(null);
  const [payoutCents, setPayoutCents] = useState<number | null>(null);
  const [rollBusy, setRollBusy] = useState(false);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);

  useEffect(() => {
    rollingRef.current = rolling;
  }, [rolling]);

  const load = useCallback(async () => {
    if (!roomId) return;
    setError(null);
    const res = await fetch(`/api/celo/room/${roomId}`, {
      credentials: "include",
      headers: { ...authHeaders(token) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((data as { error?: string }).error ?? "Could not load room");
      setDetail(null);
      return;
    }
    setDetail(data as typeof detail);
  }, [roomId, token]);

  const fetchBalance = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/wallet", { credentials: "include", headers: { ...authHeaders(token) } });
    const d = await res.json().catch(() => ({}));
    if (res.ok && typeof (d as { balance_cents?: unknown }).balance_cents === "number") {
      setBalanceCents((d as { balance_cents: number }).balance_cents);
    }
  }, [token]);

  useEffect(() => {
    setChatMessages([]);
    setChatDraft("");
  }, [roomId]);

  useEffect(() => {
    if (!detail?.room) return;
    const r = detail.room as { min_bet_cents: number; max_bet_cents: number };
    setJoinBet((prev) => Math.min(r.max_bet_cents, Math.max(r.min_bet_cents, prev)));
  }, [detail]);

  const fetchChat = useCallback(async () => {
    if (!roomId) return;
    const res = await fetch(`/api/celo/room/${roomId}/chat`, {
      credentials: "include",
      headers: { ...authHeaders(token) },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray((data as { messages?: ChatRow[] }).messages)) {
      setChatMessages((data as { messages: ChatRow[] }).messages);
    }
  }, [roomId, token]);

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      setError("Invalid room");
      return;
    }
    let cancelled = false;
    (async () => {
      const s = await getSessionAsync();
      if (!s) {
        router.replace("/login?next=/dashboard/games/celo");
        return;
      }
      if (cancelled) return;
      setToken(s.accessToken ?? null);
      setUserId(s.userId ?? null);
      setLoading(true);
      const res = await fetch(`/api/celo/room/${roomId}`, {
        credentials: "include",
        headers: {
          ...(s.accessToken ? { Authorization: `Bearer ${s.accessToken}` } : {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Could not load room");
        setDetail(null);
      } else {
        setError(null);
        setDetail(data as typeof detail);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, router]);

  useEffect(() => {
    if (!token) return;
    void fetchBalance();
  }, [token, fetchBalance, detail?.room]);

  useEffect(() => {
    if (!detail?.active_round || rollingRef.current || rollBusy) return;
    const r = detail.active_round as { banker_roll?: number[] };
    if (Array.isArray(r.banker_roll) && r.banker_roll.length === 3) {
      setDiceValues([r.banker_roll[0]!, r.banker_roll[1]!, r.banker_roll[2]!]);
    }
  }, [detail?.active_round, rollBusy]);

  useEffect(() => {
    if (!detail?.you?.role || !roomId) return;
    void fetchChat();
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void fetchChat();
      }
    }, 10_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void fetchChat();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [detail?.you?.role, roomId, fetchChat]);

  const runRevealSequence = useCallback(
    async (
      dice: [number, number, number],
      name: string,
      outcome: string | null,
      payout: number | null
    ) => {
      setRolling(false);
      setDiceValues(dice);
      await new Promise((r) => setTimeout(r, 500));
      setRollName(name);
      await new Promise((r) => setTimeout(r, 1500));
      if (outcome != null) setResultLabel(outcome);
      if (payout != null) setPayoutCents(payout);
      await load();
      await fetchBalance();
    },
    [load, fetchBalance]
  );

  const handleBankerStart = useCallback(async () => {
    if (!roomId || !token || rollBusy) return;
    setRollBusy(true);
    setRolling(true);
    setRollName(null);
    setResultLabel(null);
    setPayoutCents(null);
    setError(null);
    try {
      const [, wrapped] = await Promise.all([
        new Promise<void>((resolve) => setTimeout(resolve, MIN_ROLL_MS)),
        fetch("/api/celo/round/start", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...authHeaders(token) },
          body: JSON.stringify({ room_id: roomId }),
        }).then(async (r) => ({ ok: r.ok, j: (await r.json().catch(() => ({}))) as Record<string, unknown> })),
      ]);
      if (!wrapped.ok) {
        setError((wrapped.j.error as string | undefined) ?? "Could not start round");
        setRolling(false);
        setRollBusy(false);
        return;
      }
      const resData = wrapped.j;
      const ev = resData?.banker_evaluation as
        | { dice?: number[]; rollName?: string; result?: string }
        | undefined;
      const dice = (ev?.dice ?? [1, 1, 1]) as [number, number, number];
      const name = ev?.rollName ?? "";
      const outcome = ev?.result ?? null;
      await runRevealSequence(dice, name, outcome, null);
    } catch {
      setError("Network error");
      setRolling(false);
    } finally {
      setRollBusy(false);
    }
  }, [roomId, token, rollBusy, runRevealSequence]);

  const handlePlayerRoll = useCallback(async () => {
    if (!roomId || !token || rollBusy) return;
    setRollBusy(true);
    setRolling(true);
    setRollName(null);
    setResultLabel(null);
    setPayoutCents(null);
    setError(null);
    try {
      const [, wrapped] = await Promise.all([
        new Promise<void>((resolve) => setTimeout(resolve, MIN_ROLL_MS)),
        fetch("/api/celo/round/roll", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...authHeaders(token) },
          body: JSON.stringify({ room_id: roomId }),
        }).then(async (r) => ({ ok: r.ok, j: (await r.json().catch(() => ({}))) as Record<string, unknown> })),
      ]);
      if (!wrapped.ok) {
        setRolling(false);
        setError((wrapped.j.error as string | undefined) ?? "Roll failed");
        setRollBusy(false);
        return;
      }
      const j = wrapped.j;
      const roll = j.roll as
        | { dice?: number[]; rollName?: string; outcome?: string }
        | undefined;
      const dice = (roll?.dice ?? [1, 1, 1]) as [number, number, number];
      const name = roll?.rollName ?? "";
      const outcome = roll?.outcome ?? null;
      const payout = typeof j.payout_cents === "number" ? j.payout_cents : typeof j.payout === "number" ? j.payout : 0;
      await runRevealSequence(dice, name, outcome, payout);
    } catch {
      setError("Network error");
      setRolling(false);
    } finally {
      setRollBusy(false);
    }
  }, [roomId, token, rollBusy, runRevealSequence]);

  const triggerRemoteRollAnimation = useCallback(
    (row: {
      user_id: string;
      dice?: number[] | null;
      roll_name?: string | null;
      outcome?: string | null;
      payout_cents?: number | null;
    }) => {
      if (!row.user_id || row.user_id === userId) return;
      if (!Array.isArray(row.dice) || row.dice.length !== 3) return;
      if (rollingRef.current) return;
      setRolling(true);
      setRollName(null);
      setResultLabel(null);
      setPayoutCents(null);
      const dice = [row.dice[0]!, row.dice[1]!, row.dice[2]!] as [number, number, number];
      const name = row.roll_name ?? "";
      const outcome = row.outcome ?? null;
      window.setTimeout(() => {
        void runRevealSequence(dice, name, outcome, row.payout_cents ?? 0);
      }, MIN_ROLL_MS);
    },
    [userId, runRevealSequence]
  );

  useEffect(() => {
    if (!roomId || !userId) return;
    const supabase = createBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`celo-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "celo_rounds",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void load();
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
          const row = payload.new as Record<string, unknown>;
          triggerRemoteRollAnimation({
            user_id: String(row.user_id ?? ""),
            dice: row.dice as number[] | undefined,
            roll_name: row.roll_name as string | undefined,
            outcome: row.outcome as string | undefined,
            payout_cents: row.payout_cents as number | undefined,
          });
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
        () => {
          void load();
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
          const row = payload.new as ChatRow;
          if (row?.id) setChatMessages((prev) => [...prev, row]);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, userId, load, triggerRemoteRollAnimation]);

  async function post(path: string, body: object) {
    setBusy(path);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Request failed");
        return data;
      }
      if (path === "/api/celo/room/close" || path === "/api/celo/room/leave") {
        router.push("/dashboard/games/celo");
        return data;
      }
      await load();
      return data;
    } finally {
      setBusy(null);
    }
  }

  async function sendChatMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = chatDraft.trim();
    if (!text || !roomId || chatSending) return;
    setChatSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/celo/room/${roomId}/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Could not send message");
        return;
      }
      setChatDraft("");
      await fetchChat();
    } finally {
      setChatSending(false);
    }
  }

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length]);

  if (loading || !detail) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#05010F] text-fintech-muted px-4">
        {error ?? "Loading room…"}
      </div>
    );
  }

  const room = detail.room as {
    id: string;
    name: string;
    status: string;
    banker_id: string;
    creator_id: string;
    room_type: string;
    join_code: string | null;
    min_bet_cents: number;
    max_bet_cents: number;
    max_players: number;
  };
  const round = detail.active_round as {
    status: string;
    banker_roll: number[];
    banker_roll_name: string;
    banker_roll_result: string;
    banker_point: number | null;
    round_number: number;
    total_pot_cents?: number;
    created_at?: string;
  } | null;

  const isBanker = userId === room.banker_id;
  const canEndGame = !!userId && (isBanker || userId === room.creator_id);
  const youRole = detail.you?.role;
  const mySeat = detail.players.find((p) => p.user_id === userId);
  const leaveBlocked = !!round && youRole === "player" && (mySeat?.bet_cents ?? 0) > 0;

  const bankerPlayer = detail.players.find((p) => p.user_id === room.banker_id);
  const playersOnly = detail.players.filter((p) => p.role === "player").sort((a, b) => (a.seat_number ?? 0) - (b.seat_number ?? 0));
  const maxSeats = room.max_players;
  const emptySlots = Math.max(0, maxSeats - playersOnly.length);

  const potCents = round?.total_pot_cents ?? 0;
  const yourBet = mySeat?.bet_cents ?? 0;

  const yourTurnBanker = isBanker && youRole === "banker" && !round;
  const yourTurnPlayer = !!round && round.status === "player_rolling" && youRole === "player" && !isBanker;

  return (
    <div className="min-h-[100dvh] h-[100dvh] flex flex-col bg-[#05010F] text-white overflow-hidden">
      {/* Top bar */}
      <header
        className="h-[60px] shrink-0 flex items-center justify-between px-3 sm:px-4 border-b z-10"
        style={{ background: "#0D0520", borderColor: "rgba(124,58,237,0.3)" }}
      >
        <div className="flex items-center gap-2 min-w-0 text-sm">
          <span className="font-semibold truncate max-w-[120px] sm:max-w-[200px]">{room.name}</span>
          <span className="text-white/50 hidden sm:inline">|</span>
          <span className="text-violet-300/90 text-xs whitespace-nowrap">
            Round {round?.round_number ?? "—"}
          </span>
          <span className="text-white/50 hidden md:inline">|</span>
          <span className="text-amber-200/90 text-xs hidden md:inline whitespace-nowrap">
            Pot: ${(potCents / 100).toFixed(2)}
          </span>
          <span className="text-white/50 hidden lg:inline">|</span>
          <span className="text-fintech-muted text-xs hidden lg:inline">Timer —</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/dashboard/games/celo" className="text-xs text-amber-400 hover:underline">
            Lobby
          </Link>
        </div>
      </header>

      {error ? (
        <div className="mx-3 mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
      ) : null}

      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        {/* Main table */}
        <main
          className="flex-1 min-w-0 flex flex-col relative overflow-y-auto"
          style={{
            background: "radial-gradient(ellipse at center, #1A0535 0%, #05010F 70%)",
          }}
        >
          {/* Banker seat */}
          <div className="pt-4 flex flex-col items-center gap-1">
            <SeatAvatar
              label={bankerPlayer ? shortId(bankerPlayer.user_id) : shortId(room.banker_id)}
              sub="BANKER"
            />
            <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Banker</span>
            <span className="text-xs text-fintech-muted">
              Covers table · max ${(room.max_bet_cents / 100).toFixed(0)}
            </span>
          </div>

          {/* Dice + join or play */}
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
            {!youRole ? (
              <div className="w-full max-w-md rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
                <h2 className="text-sm font-semibold text-white">Join table</h2>
                <div className="flex gap-2">
                  <label className="text-xs text-fintech-muted flex items-center gap-1">
                    <input type="radio" checked={joinRole === "player"} onChange={() => setJoinRole("player")} />
                    Player
                  </label>
                  <label className="text-xs text-fintech-muted flex items-center gap-1">
                    <input type="radio" checked={joinRole === "spectator"} onChange={() => setJoinRole("spectator")} />
                    Spectator
                  </label>
                </div>
                {joinRole === "player" ? (
                  <input
                    type="number"
                    min={room.min_bet_cents}
                    max={room.max_bet_cents}
                    step={50}
                    className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-white text-sm"
                    value={joinBet}
                    onChange={(e) => setJoinBet(Number(e.target.value))}
                  />
                ) : null}
                {room.room_type === "private" ? (
                  <input
                    placeholder="Join code"
                    className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-white text-sm uppercase"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                  />
                ) : null}
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() =>
                    post("/api/celo/room/join", {
                      room_id: roomId,
                      role: joinRole,
                      bet_cents: joinRole === "player" ? joinBet : 0,
                      ...(room.room_type === "private" ? { join_code: joinCode.trim() } : {}),
                    })
                  }
                  className="w-full rounded-lg bg-amber-500 py-2 text-sm font-bold text-black disabled:opacity-50"
                >
                  Join
                </button>
              </div>
            ) : (
              <>
                <DiceDisplay values={diceValues} rolling={rolling} />
                {rollName ? (
                  <p className="mt-4 text-lg sm:text-2xl font-bold text-center text-amber-200 px-2">{rollName}</p>
                ) : (
                  <p className="mt-4 text-sm text-fintech-muted">{" "}</p>
                )}
                {resultLabel ? (
                  <p className="mt-2 text-base text-white/90">
                    Outcome: <span className={resultLabel === "win" ? "text-emerald-400" : "text-red-300"}>{resultLabel}</span>
                    {payoutCents != null && payoutCents > 0 ? (
                      <span className="ml-2 text-amber-200">+${(payoutCents / 100).toFixed(2)}</span>
                    ) : null}
                  </p>
                ) : null}

                {round ? (
                  <p className="mt-2 text-xs text-center text-white/70 max-w-md">
                    Banker hand: {round.banker_roll_name} · point {round.banker_point ?? "—"}
                  </p>
                ) : null}

                {/* Mid-screen actions moved to bottom bar */}
              </>
            )}
          </div>

          {/* Player seats row */}
          {youRole ? (
            <div className="pb-4 px-2 flex flex-wrap justify-center gap-3 border-t border-white/10 pt-3">
              {playersOnly.map((p) => (
                <SeatAvatar
                  key={p.user_id}
                  label={shortId(p.user_id)}
                  sub={`$${(p.bet_cents / 100).toFixed(2)}`}
                  gold={p.user_id === userId}
                />
              ))}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <SeatAvatar key={`open-${i}`} label="" sub="" dashed />
              ))}
            </div>
          ) : null}
        </main>

        {/* Right panel — desktop */}
        {youRole ? (
          <aside
            className="hidden lg:flex w-[320px] shrink-0 flex-col border-l min-h-0"
            style={{ borderColor: "rgba(124,58,237,0.25)" }}
          >
            <div className="h-[60%] min-h-0 flex flex-col border-b border-violet-500/20">
              <h3 className="text-xs font-semibold text-violet-300/90 uppercase px-3 py-2 shrink-0">Side bets</h3>
              <div className="flex-1 overflow-y-auto px-3 pb-2 text-sm text-fintech-muted">
                Coming soon — heads-up side action on this table.
              </div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col bg-black/20">
              <h3 className="text-xs font-semibold text-violet-300/90 uppercase px-3 py-2 shrink-0">Chat</h3>
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm">
                {chatMessages.map((m) => (
                  <div key={m.id} className="text-white/90 break-words">
                    <span className="text-amber-400/90 text-xs">{m.user_id === userId ? "You" : shortId(m.user_id)}</span>
                    <p className="text-white/90 text-xs mt-0.5">{m.message}</p>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </div>
              <form onSubmit={sendChatMessage} className="border-t border-white/10 p-2 flex gap-2 shrink-0">
                <input
                  className="flex-1 min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
                  placeholder="Message…"
                  maxLength={500}
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  disabled={chatSending}
                />
                <button
                  type="submit"
                  disabled={chatSending || !chatDraft.trim()}
                  className="rounded-lg bg-violet-600/40 px-2 py-1 text-xs font-bold text-violet-100 disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            </div>
          </aside>
        ) : null}
      </div>

      {/* Bottom bar */}
      {youRole ? (
        <footer
          className="h-[80px] shrink-0 flex flex-col sm:flex-row items-center justify-between gap-2 px-3 py-2 border-t z-10"
          style={{ background: "#0D0520", borderColor: "rgba(124,58,237,0.3)" }}
        >
          <div className="flex flex-col text-xs text-fintech-muted">
            <span>
              Balance:{" "}
              <span className="text-white font-semibold">
                {balanceCents != null ? `$${(balanceCents / 100).toFixed(2)}` : "—"}
              </span>
            </span>
            <span>
              Your bet: <span className="text-amber-200">${(yourBet / 100).toFixed(2)}</span>
            </span>
          </div>

          <div className="flex flex-col items-center gap-1 flex-1">
            {yourTurnBanker ? (
              <span className="text-xs font-bold text-amber-400 animate-pulse">YOUR TURN</span>
            ) : yourTurnPlayer ? (
              <span className="text-xs font-bold text-amber-400 animate-pulse">YOUR TURN — ROLL DICE</span>
            ) : (
              <span className="text-xs text-fintech-muted text-center">
                {round?.status === "player_rolling" ? "Waiting for other players to roll…" : "Waiting for banker…"}
              </span>
            )}

            {yourTurnBanker ? (
              <button
                type="button"
                disabled={rollBusy || !!busy}
                onClick={() => void handleBankerStart()}
                className="w-[200px] max-w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-sm font-black text-black disabled:opacity-50 shadow-lg shadow-amber-900/30"
              >
                {rollBusy ? "Rolling…" : "ROLL DICE"}
              </button>
            ) : yourTurnPlayer ? (
              <button
                type="button"
                disabled={rollBusy || !!busy}
                onClick={() => void handlePlayerRoll()}
                className="w-[200px] max-w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-sm font-black text-black disabled:opacity-50 shadow-lg shadow-amber-900/30"
              >
                {rollBusy ? "Rolling…" : "ROLL DICE"}
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="w-[200px] max-w-full rounded-xl border border-white/20 py-2.5 text-sm font-semibold text-fintech-muted opacity-50"
              >
                ROLL DICE
              </button>
            )}
          </div>

          <div className="flex flex-col items-end gap-1 text-[10px]">
            {canEndGame ? (
              <button
                type="button"
                disabled={!!busy || !!round || rollBusy}
                onClick={() => {
                  if (!confirm("End this game for everyone? Refunds will be processed.")) return;
                  post("/api/celo/room/close", { room_id: roomId });
                }}
                className="text-red-300 hover:underline disabled:opacity-40"
              >
                End game
              </button>
            ) : null}
            {youRole !== "banker" ? (
              <button
                type="button"
                disabled={!!busy || leaveBlocked || rollBusy}
                onClick={() => {
                  if (!confirm("Leave this table?")) return;
                  post("/api/celo/room/leave", { room_id: roomId });
                }}
                className="text-fintech-muted hover:text-white disabled:opacity-40"
              >
                Leave
              </button>
            ) : null}
          </div>
        </footer>
      ) : null}

      {/* Mobile chat */}
      {youRole ? (
        <div className="lg:hidden border-t border-white/10 max-h-[28vh] flex flex-col bg-black/30">
          <h3 className="text-[10px] font-semibold text-violet-300/90 uppercase px-3 pt-2">Chat</h3>
          <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1 text-xs max-h-[120px]">
            {chatMessages.map((m) => (
              <div key={m.id}>
                <span className="text-amber-400/80">{m.user_id === userId ? "You" : shortId(m.user_id)}</span>: {m.message}
              </div>
            ))}
          </div>
          <form onSubmit={sendChatMessage} className="flex gap-2 p-2 border-t border-white/10">
            <input
              className="flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              placeholder="Message…"
              maxLength={500}
            />
            <button type="submit" disabled={chatSending} className="text-amber-400 text-xs font-bold px-2">
              Send
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
