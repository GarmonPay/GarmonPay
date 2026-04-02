"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Cinzel_Decorative } from "next/font/google";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";

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
  speed: string;
  last_activity: string;
};

type CreateForm = {
  name: string;
  room_type: "public" | "private";
  max_players: 2 | 4 | 6;
  minimum_entry_cents: number;
  starting_bank_cents: number;
  join_code: string;
  speed: "regular" | "fast" | "blitz";
};

const DEFAULT_FORM: CreateForm = {
  name: "",
  room_type: "public",
  max_players: 4,
  minimum_entry_cents: 500,
  starting_bank_cents: 2000,
  join_code: "",
  speed: "regular",
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

const SPEED_LABEL: Record<string, string> = {
  regular: "Regular",
  fast: "Fast",
  blitz: "Blitz",
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
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const loadRooms = useCallback(async () => {
    const sb = createBrowserClient();
    if (!sb) return;
    const { data } = await sb
      .from("celo_rooms")
      .select("id,name,status,room_type,max_players,min_bet_cents,current_bank_cents,platform_fee_pct,speed,last_activity")
      .eq("room_type", "public")
      .in("status", ["waiting", "active", "rolling"])
      .order("last_activity", { ascending: false })
      .limit(30);
    setRooms((data as Room[]) ?? []);
  }, []);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) { router.replace("/login?redirect=/games/celo"); return; }
      setSession(s);
      setLoading(false);
      void loadRooms();
      if (s.accessToken) {
        fetch("/api/wallet/get", { headers: { Authorization: `Bearer ${s.accessToken}` } })
          .then((r) => (r.ok ? r.json() : {}))
          .then((d: { balance_cents?: number }) => setBalanceCents(d.balance_cents ?? 0))
          .catch(() => {});
      }
    });
  }, [router, loadRooms]);

  // Realtime: refresh room list on any celo_rooms change
  useEffect(() => {
    const sb = createBrowserClient();
    if (!sb || !session) return;
    const ch = sb
      .channel("celo-lobby-rooms")
      .on("postgres_changes", { event: "*", schema: "public", table: "celo_rooms" }, () => {
        void loadRooms();
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [session, loadRooms]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.accessToken) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/celo/room/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          room_type: form.room_type,
          max_players: form.max_players,
          minimum_entry_cents: form.minimum_entry_cents,
          starting_bank_cents: form.starting_bank_cents,
          join_code: form.room_type === "private" ? form.join_code : undefined,
          speed: form.speed,
        }),
      });
      const data = await res.json().catch(() => ({})) as { room?: { id: string }; error?: string };
      if (!res.ok) { setCreateError(data.error ?? "Failed to create room"); return; }
      router.push(`/games/celo/${data.room!.id}`);
    } catch {
      setCreateError("Network error — try again");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoinByCode(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
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

  if (loading || !session) {
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
          <button
            type="button"
            onClick={() => { setShowCreate(true); setCreateError(null); setForm(DEFAULT_FORM); }}
            className="rounded-xl bg-gradient-to-r from-[#7C3AED] to-violet-500 px-6 py-3 font-semibold text-white shadow-lg shadow-violet-900/40 hover:from-violet-500 hover:to-violet-400 transition-all text-sm"
          >
            + Create Room
          </button>
          <form onSubmit={handleJoinByCode} className="flex gap-2">
            <input
              type="text"
              placeholder="Room code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
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
                      <span className="text-[10px] px-2 py-0.5 rounded-full text-violet-300/60 bg-violet-500/10">
                        {SPEED_LABEL[room.speed] ?? room.speed}
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

      {/* Create Room Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCreate(false); } }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[#F5C842]/20 bg-[#0e0118] shadow-2xl shadow-violet-900/60 overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.06]">
              <h2 className="font-bold text-[#F5C842]">Create Room</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-violet-300/50 hover:text-white text-2xl leading-none transition-colors"
              >×</button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Name */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-violet-400/70">Room Name</label>
                <input
                  type="text"
                  required
                  maxLength={40}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Bishop's Table"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white text-sm placeholder:text-violet-400/40 outline-none focus:border-[#F5C842]/50"
                />
              </div>

              {/* Max players + Speed */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-violet-400/70">Max Players</label>
                  <select
                    value={form.max_players}
                    onChange={(e) => setForm((f) => ({ ...f, max_players: Number(e.target.value) as 2 | 4 | 6 }))}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#1a0a2e] px-3 py-3 text-white text-sm outline-none focus:border-[#F5C842]/50"
                  >
                    <option value={2}>2 Players</option>
                    <option value={4}>4 Players</option>
                    <option value={6}>6 Players</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-violet-400/70">Speed</label>
                  <select
                    value={form.speed}
                    onChange={(e) => setForm((f) => ({ ...f, speed: e.target.value as "regular" | "fast" | "blitz" }))}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#1a0a2e] px-3 py-3 text-white text-sm outline-none focus:border-[#F5C842]/50"
                  >
                    <option value="regular">Regular</option>
                    <option value="fast">Fast</option>
                    <option value="blitz">Blitz</option>
                  </select>
                </div>
              </div>

              {/* Min entry */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-violet-400/70">
                  Min Entry — <span className="text-[#F5C842]">${(form.minimum_entry_cents / 100).toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min={500}
                  max={10000}
                  step={500}
                  value={form.minimum_entry_cents}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setForm((f) => ({
                      ...f,
                      minimum_entry_cents: v,
                      starting_bank_cents: Math.max(f.starting_bank_cents, v),
                    }));
                  }}
                  className="mt-2 w-full accent-[#F5C842]"
                />
              </div>

              {/* Starting bank */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-violet-400/70">
                  Starting Bank — <span className="text-[#F5C842]">${(form.starting_bank_cents / 100).toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min={form.minimum_entry_cents}
                  max={100000}
                  step={500}
                  value={form.starting_bank_cents}
                  onChange={(e) => setForm((f) => ({ ...f, starting_bank_cents: Number(e.target.value) }))}
                  className="mt-2 w-full accent-[#F5C842]"
                />
                <p className="text-[10px] text-violet-400/50 mt-1">
                  Your balance: ${(balanceCents / 100).toFixed(2)}
                </p>
              </div>

              {/* Room type */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-violet-400/70">Room Type</label>
                <div className="mt-2 flex gap-2">
                  {(["public", "private"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, room_type: t }))}
                      className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition-all capitalize ${
                        form.room_type === t
                          ? "border-[#F5C842]/50 bg-[#F5C842]/10 text-[#F5C842]"
                          : "border-white/10 text-violet-300/60 hover:border-white/20"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {form.room_type === "private" && (
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-violet-400/70">Join Code</label>
                  <input
                    type="text"
                    required
                    maxLength={12}
                    value={form.join_code}
                    onChange={(e) => setForm((f) => ({ ...f, join_code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. BALLER"
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white text-sm placeholder:text-violet-400/40 outline-none focus:border-[#F5C842]/50 uppercase font-mono"
                  />
                </div>
              )}

              {createError && <p className="text-sm text-red-400 text-center">{createError}</p>}

              <button
                type="submit"
                disabled={creating || balanceCents < form.starting_bank_cents}
                className="w-full rounded-xl bg-gradient-to-r from-[#7C3AED] to-violet-500 py-3.5 font-semibold text-white shadow-lg shadow-violet-900/40 disabled:opacity-50 transition-all hover:from-violet-500 hover:to-violet-400 text-sm"
              >
                {creating
                  ? "Creating…"
                  : `Create & Bank $${(form.starting_bank_cents / 100).toFixed(2)}`}
              </button>

              {balanceCents < form.starting_bank_cents && (
                <p className="text-[10px] text-amber-400/70 text-center">
                  Insufficient balance for this bank size.{" "}
                  <Link href="/dashboard/finance" className="underline">Add funds →</Link>
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
