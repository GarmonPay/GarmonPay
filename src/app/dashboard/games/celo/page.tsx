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
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "Street Game",
    room_type: "public" as "public" | "private",
    max_players: 6 as 2 | 4 | 6,
    min_bet_cents: 500,
    max_bet_cents: 1_000_000,
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

  useEffect(() => {
    if (!token) return;
    fetch("/api/wallet", { credentials: "include", headers: { ...authHeaders(token) } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        setBalanceCents(typeof (d as { balance_cents?: unknown })?.balance_cents === "number" ? (d as { balance_cents: number }).balance_cents : null)
      )
      .catch(() => setBalanceCents(null));
  }, [token]);

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

  const requiredBankrollCents = form.max_players * form.max_bet_cents;
  /** If balance failed to load, still allow submit — API enforces the same rule. */
  const hasFundsForTable =
    balanceCents === null ? true : balanceCents >= requiredBankrollCents;
  const createDisabled =
    creating || (balanceCents !== null && balanceCents < requiredBankrollCents);

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
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-fintech-muted block">
            Min ($)
            <input
              type="number"
              min={5}
              max={10000}
              step={1}
              className="mt-1 block w-28 rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
              value={form.min_bet_cents / 100}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                setForm((f) => ({ ...f, min_bet_cents: Math.round(v * 100) }));
              }}
            />
          </label>
          <label className="text-xs text-fintech-muted block">
            Max ($)
            <input
              type="number"
              min={5}
              max={10000}
              step={1}
              className="mt-1 block w-32 rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
              value={form.max_bet_cents / 100}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                setForm((f) => ({ ...f, max_bet_cents: Math.round(v * 100) }));
              }}
            />
          </label>
        </div>
        <p className="text-[11px] text-fintech-muted">Table limits: $5 minimum · $10,000 maximum per bet.</p>
        <div className="text-[11px] space-y-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <p className="text-fintech-muted">
            <span className="text-white/90">Banker bankroll:</span> you must have at least{" "}
            <span className="text-amber-200/90">
              ${(requiredBankrollCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>{" "}
            ({form.max_players} seats × max bet) in your wallet to create this room.
          </p>
          {balanceCents !== null ? (
            <p className={hasFundsForTable ? "text-emerald-400/90" : "text-amber-300"}>
              Your balance:{" "}
              <span className="font-semibold">${(balanceCents / 100).toFixed(2)}</span>
              {!hasFundsForTable ? (
                <>
                  {" "}
                  — add funds before hosting.{" "}
                  <Link href="/wallet" className="underline hover:text-white">
                    Wallet
                  </Link>
                </>
              ) : null}
            </p>
          ) : (
            <p className="text-fintech-muted">Checking balance…</p>
          )}
        </div>
        <button
          type="submit"
          disabled={createDisabled}
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
