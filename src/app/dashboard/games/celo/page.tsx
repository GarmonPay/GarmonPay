"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";

type RoomRow = {
  id: string;
  name: string;
  status: string;
  min_bet_cents: number;
  max_bet_cents: number;
  max_players: number;
  player_count: number;
  speed: string;
};

function authHeaders(token: string | null): HeadersInit {
  const h: HeadersInit = {};
  if (token) (h as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  return h;
}

export default function CeloLobbyPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "Street Game",
    room_type: "public" as "public" | "private",
    max_players: 6 as 2 | 4 | 6,
    min_bet_cents: 100,
    max_bet_cents: 1000,
    speed: "regular" as "regular" | "fast" | "blitz",
  });

  const load = useCallback(async (t: string | null) => {
    setError(null);
    const res = await fetch("/api/celo/rooms?include_mine=1", {
      credentials: "include",
      headers: { ...authHeaders(t) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((data as { error?: string }).error ?? "Failed to load rooms");
      setRooms([]);
      return;
    }
    setRooms((data as { rooms?: RoomRow[] }).rooms ?? []);
  }, []);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/games/celo");
        return;
      }
      const t = s.accessToken ?? null;
      setToken(t);
      load(t).finally(() => setLoading(false));
    });
  }, [router, load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token && typeof window === "undefined") return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/celo/room/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Create failed");
        return;
      }
      const id = (data as { room?: { id: string } }).room?.id;
      if (id) router.push(`/dashboard/games/celo/${id}`);
      else await load(token);
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-fintech-bg-card p-8 text-center text-fintech-muted">
        Loading C-Lo…
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">C-Lo Street Dice</h1>
          <p className="text-sm text-fintech-muted mt-1">
            Public lobby · create a room as banker · players escrow bets on join
          </p>
        </div>
        <Link href="/dashboard/games" className="text-sm text-amber-400 hover:underline shrink-0">
          ← Games
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      )}

      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-white/10 bg-fintech-bg-card p-4 space-y-3"
      >
        <h2 className="text-sm font-semibold text-white">Create room (you are banker)</h2>
        <input
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white text-sm"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          maxLength={80}
        />
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-white text-sm"
            value={form.room_type}
            onChange={(e) =>
              setForm((f) => ({ ...f, room_type: e.target.value as "public" | "private" }))
            }
          >
            <option value="public">Public</option>
            <option value="private">Private (join code)</option>
          </select>
          <select
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-white text-sm"
            value={form.max_players}
            onChange={(e) =>
              setForm((f) => ({ ...f, max_players: Number(e.target.value) as 2 | 4 | 6 }))
            }
          >
            <option value={2}>2 seats</option>
            <option value={4}>4 seats</option>
            <option value={6}>6 seats</option>
          </select>
          <select
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-white text-sm"
            value={form.speed}
            onChange={(e) =>
              setForm((f) => ({ ...f, speed: e.target.value as typeof form.speed }))
            }
          >
            <option value="regular">Regular</option>
            <option value="fast">Fast</option>
            <option value="blitz">Blitz</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs text-fintech-muted">
            Min ¢
            <input
              type="number"
              min={100}
              step={50}
              className="ml-1 w-24 rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
              value={form.min_bet_cents}
              onChange={(e) => setForm((f) => ({ ...f, min_bet_cents: Number(e.target.value) }))}
            />
          </label>
          <label className="text-xs text-fintech-muted">
            Max ¢
            <input
              type="number"
              min={100}
              step={100}
              className="ml-1 w-28 rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
              value={form.max_bet_cents}
              onChange={(e) => setForm((f) => ({ ...f, max_bet_cents: Number(e.target.value) }))}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-black disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create & open room"}
        </button>
      </form>

      <div>
        <h2 className="text-sm font-semibold text-fintech-muted uppercase tracking-wider mb-2">Open tables</h2>
        <div className="space-y-2">
          {rooms.length === 0 ? (
            <p className="text-sm text-fintech-muted">No public tables yet. Create one above.</p>
          ) : (
            rooms.map((r) => (
              <Link
                key={r.id}
                href={`/dashboard/games/celo/${r.id}`}
                className="block rounded-xl border border-white/10 bg-fintech-bg-card p-4 no-underline hover:border-amber-500/40 transition"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-white">{r.name}</span>
                  <span className="text-xs text-amber-400">{r.status}</span>
                </div>
                <p className="text-xs text-fintech-muted mt-1">
                  ${(r.min_bet_cents / 100).toFixed(2)} – ${(r.max_bet_cents / 100).toFixed(2)} · {r.player_count}/
                  {r.max_players} players · {r.speed}
                </p>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
