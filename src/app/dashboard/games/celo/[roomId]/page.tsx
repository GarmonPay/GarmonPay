"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";

type ChatRow = { id: string; user_id: string; message: string; created_at: string };

function authHeaders(token: string | null): HeadersInit {
  const h: HeadersInit = {};
  if (token) (h as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  return h;
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
      <div className="rounded-xl border border-white/10 bg-fintech-bg-card p-8 text-center text-fintech-muted">
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
  } | null;
  const isBanker = userId === room.banker_id;
  const canEndGame = !!userId && (isBanker || userId === room.creator_id);
  const youRole = detail.you?.role;
  const mySeat = detail.players.find((p) => p.user_id === userId);
  const leaveBlocked =
    !!round && youRole === "player" && (mySeat?.bet_cents ?? 0) > 0;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-white">{room.name}</h1>
          <p className="text-xs text-fintech-muted mt-1">
            {room.room_type === "private" && room.join_code ? `Code: ${room.join_code} · ` : ""}
            Table {room.status} · banker seat
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Link href="/dashboard/games/celo" className="text-xs text-amber-400 hover:underline">
            Lobby
          </Link>
          {youRole && canEndGame ? (
            <button
              type="button"
              disabled={!!busy || !!round}
              title={round ? "Finish the current round before ending the game" : undefined}
              onClick={() => {
                if (
                  !confirm(
                    "End this game for everyone? Player stakes still on the table will be refunded to their wallets."
                  )
                ) {
                  return;
                }
                post("/api/celo/room/close", { room_id: roomId });
              }}
              className="text-xs text-red-300 hover:text-red-200 underline disabled:opacity-50"
            >
              {busy === "/api/celo/room/close" ? "Closing…" : "End game"}
            </button>
          ) : null}
          {youRole && youRole !== "banker" ? (
            <button
              type="button"
              disabled={!!busy || leaveBlocked}
              title={leaveBlocked ? "Wait for this round to finish before leaving with a stake" : undefined}
              onClick={() => {
                if (!confirm("Leave this table?")) return;
                post("/api/celo/room/leave", { room_id: roomId });
              }}
              className="text-xs text-fintech-muted hover:text-white underline disabled:opacity-50"
            >
              {busy === "/api/celo/room/leave" ? "Leaving…" : "Leave table"}
            </button>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
      )}

      {!youRole ? (
        <div className="rounded-xl border border-white/10 bg-fintech-bg-card p-4 space-y-2">
          <h2 className="text-sm font-semibold text-white">Join table</h2>
          <div className="flex gap-2">
            <label className="text-xs text-fintech-muted flex items-center gap-1">
              <input
                type="radio"
                checked={joinRole === "player"}
                onChange={() => setJoinRole("player")}
              />
              Player
            </label>
            <label className="text-xs text-fintech-muted flex items-center gap-1">
              <input
                type="radio"
                checked={joinRole === "spectator"}
                onChange={() => setJoinRole("spectator")}
              />
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
          <div className="rounded-xl border border-white/10 bg-fintech-bg-card p-3">
            <h2 className="text-xs font-semibold text-fintech-muted uppercase mb-2">Seats</h2>
            <ul className="text-sm space-y-1">
              {detail.players.map((p) => (
                <li key={p.user_id} className="flex justify-between text-white/90">
                  <span>
                    {p.role} {p.user_id.slice(0, 8)}…
                  </span>
                  <span className="text-fintech-muted">
                    {p.role === "player" ? `$${(p.bet_cents / 100).toFixed(2)}` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {round ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <p className="text-xs text-amber-200/90 font-semibold">
                Round #{round.round_number as number} · {round.status}
              </p>
              <p className="text-sm text-white">
                Banker: {round.banker_roll_name} · dice [{round.banker_roll?.join(", ")}] ·{" "}
                {round.banker_roll_result}
                {round.banker_point != null ? ` · point ${round.banker_point}` : ""}
              </p>
              {round.status === "player_rolling" && youRole === "player" && !isBanker ? (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => post("/api/celo/round/player-roll", { room_id: roomId })}
                  className="w-full rounded-lg bg-white text-black py-2 text-sm font-bold disabled:opacity-50"
                >
                  {busy === "/api/celo/round/player-roll" ? "Rolling…" : "Roll your dice"}
                </button>
              ) : null}
            </div>
          ) : isBanker ? (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => post("/api/celo/round/start", { room_id: roomId })}
              className="w-full rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 py-3 text-sm font-bold text-black disabled:opacity-50"
            >
              {busy === "/api/celo/round/start" ? "Starting…" : "Start round (banker roll)"}
            </button>
          ) : (
            <p className="text-sm text-fintech-muted">Waiting for banker to start a round…</p>
          )}

          {detail.player_rolls.length > 0 ? (
            <div className="text-xs text-fintech-muted space-y-1">
              <p className="font-semibold text-white/80">Player rolls this round</p>
              {(detail.player_rolls as { user_id: string; roll_name: string; outcome: string }[]).map((r, i) => (
                <div key={i}>
                  {r.user_id.slice(0, 8)}… · {r.roll_name} ·{" "}
                  <span className={r.outcome === "win" ? "text-green-400" : "text-red-400"}>{r.outcome}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-xl border border-white/10 bg-fintech-bg-card overflow-hidden flex flex-col max-h-[min(280px,45vh)]">
            <h2 className="text-xs font-semibold text-fintech-muted uppercase px-3 pt-3 pb-1">Table chat</h2>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm min-h-[100px]">
              {chatMessages.length === 0 ? (
                <p className="text-fintech-muted text-xs">No messages yet. Say hi to the table.</p>
              ) : (
                chatMessages.map((m) => (
                  <div key={m.id} className="text-white/90 break-words">
                    <span className="text-amber-400/90 text-xs font-medium">
                      {m.user_id === userId ? "You" : `${m.user_id.slice(0, 8)}…`}
                    </span>
                    <span className="text-fintech-muted text-xs ml-1">
                      {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <p className="text-white/95 mt-0.5">{m.message}</p>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>
            <form onSubmit={sendChatMessage} className="border-t border-white/10 p-2 flex gap-2">
              <input
                className="flex-1 min-w-0 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-fintech-muted"
                placeholder="Message table…"
                maxLength={500}
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                disabled={chatSending}
              />
              <button
                type="submit"
                disabled={chatSending || !chatDraft.trim()}
                className="shrink-0 rounded-lg bg-amber-500/20 border border-amber-500/40 px-3 py-2 text-xs font-bold text-amber-200 disabled:opacity-40"
              >
                {chatSending ? "…" : "Send"}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
