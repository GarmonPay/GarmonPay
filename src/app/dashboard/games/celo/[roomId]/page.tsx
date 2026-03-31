"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";

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
  const [joinBet, setJoinBet] = useState(100);
  const [joinCode, setJoinCode] = useState("");
  const [joinRole, setJoinRole] = useState<"player" | "spectator">("player");

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
      await load();
      return data;
    } finally {
      setBusy(null);
    }
  }

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
  const youRole = detail.you?.role;

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
        <Link href="/dashboard/games/celo" className="text-xs text-amber-400 hover:underline shrink-0">
          Lobby
        </Link>
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
        </>
      )}
    </div>
  );
}
