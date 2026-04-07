"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Cinzel_Decorative } from "next/font/google";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";

const cinzel = Cinzel_Decorative({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });

type Room = {
  id: string;
  name: string;
  status: string;
  room_type: string;
  max_players: number;
  min_bet_cents: number;
  current_bank_cents: number;
  platform_fee_pct: number;
  last_activity: string;
  /** Filled when available from realtime player counts */
  player_count?: number;
};

type CreateForm = {
  name: string;
  room_type: "public" | "private";
  max_players: 2 | 4 | 6 | 10;
  minimum_entry_cents: number;
  starting_bank_cents: number;
  join_code: string;
};

const DEFAULT_FORM: CreateForm = {
  name: "",
  room_type: "public",
  max_players: 4,
  minimum_entry_cents: 500,
  starting_bank_cents: 2000,
  join_code: "",
};

const STATUS_STYLE: Record<string, string> = {
  waiting: "text-amber-400 bg-amber-400/10",
  active: "text-emerald-400 bg-emerald-400/10",
  rolling: "text-violet-400 bg-violet-400/10",
};

const STATUS_LABEL: Record<string, string> = {
  waiting: "Waiting",
  active: "Open",
  rolling: "In Round",
};

export default function CeloLobbyPage() {
  const router = useRouter();
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [balanceCents, setBalanceCents] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [lobbyCode, setLobbyCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const mapRowToLobbyRoom = useCallback((raw: Record<string, unknown>, playerCount?: number): Room | null => {
    const n = normalizeCeloRoomRow(raw);
    if (!n) return null;
    const r = raw;
    return {
      id: String(r.id),
      name: String(r.name ?? n.name ?? ""),
      status: String(r.status ?? ""),
      room_type: String(r.room_type ?? ""),
      max_players: Number(r.max_players ?? n.max_players ?? 0),
      min_bet_cents: n.min_bet_cents,
      current_bank_cents: n.current_bank_cents,
      platform_fee_pct: n.platform_fee_pct,
      last_activity: String(r.last_activity ?? ""),
      player_count: playerCount,
    };
  }, []);

  const loadRooms = useCallback(async () => {
    const sb = createBrowserClient();
    if (!sb) return;
    const { data } = await sb
      .from("celo_rooms")
      .select("*")
      .eq("room_type", "public")
      .in("status", ["waiting", "active", "rolling"])
      .order("last_activity", { ascending: false })
      .limit(30);
    const rows = (data ?? []) as Record<string, unknown>[];
    setRooms(
      rows
        .map((row) => mapRowToLobbyRoom(row))
        .filter((x): x is Room => x !== null)
    );
  }, [mapRowToLobbyRoom]);

  useEffect(() => {
    // Load rooms immediately — doesn't require auth
    void loadRooms();

    getSessionAsync().then((s) => {
      if (!s) {
        setLoading(false);
        return;
      }
      setSession(s);
      setLoading(false);
      if (s.accessToken) {
        fetch("/api/wallet/get", { headers: { Authorization: `Bearer ${s.accessToken}` } })
          .then((r) => (r.ok ? r.json() : {}))
          .then((d: { balance_cents?: number }) => setBalanceCents(d.balance_cents ?? 0))
          .catch(() => {});
      }
    });
  }, [loadRooms]);

  useEffect(() => {
    const sb = createBrowserClient();
    if (!sb) return;
    let cancelled = false;

    const lobby = sb
      .channel("celo-lobby")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_rooms" },
        async (payload) => {
          if (cancelled) return;
          const ev = payload.eventType;
          const pubStatuses = new Set(["waiting", "active", "rolling"]);

          if (ev === "INSERT") {
            const row = payload.new as Record<string, unknown>;
            if (row.room_type === "public" && pubStatuses.has(String(row.status ?? ""))) {
              const mapped = mapRowToLobbyRoom(row);
              if (mapped) {
                setRooms((prev) => {
                  if (prev.some((r) => r.id === mapped.id)) return prev;
                  return [mapped, ...prev];
                });
              }
            }
            return;
          }

          if (ev === "UPDATE") {
            const row = payload.new as Record<string, unknown>;
            const id = String(row.id ?? "");
            const isPublic = row.room_type === "public";
            const st = String(row.status ?? "");
            if (!isPublic || !pubStatuses.has(st)) {
              setTimeout(() => {
                if (!cancelled) {
                  setRooms((prev) => prev.filter((r) => r.id !== id));
                }
              }, 0);
              return;
            }
            const mapped = mapRowToLobbyRoom(row);
            if (!mapped) return;
            setRooms((prev) => {
              const idx = prev.findIndex((r) => r.id === id);
              if (idx === -1) return [mapped, ...prev];
              const next = [...prev];
              const prevCount = next[idx].player_count;
              next[idx] = {
                ...next[idx],
                ...mapped,
                player_count: mapped.player_count ?? prevCount,
              };
              return next;
            });
            if (st === "cancelled" || st === "completed") {
              setTimeout(() => {
                if (!cancelled) {
                  setRooms((prev) => prev.filter((r) => r.id !== id));
                }
              }, 3000);
            }
            return;
          }

          if (ev === "DELETE") {
            const oldId = (payload.old as { id?: string } | null)?.id;
            if (oldId) {
              setRooms((prev) => prev.filter((r) => r.id !== oldId));
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_room_players" },
        async (payload) => {
          if (cancelled) return;
          const affectedRoomId =
            (payload.new as { room_id?: string } | null)?.room_id ??
            (payload.old as { room_id?: string } | null)?.room_id;
          if (!affectedRoomId) return;
          const { count } = await sb
            .from("celo_room_players")
            .select("*", { count: "exact", head: true })
            .eq("room_id", affectedRoomId)
            .neq("role", "spectator");
          if (cancelled) return;
          setRooms((prev) =>
            prev.map((r) =>
              r.id === affectedRoomId ? { ...r, player_count: count ?? 0 } : r
            )
          );
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      sb.removeChannel(lobby);
    };
  }, [mapRowToLobbyRoom]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.accessToken) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body = {
        name: form.name.trim(),
        room_type: form.room_type,
        max_players: form.max_players,
        minimum_entry_cents: form.minimum_entry_cents,
        starting_bank_cents: form.starting_bank_cents,
        join_code: form.room_type === "private" ? form.join_code.trim() : null,
      };
      const res = await fetch("/api/celo/room/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        room?: { id: string };
        error?: string;
        details?: string;
      };
      console.log("Create room response:", data);

      if (!res.ok) {
        console.error("Create room error:", data);
        setCreateError(data.details || data.error || "Failed to create room");
        return;
      }
      if (data.room?.id) {
        router.push(`/games/celo/${data.room.id}?created=1`);
      }
    } catch {
      setCreateError("Network error — try again");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoinByCode(e: React.FormEvent) {
    e.preventDefault();
    const code = lobbyCode.trim().toUpperCase();
    if (!code) return;
    setJoinError(null);
    setJoining(true);
    const sb = createBrowserClient();
    if (!sb) { setJoining(false); return; }
    const { data } = await sb
      .from("celo_rooms")
      .select("id")
      .eq("join_code", code)
      .in("status", ["waiting", "active"])
      .maybeSingle();
    setJoining(false);
    if (!data) { setJoinError("No active room with that code"); return; }
    router.push(`/games/celo/${(data as { id: string }).id}`);
  }

  // Keep starting_bank_cents snapped to a multiple of minimum_entry_cents
  function setMinEntry(v: number) {
    setForm((f) => ({
      ...f,
      minimum_entry_cents: v,
      // Round starting bank up to nearest multiple of new min entry
      starting_bank_cents: Math.ceil(Math.max(f.starting_bank_cents, v) / v) * v,
    }));
  }

  const canAfford = balanceCents >= form.starting_bank_cents;
  const canSubmit =
    !creating &&
    canAfford &&
    form.name.trim().length > 0 &&
    (form.room_type === "public" || form.join_code.trim().length >= 1);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e0118] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#F5C842] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0e0118] text-white relative overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-24 top-16 h-96 w-96 rounded-full bg-violet-700/20 blur-[130px]" />
        <div className="absolute right-0 bottom-10 h-80 w-80 rounded-full bg-[#F5C842]/6 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-4 py-8 pb-24">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/games" className="text-violet-300/70 text-sm hover:text-[#F5C842] transition-colors">
            ← Games
          </Link>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-violet-400/60">Balance</p>
            <p className="text-base font-bold text-[#F5C842] font-mono">${(balanceCents / 100).toFixed(2)}</p>
          </div>
        </div>

        {/* Hero */}
        <div className="text-center mb-10">
          <p className="text-6xl mb-4 drop-shadow-[0_0_30px_rgba(245,200,66,0.3)]">🎲</p>
          <h1 className={`${cinzel.className} text-3xl font-bold bg-gradient-to-r from-[#F5C842] via-[#eab308] to-[#a16207] bg-clip-text text-transparent`}>
            C-Lo Street Dice
          </h1>
          <p className="mt-3 text-sm text-violet-200/60 max-w-xs mx-auto leading-relaxed">
            Roll 4-5-6 for C-Lo — instant win. Banker sets the bank. Players bet entries.
          </p>
        </div>

        {/* Actions row */}
        <div className="flex flex-wrap gap-3 justify-center mb-8">
          {session ? (
            <button
              type="button"
              onClick={() => { setShowCreate(true); setCreateError(null); setForm(DEFAULT_FORM); }}
              className="rounded-xl bg-gradient-to-r from-[#7C3AED] to-violet-500 px-6 py-3 font-semibold text-white shadow-lg shadow-violet-900/40 hover:from-violet-500 hover:to-violet-400 transition-all text-sm"
            >
              + Create Room
            </button>
          ) : (
            <Link
              href="/login?redirect=/games/celo"
              className="rounded-xl bg-gradient-to-r from-[#F5C842] to-[#eab308] px-6 py-3 font-semibold text-black shadow-lg shadow-amber-900/30 transition-all text-sm"
            >
              Login to Play
            </Link>
          )}
          <form onSubmit={handleJoinByCode} className="flex gap-2">
            <input
              type="text"
              placeholder="Room code"
              value={lobbyCode}
              onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
              maxLength={12}
              className="w-28 rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-white placeholder:text-violet-400/40 outline-none focus:border-[#F5C842]/50 uppercase font-mono text-sm"
            />
            <button
              type="submit"
              disabled={joining}
              className="rounded-xl border border-[#F5C842]/40 bg-[#F5C842]/10 px-4 py-3 text-[#F5C842] font-semibold text-sm hover:bg-[#F5C842]/20 transition-all disabled:opacity-50"
            >
              Join
            </button>
          </form>
        </div>
        {joinError && <p className="text-center text-sm text-red-400 mb-4">{joinError}</p>}

        {/* Room list */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-violet-400/50 mb-3">
            Public Rooms ({rooms.length})
          </p>
          {rooms.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.05] bg-[#12081f]/50 p-10 text-center">
              <p className="text-violet-200/50 text-sm">No open rooms yet.</p>
              <p className="text-xs text-violet-300/40 mt-1">Be the first to create one.</p>
            </div>
          ) : (
            rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => router.push(`/games/celo/${room.id}`)}
                className="w-full rounded-2xl border border-white/[0.07] bg-[#12081f]/70 p-4 text-left hover:border-violet-500/30 hover:bg-[#1a0a2e]/80 transition-all"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{room.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[room.status] ?? "text-gray-400 bg-gray-400/10"}`}>
                        {STATUS_LABEL[room.status] ?? room.status}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full text-violet-300/60 bg-white/5">
                        {room.max_players}p max
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full text-violet-300/60 bg-white/5">
                        {room.platform_fee_pct}% fee
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[#F5C842] font-bold font-mono text-lg">${(room.current_bank_cents / 100).toFixed(2)}</p>
                    <p className="text-[10px] text-violet-300/50 mt-0.5">min ${(room.min_bet_cents / 100).toFixed(2)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Quick rules */}
        <div className="mt-12 rounded-2xl border border-white/[0.05] bg-[#12081f]/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400/60 mb-3">How to Play</p>
          <div className="grid grid-cols-1 gap-2 text-xs text-violet-200/60 leading-relaxed">
            <p><span className="text-[#F5C842] font-medium">4-5-6</span> = C-Lo — instant win. Bank grows (banker) or shrinks (player).</p>
            <p><span className="text-emerald-400 font-medium">Trips</span> or <span className="text-emerald-400 font-medium">Pair+6</span> = instant win. <span className="text-red-400 font-medium">1-2-3</span> or <span className="text-red-400 font-medium">Pair+1</span> = instant loss.</p>
            <p><span className="text-violet-300 font-medium">Pair+2-5</span> sets your point. Higher point wins. Ties go to banker.</p>
            <p>No pair = no count, roll again.</p>
          </div>
        </div>
      </div>

      {/* ── Create Room Modal ──────────────────────────────────────────────── */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[#F5C842]/20 bg-[#0e0118] shadow-2xl shadow-black/80 overflow-hidden">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.06]">
              <h2 className="font-bold text-[#F5C842] text-lg">Create Room</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-violet-300/40 hover:text-white text-2xl leading-none transition-colors"
              >×</button>
            </div>

            <form onSubmit={handleCreate} className="px-6 py-5 space-y-5 max-h-[82vh] overflow-y-auto">

              {/* ── Room Name ── */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-violet-400/70">Room Name</label>
                <input
                  type="text"
                  required
                  maxLength={40}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Bishop's Table"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white text-sm placeholder:text-violet-400/30 outline-none focus:border-[#F5C842]/50"
                />
              </div>

              {/* ── Public / Private ── */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-violet-400/70">Room Type</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["public", "private"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, room_type: t }))}
                      className={`rounded-xl border py-3 text-sm font-semibold uppercase tracking-wider transition-all ${
                        form.room_type === t
                          ? "border-[#F5C842] bg-[#F5C842]/10 text-[#F5C842] shadow-[0_0_16px_rgba(245,200,66,0.15)]"
                          : "border-white/10 text-violet-300/50 hover:border-white/20 hover:text-violet-200/70"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {form.room_type === "private" && (
                  <div className="mt-3">
                    <label className="text-[10px] uppercase tracking-widest text-violet-400/70">Join Code</label>
                    <input
                      type="text"
                      required
                      minLength={1}
                      maxLength={6}
                      value={form.join_code}
                      onChange={(e) => setForm((f) => ({ ...f, join_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }))}
                      placeholder="e.g. BALLER"
                      className="mt-1.5 w-full rounded-xl border border-[#F5C842]/30 bg-black/40 px-4 py-3 text-white text-sm placeholder:text-violet-400/30 outline-none focus:border-[#F5C842]/60 uppercase font-mono tracking-widest"
                    />
                    <p className="text-[10px] text-violet-400/50 mt-1.5">Members need this code to join</p>
                  </div>
                )}
              </div>

              {/* ── Max Players ── */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-violet-400/70">Max Players</label>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {([2, 4, 6, 10] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, max_players: n }))}
                      className={`rounded-xl border py-3 text-sm font-bold transition-all ${
                        form.max_players === n
                          ? "border-[#F5C842] bg-[#F5C842]/10 text-[#F5C842] shadow-[0_0_16px_rgba(245,200,66,0.15)]"
                          : "border-white/10 text-violet-300/50 hover:border-white/20 hover:text-violet-200/70"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Min Entry ── */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-widest text-violet-400/70">Min Entry</label>
                  <span className="text-sm font-bold text-[#F5C842] font-mono">
                    ${(form.minimum_entry_cents / 100).toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={500}
                  max={10000}
                  step={500}
                  value={form.minimum_entry_cents}
                  onChange={(e) => setMinEntry(Number(e.target.value))}
                  className="mt-2 w-full accent-[#F5C842]"
                />
                <div className="flex justify-between text-[10px] text-violet-400/40 mt-1">
                  <span>$5.00</span>
                  <span>$100.00</span>
                </div>
              </div>

              {/* ── Starting Bank ── */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-widest text-violet-400/70">Starting Bank</label>
                  <span className="text-sm font-bold text-[#F5C842] font-mono">
                    ${(form.starting_bank_cents / 100).toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={form.minimum_entry_cents}
                  max={Math.min(200000, Math.max(balanceCents, form.minimum_entry_cents * 2))}
                  step={form.minimum_entry_cents}
                  value={form.starting_bank_cents}
                  onChange={(e) => setForm((f) => ({ ...f, starting_bank_cents: Number(e.target.value) }))}
                  className="mt-2 w-full accent-[#F5C842]"
                />
                <p className={`text-[10px] mt-1.5 font-medium ${canAfford ? "text-violet-400/50" : "text-red-400"}`}>
                  {canAfford
                    ? `You need $${(form.starting_bank_cents / 100).toFixed(2)} to cover this bank`
                    : `Insufficient balance — you have $${(balanceCents / 100).toFixed(2)}`}
                </p>
              </div>

              {/* ── Summary ── */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-violet-300/70">You will reserve</span>
                  <span className="font-bold text-[#F5C842] font-mono">${(form.starting_bank_cents / 100).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-white/[0.05] pt-2">
                  <span className="text-violet-300/70">Your balance</span>
                  <span className={`font-bold font-mono ${canAfford ? "text-emerald-400" : "text-red-400"}`}>
                    ${(balanceCents / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              {createError && (
                <p className="text-sm text-red-400 text-center rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5">
                  {createError}
                </p>
              )}

              {/* ── Create button ── */}
              <button
                type="submit"
                disabled={!canSubmit}
                className={`w-full rounded-xl py-4 font-bold text-sm tracking-wide shadow-lg transition-all ${
                  canAfford
                    ? "bg-gradient-to-r from-[#F5C842] to-[#eab308] text-black shadow-amber-900/30 hover:from-[#fde047] hover:to-[#F5C842] disabled:opacity-60"
                    : "bg-red-900/40 border border-red-500/30 text-red-400 cursor-not-allowed"
                }`}
              >
                {creating
                  ? "Creating…"
                  : !canAfford
                  ? "Insufficient Balance"
                  : `CREATE ROOM — $${(form.starting_bank_cents / 100).toFixed(2)}`}
              </button>

              {!canAfford && (
                <p className="text-center text-[10px] text-violet-400/50">
                  <Link href="/dashboard/finance" className="text-[#F5C842]/70 underline underline-offset-2 hover:text-[#F5C842]">
                    Add funds to your wallet →
                  </Link>
                </p>
              )}

            </form>
          </div>
        </div>
      )}
    </main>
  );
}
