"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Cinzel_Decorative, DM_Sans } from "next/font/google";
import { createBrowserClient } from "@/lib/supabase";
import { useCoins } from "@/hooks/useCoins";

const cinzel = Cinzel_Decorative({ weight: "400", subsets: ["latin"] });
const dmSans = DM_Sans({ subsets: ["latin"] });

type Filter = "all" | "micro" | "standard" | "high" | "vip";

type RoomRow = {
  id: string;
  name: string;
  status: string;
  banker_id: string | null;
  max_players: number;
  minimum_entry_sc?: number | null;
  current_bank_sc?: number | null;
  created_at?: string | null;
};

function minEntry(r: RoomRow) {
  return Math.floor(Number(r.minimum_entry_sc ?? 0));
}

function bankAmt(r: RoomRow) {
  return Math.floor(Number(r.current_bank_sc ?? 0));
}

export default function CeloLobbyPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserClient(), []);
  const { gpayCoins, formatGPC, refresh, loading: coinsLoading } = useCoins();

  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [names, setNames] = useState<Record<string, string>>({});
  const [playerCounts, setPlayerCounts] = useState<Record<string, number>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    max_players: 6 as 2 | 4 | 6 | 10,
    minimum_entry_sc: 500,
    starting_bank_sc: 500,
  });
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const loadRooms = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setError(null);
    const { data, error: qErr } = await supabase
      .from("celo_rooms")
      .select(
        "id,name,status,banker_id,max_players,minimum_entry_sc,current_bank_sc,created_at"
      )
      .eq("room_type", "public")
      .in("status", ["waiting", "active", "rolling"])
      .order("last_activity", { ascending: false })
      .limit(80);

    if (qErr) {
      setError(qErr.message);
      setRooms([]);
      setLoading(false);
      return;
    }

    const list = (data ?? []) as RoomRow[];
    setRooms(list);

    const roomIds = list.map((r) => r.id);
    const countMap = new Map<string, number>();
    if (roomIds.length && supabase) {
      const { data: prs } = await supabase.from("celo_room_players").select("room_id").in("room_id", roomIds);
      for (const row of prs ?? []) {
        const rid = String((row as { room_id: string }).room_id);
        countMap.set(rid, (countMap.get(rid) ?? 0) + 1);
      }
    }
    const pc: Record<string, number> = {};
    countMap.forEach((v, k) => {
      pc[k] = v;
    });
    setPlayerCounts(pc);

    const ids = Array.from(new Set(list.map((r) => r.banker_id).filter(Boolean) as string[]));
    if (ids.length) {
      const { data: users } = await supabase.from("users").select("id,full_name,email").in("id", ids);
      const map: Record<string, string> = {};
      for (const u of users ?? []) {
        const row = u as { id: string; full_name?: string | null; email?: string | null };
        map[row.id] = row.full_name?.trim() || row.email?.split("@")[0] || "Player";
      }
      setNames(map);
    } else {
      setNames({});
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("celo-lobby-rooms")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_rooms" },
        () => {
          void loadRooms();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, loadRooms]);

  const filtered = useMemo(() => {
    return rooms.filter((r) => {
      const m = minEntry(r);
      if (filter === "all") return true;
      if (filter === "micro") return m <= 1000;
      if (filter === "standard") return m >= 1001 && m <= 5000;
      if (filter === "high") return m >= 5001 && m <= 10000;
      if (filter === "vip") return m > 10000;
      return true;
    });
  }, [rooms, filter]);

  const gpcInPlay = useMemo(() => filtered.reduce((s, r) => s + bankAmt(r), 0), [filtered]);
  const liveCount = filtered.length;

  async function handleCreate() {
    if (!form.name.trim()) {
      setCreateError("Enter a room name");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/celo/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name.trim(),
          max_players: form.max_players,
          minimum_entry_sc: form.minimum_entry_sc,
          starting_bank_sc: form.starting_bank_sc,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(typeof data.error === "string" ? data.error : "Failed to create room");
        return;
      }
      if (data.room?.id) {
        setModalOpen(false);
        router.push(`/dashboard/games/celo/${data.room.id}`);
      }
    } catch {
      setCreateError("Connection error. Try again.");
    } finally {
      setCreating(false);
      void refresh();
    }
  }

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "ALL" },
    { id: "micro", label: "MICRO" },
    { id: "standard", label: "STANDARD" },
    { id: "high", label: "HIGH ROLLER" },
    { id: "vip", label: "VIP" },
  ];

  return (
    <div
      className={`${dmSans.className} min-h-screen text-white`}
      style={{ backgroundColor: "#05010F", paddingBottom: 100 }}
    >
      <div className="max-w-5xl mx-auto px-4 pt-8 pb-4">
        <div
          className="rounded-2xl p-6 md:p-8 mb-8 relative overflow-hidden"
          style={{
            backgroundColor: "#0D0520",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1"
            style={{ background: "linear-gradient(180deg,#7C3AED,#4C1D95)", boxShadow: "0 0 20px #7C3AED" }}
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-1"
            style={{ background: "linear-gradient(180deg,#F5C842,#B45309)", boxShadow: "0 0 20px #F5C842" }}
          />
          <div className="relative pl-4">
            <h1 className={`${cinzel.className} text-4xl md:text-5xl`} style={{ color: "#F5C842" }}>
              C-Lo
            </h1>
            <p className="text-sm md:text-base text-white/70 mt-2 max-w-xl">
              THE FIRST LEGITIMATE DIGITAL STREET DICE
            </p>
            <p className="text-xs text-white/50 mt-4">
              {liveCount} tables live · {gpcInPlay.toLocaleString()} GPC on tables
            </p>
            <div className="mt-4 text-sm" style={{ color: "#F5C842" }}>
              {coinsLoading ? "…" : `Your GPay Coins: ${formatGPC(gpayCoins)}`}
            </div>
            {gpayCoins <= 0 && !coinsLoading && (
              <p className="text-sm text-amber-200/90 mt-2">
                You need GPay Coins to play.{" "}
                <Link href="/dashboard/coins/buy" className="underline" style={{ color: "#7C3AED" }}>
                  Buy Gold Coins
                </Link>{" "}
                ·{" "}
                <Link href="/dashboard/convert" className="underline" style={{ color: "#7C3AED" }}>
                  Convert GC
                </Link>
              </p>
            )}
            <button
              type="button"
              className="mt-6 rounded-xl px-6 py-3 font-semibold text-black"
              style={{ backgroundColor: "#F5C842" }}
              onClick={() => setModalOpen(true)}
            >
              CREATE TABLE
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-thin">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="shrink-0 px-4 py-2 rounded-full text-xs font-semibold border border-white/10"
              style={{
                color: filter === f.id ? "#F5C842" : "rgba(255,255,255,0.55)",
                borderBottom: filter === f.id ? "2px solid #F5C842" : undefined,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <button type="button" className="underline" onClick={() => void loadRooms()}>
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <p style={{ color: "#F5C842" }}>Loading tables…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-white/10" style={{ backgroundColor: "#0D0520" }}>
            <div className="text-4xl mb-3">🎲</div>
            <p className={`${cinzel.className} text-xl`} style={{ color: "#F5C842" }}>
              No tables yet
            </p>
            <p className="text-white/50 text-sm mt-2">Be the first to create a table</p>
            <button
              type="button"
              className="mt-6 rounded-xl px-6 py-3 font-semibold text-black"
              style={{ backgroundColor: "#F5C842" }}
              onClick={() => setModalOpen(true)}
            >
              CREATE TABLE
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((r) => {
              const bid = r.banker_id ?? "";
              const bankerLabel = bid ? names[bid] ?? "…" : "—";
              const atTable = playerCounts[r.id] ?? 0;
              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-white/10 p-5"
                  style={{ backgroundColor: "#0D0520" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className={`${cinzel.className} text-lg text-white truncate`}>{r.name}</h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                      LIVE
                    </span>
                  </div>
                  <p className="text-xs text-white/50 mt-1">Banker · {bankerLabel}</p>
                  <p className="text-xs text-white/40 mt-1">
                    At table: {atTable}/{r.max_players}
                  </p>
                  <p className="text-sm text-white/80 mt-3">
                    Min entry {minEntry(r).toLocaleString()} GPC · Bank {bankAmt(r).toLocaleString()} GPC
                  </p>
                  <div className="flex gap-2 mt-4">
                    <Link
                      href={`/dashboard/games/celo/${r.id}`}
                      className="flex-1 text-center rounded-xl py-2 text-sm font-semibold border border-white/15 text-white/80"
                    >
                      WATCH
                    </Link>
                    <Link
                      href={`/dashboard/games/celo/${r.id}`}
                      className="flex-1 text-center rounded-xl py-2 text-sm font-semibold text-black"
                      style={{ backgroundColor: "#7C3AED" }}
                    >
                      JOIN TABLE
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 px-3 py-6">
          <div
            className="w-full max-w-md rounded-t-2xl md:rounded-2xl p-6 border border-white/10"
            style={{ backgroundColor: "#0D0520" }}
          >
            <h3 className={`${cinzel.className} text-xl mb-4`} style={{ color: "#F5C842" }}>
              Create table
            </h3>
            <label className="block text-xs text-white/50 mb-1">Table name</label>
            <input
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 text-white mb-4"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Name your table"
            />
            <p className="text-xs text-white/50 mb-2">Max players</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {([2, 4, 6, 10] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, max_players: n }))}
                  className={`rounded-full px-4 py-2 text-sm font-semibold border ${
                    form.max_players === n ? "border-[#F5C842] text-[#F5C842]" : "border-white/10 text-white/60"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-white/50 mb-2">Minimum entry</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {[500, 1000, 2000, 5000, 10000].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      minimum_entry_sc: n,
                      starting_bank_sc: Math.max(n, f.starting_bank_sc),
                    }))
                  }
                  className={`rounded-full px-3 py-2 text-xs font-semibold border ${
                    form.minimum_entry_sc === n ? "border-[#F5C842] text-[#F5C842]" : "border-white/10 text-white/60"
                  }`}
                >
                  ${(n / 100).toFixed(0)}
                </button>
              ))}
            </div>
            <label className="block text-xs text-white/50 mb-1">Starting bank (GPC)</label>
            <input
              type="number"
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 text-white mb-2"
              value={form.starting_bank_sc}
              min={form.minimum_entry_sc}
              step={form.minimum_entry_sc}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  starting_bank_sc: Number(e.target.value),
                }))
              }
            />
            <p className="text-xs text-white/40 mb-2">Available: {formatGPC(gpayCoins)}</p>
            {createError && <p className="text-xs text-red-400 mb-2">{createError}</p>}
            {form.starting_bank_sc > gpayCoins && (
              <p className="text-xs text-red-400 mb-2">Insufficient GPC for this bank.</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl py-3 border border-white/10 text-white/70"
                onClick={() => {
                  setModalOpen(false);
                  setCreateError("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !form.name.trim() ||
                  form.starting_bank_sc > gpayCoins ||
                  creating ||
                  form.starting_bank_sc % form.minimum_entry_sc !== 0
                }
                className="flex-1 rounded-xl py-3 font-semibold text-black disabled:opacity-40"
                style={{ backgroundColor: "#F5C842" }}
                onClick={() => void handleCreate()}
              >
                {creating ? "…" : "CREATE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
