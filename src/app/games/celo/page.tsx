"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Cinzel_Decorative } from "next/font/google";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";
import { consumeCeloPublicLobbyStale } from "@/lib/celo-public-lobby-client";
import { scToUsdDisplay } from "@/lib/coins";
import { useCoins } from "@/hooks/useCoins";

function formatScLine(sc: number): string {
  const n = Math.max(0, Math.floor(Number(sc)));
  return `${n.toLocaleString()} SC (${scToUsdDisplay(n)})`;
}

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
  const { sweepsCoins, formatSC, refresh: refreshCoins } = useCoins();
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
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

  /** Canonical lobby list — service role + stale cleanup; bypasses RLS (fixes mobile vs desktop). */
  const loadPublicRooms = useCallback(async () => {
    console.info("[celo-lobby-debug] loadPublicRooms start");
    try {
      const res = await fetch("/api/celo/rooms/public", {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      console.info("[celo-lobby-debug] loadPublicRooms response status", res.status);
      if (!res.ok) {
        console.warn("[celo-lobby-debug] loadPublicRooms non-OK, keeping previous rooms");
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { rooms?: Record<string, unknown>[] };
      const rows = json.rooms ?? [];
      const mapped = rows
        .map((row) => mapRowToLobbyRoom(row))
        .filter((x): x is Room => x !== null);
      console.info("[celo-lobby-debug] loadPublicRooms room count", mapped.length, {
        ids: mapped.map((r) => r.id),
        join_codes: rows.map((row) => String(row.join_code ?? "")),
      });
      setRooms(mapped);
    } catch (e) {
      console.warn("[celo-lobby-debug] loadPublicRooms error", e);
    }
  }, [mapRowToLobbyRoom]);

  const lobbyRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleLobbyRefetch = useCallback(() => {
    if (lobbyRefetchTimer.current) clearTimeout(lobbyRefetchTimer.current);
    lobbyRefetchTimer.current = setTimeout(() => {
      lobbyRefetchTimer.current = null;
      void loadPublicRooms();
    }, 200);
  }, [loadPublicRooms]);

  useEffect(() => {
    if (!showCreate) return;
    void refreshCoins();
  }, [showCreate, refreshCoins]);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        setLoading(false);
        return;
      }
      setSession(s);
      if (s.accessToken) {
        void refreshCoins();
      }
    });
  }, [refreshCoins]);

  /** Keep starting bank ≤ SC balance. */
  useEffect(() => {
    if (!showCreate || sweepsCoins <= 0) return;
    setForm((f) => {
      const cap = Math.min(sweepsCoins, 200_000);
      const step = f.minimum_entry_cents;
      let sb = f.starting_bank_cents;
      if (sb > cap) sb = Math.floor(cap / step) * step;
      if (sb < step) sb = step;
      if (sb === f.starting_bank_cents) return f;
      return { ...f, starting_bank_cents: sb };
    });
  }, [showCreate, sweepsCoins]);

  useEffect(() => {
    let isMounted = true;
    if (consumeCeloPublicLobbyStale()) {
      console.info("[celo-lobby-debug] consumed stale flag from room page — refetching");
    }
    /** Eager fetch: do not wait for Realtime SUBSCRIBED (fixes slow mobile / delayed first paint). */
    void loadPublicRooms().finally(() => {
      if (isMounted) setLoading(false);
    });

    const sb = createBrowserClient();
    if (!sb) {
      return () => {
        isMounted = false;
        if (lobbyRefetchTimer.current) clearTimeout(lobbyRefetchTimer.current);
      };
    }

    const onRoomsChange = () => {
      if (!isMounted) return;
      scheduleLobbyRefetch();
    };

    const channel = sb
      .channel("celo-lobby-v2")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "celo_rooms",
        },
        onRoomsChange
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "celo_rooms",
        },
        onRoomsChange
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "celo_rooms",
        },
        onRoomsChange
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && isMounted) {
          void loadPublicRooms();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (isMounted) void loadPublicRooms();
        }
      });

    const poll = window.setInterval(() => {
      if (isMounted) void loadPublicRooms();
    }, 60_000);

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && isMounted) {
        console.info("[celo-lobby-debug] pageshow from bfcache — refetch");
        void loadPublicRooms();
      }
    };
    window.addEventListener("pageshow", onPageShow);

    let visTimer: ReturnType<typeof setTimeout> | null = null;
    const onVis = () => {
      if (document.visibilityState !== "visible" || !isMounted) return;
      if (visTimer) clearTimeout(visTimer);
      visTimer = setTimeout(() => {
        visTimer = null;
        console.info("[celo-lobby-debug] visibility visible — refetch");
        void loadPublicRooms();
      }, 400);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      isMounted = false;
      if (lobbyRefetchTimer.current) clearTimeout(lobbyRefetchTimer.current);
      if (visTimer) clearTimeout(visTimer);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(poll);
      sb.removeChannel(channel);
    };
  }, [loadPublicRooms, scheduleLobbyRefetch]);

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

      // Do not navigate until the API returns a persisted room row (no optimistic room state).
      if (!res.ok) {
        console.error("Create room error:", data);
        setCreateError(data.details || data.error || "Failed to create room");
        return;
      }
      if (data.room?.id) {
        void loadPublicRooms();
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
    try {
      const res = await fetch(`/api/celo/room/lookup?code=${encodeURIComponent(code)}`);
      const data = (await res.json().catch(() => ({}))) as { roomId?: string; error?: string };
      if (!res.ok || !data.roomId) {
        setJoinError(data.error ?? "No active room with that code");
        return;
      }
      router.push(`/games/celo/${data.roomId}`);
    } catch {
      setJoinError("Lookup failed — try again");
    } finally {
      setJoining(false);
    }
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

  /** Form fields are SC amounts (legacy `_cents` names); compare to SC wallet. */
  const minimumEntryCents = form.minimum_entry_cents;
  const startingBankCents = form.starting_bank_cents;
  const hasEnough = sweepsCoins >= startingBankCents;
  const shortfallSc = Math.max(0, startingBankCents - sweepsCoins);
  const canSubmit =
    !creating &&
    hasEnough &&
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
            <p className="text-[10px] uppercase tracking-widest text-violet-400/60">Balances</p>
            <p className="text-base font-bold text-[#F5C842] font-mono leading-snug mt-0.5">
              Your balance: {formatSC(sweepsCoins)}
            </p>
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
                    <p className="text-[#F5C842] font-bold font-mono text-sm leading-tight">{formatScLine(room.current_bank_cents)}</p>
                    <p className="text-[10px] text-violet-300/50 mt-0.5">min {formatScLine(room.min_bet_cents)}</p>
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
                    {formatScLine(form.minimum_entry_cents)}
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
                  <span>500 SC ($5.00)</span>
                  <span>10,000 SC ($100.00)</span>
                </div>
              </div>

              {/* ── Starting Bank ── */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-widest text-violet-400/70">Starting Bank</label>
                  <span className="text-sm font-bold text-[#F5C842] font-mono">
                    {formatScLine(form.starting_bank_cents)}
                  </span>
                </div>
                <input
                  type="range"
                  min={minimumEntryCents}
                  max={Math.max(minimumEntryCents, sweepsCoins > 0 ? sweepsCoins : minimumEntryCents)}
                  step={minimumEntryCents}
                  value={startingBankCents}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      starting_bank_cents: Number(e.target.value),
                    }))
                  }
                  className="mt-2 w-full accent-[#F5C842]"
                />
                <p
                  className={`text-[10px] mt-1.5 font-medium ${
                    hasEnough ? "text-emerald-400/90" : "text-red-400"
                  }`}
                >
                  {hasEnough ? (
                    <>Your balance: {formatSC(sweepsCoins)} — enough to reserve this bank.</>
                  ) : (
                    <>
                      You need {shortfallSc.toLocaleString()} more SC to reserve {startingBankCents.toLocaleString()} SC (
                      {scToUsdDisplay(startingBankCents)}).
                    </>
                  )}
                </p>
              </div>

              {/* ── Summary ── */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-violet-300/70">You will reserve</span>
                  <span className="font-bold text-[#F5C842] font-mono text-xs">{formatScLine(form.starting_bank_cents)}</span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-white/[0.05] pt-2">
                  <span className="text-violet-300/70">Your balance</span>
                  <span className={`font-bold font-mono text-xs ${hasEnough ? "text-emerald-400" : "text-red-400"}`}>
                    {formatSC(sweepsCoins)}
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
                  hasEnough
                    ? "bg-gradient-to-r from-[#F5C842] to-[#eab308] text-black shadow-amber-900/30 hover:from-[#fde047] hover:to-[#F5C842] disabled:opacity-60"
                    : "bg-red-900/40 border border-red-500/30 text-red-400 cursor-not-allowed"
                }`}
              >
                {creating
                  ? "Creating…"
                  : !hasEnough
                  ? "Insufficient Balance"
                  : `CREATE ROOM — ${formatScLine(form.starting_bank_cents)}`}
              </button>

              {!hasEnough && (
                <p className="text-center text-[10px] text-violet-400/50">
                  <Link href="/dashboard/wallet" className="text-[#F5C842]/70 underline underline-offset-2 hover:text-[#F5C842]">
                    Get more SC →
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
