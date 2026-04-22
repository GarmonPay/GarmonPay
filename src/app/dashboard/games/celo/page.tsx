"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Cinzel_Decorative, DM_Sans } from "next/font/google";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";
import { gpcToUsdDisplay } from "@/lib/coins";

const cinzel = Cinzel_Decorative({ subsets: ["latin"], weight: ["400", "700"] });
const dm = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700"] });

type CeloRoom = {
  id: string;
  name: string;
  status: string;
  max_players: number;
  minimum_entry_sc: number | null;
  min_bet_cents: number | null;
  current_bank_sc: number | null;
  current_bank_cents: number | null;
  banker_id: string;
  created_at?: string;
};

const FILTERS = ["all", "micro", "standard", "high", "vip"] as const;
type Filter = (typeof FILTERS)[number];

function minForRoom(r: CeloRoom) {
  return r.minimum_entry_sc ?? r.min_bet_cents ?? 0;
}

function inFilter(r: CeloRoom, f: Filter): boolean {
  const m = minForRoom(r);
  if (f === "all") return true;
  if (f === "micro") return m > 0 && m <= 1000;
  if (f === "standard") return m > 1000 && m <= 5000;
  if (f === "high") return m > 5000 && m <= 10000;
  if (f === "vip") return m > 10000;
  return true;
}

const ENTRY_PILLS = [500, 1000, 2000, 5000, 10_000] as const;
const DOLLAR = [5, 10, 20, 50, 100] as const;

export default function CeloLobbyPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<CeloRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [myBalance, setMyBalance] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState({
    name: "",
    max_players: 4 as 2 | 4 | 6 | 10,
    minimum_entry_sc: 1000,
    starting_bank_sc: 2000,
  });
  const supabase = createBrowserClient();

  const loadRooms = useCallback(async () => {
    if (!supabase) return;
    setErr(null);
    const { data, error } = await supabase
      .from("celo_rooms")
      .select(
        "id, name, status, max_players, minimum_entry_sc, min_bet_cents, current_bank_sc, current_bank_cents, banker_id, created_at"
      )
      .in("status", ["waiting", "active"])
      .order("last_activity", { ascending: false });
    if (error) setErr("Could not load rooms");
    else setRooms((data as CeloRoom[]) ?? []);
  }, [supabase]);

  const loadUser = useCallback(async () => {
    if (!supabase) return;
    const s = await getSessionAsync();
    if (!s) {
      router.replace("/login?next=/dashboard/games/celo");
      return;
    }
    const { data: u } = await supabase
      .from("users")
      .select("gpay_coins")
      .eq("id", s.userId)
      .maybeSingle();
    const row = u as { gpay_coins?: number } | null;
    setMyBalance(Math.max(0, Math.floor(row?.gpay_coins ?? 0)));
  }, [supabase, router]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      setLoading(true);
      await loadRooms();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadRooms, supabase]);

  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel("celo-lobby")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_rooms" },
        () => {
          void loadRooms();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, loadRooms]);

  const totalGpc = rooms.reduce(
    (s, r) =>
      s + Math.max(0, r.current_bank_sc ?? r.current_bank_cents ?? 0),
    0
  );
  const [playerCount, setPlayerCount] = useState(0);
  useEffect(() => {
    if (!supabase || rooms.length === 0) {
      setPlayerCount(0);
      return;
    }
    void (async () => {
      const ids = rooms.map((r) => r.id);
      const { data, error } = await supabase
        .from("celo_room_players")
        .select("id")
        .in("room_id", ids);
      if (!error) setPlayerCount((data ?? []).length);
    })();
  }, [supabase, rooms]);

  const filtered = rooms.filter((r) => inFilter(r, filter));

  async function handleCreate() {
    setCreateError("");
    if (!form.name.trim()) {
      setCreateError("Name your table");
      return;
    }
    if (form.starting_bank_sc > myBalance) {
      setCreateError("Insufficient GPay Coins for starting bank");
      return;
    }
    setCreating(true);
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
      const j = (await res.json().catch(() => ({}))) as { error?: string; room?: { id: string } };
      if (!res.ok) {
        setCreateError(j.error ?? "Create failed");
        return;
      }
      if (j.room?.id) {
        setShowCreate(false);
        router.push(`/dashboard/games/celo/${j.room.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className={`min-h-screen w-full text-white ${dm.className} pb-28 md:pb-8`}
      style={{ background: "#05010F" }}
    >
      <section
        className="relative overflow-hidden"
        style={{
          padding: "40px 20px 32px",
          background: "linear-gradient(160deg, #0D0520 0%, #05010F 60%)",
        }}
      >
        <div
          className="pointer-events-none absolute left-4 top-0 h-full w-0.5"
          style={{
            background: "#7C3AED",
            boxShadow: "0 0 15px #7C3AED",
          }}
        />
        <div
          className="pointer-events-none absolute right-4 top-0 h-full w-0.5"
          style={{
            background: "#F5C842",
            boxShadow: "0 0 15px #F5C842",
          }}
        />
        <p
          className="text-center font-mono text-[11px] text-[#A855F7]"
          style={{ letterSpacing: "0.15em" }}
        >
          🎲 MIAMI STREET DICE
        </p>
        <h1
          className={`text-center font-black ${cinzel.className}`}
          style={{
            fontSize: "clamp(56px, 15vw, 112px)",
            lineHeight: 0.9,
            background: "linear-gradient(135deg, #F5C842, #D4A017)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            margin: "0 0 4px",
          }}
        >
          C-LO
        </h1>
        <p
          className="text-center font-mono text-[11px] text-[#6B7280]"
          style={{ letterSpacing: "0.1em" }}
        >
          THE FIRST LEGITIMATE DIGITAL STREET DICE
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4 font-mono text-[12px] text-[#9CA3AF]">
          <span>🎲 {rooms.length} tables live</span>
          <span>💰 {totalGpc.toLocaleString()} GPC in play</span>
          <span>👥 {playerCount} seats taken</span>
        </div>
        <div className="mt-4 text-center">
          {myBalance > 0 ? (
            <p
              className="font-mono text-[13px] text-[#F5C842]"
            >
              Your GPay Coins: {myBalance.toLocaleString()} GPC
              <span className="ml-2 text-[#6B7280]">
                ({gpcToUsdDisplay(myBalance)})
              </span>
            </p>
          ) : (
            <div className="text-[13px] text-[#EF4444]">
              <p>⚠️ You need GPay Coins to play</p>
              <p className="mt-1 space-x-3 text-[#A855F7]">
                <Link href="/dashboard/convert" className="underline">
                  Convert Gold Coins
                </Link>
                <Link href="/dashboard/coins/buy" className="underline">
                  Buy Gold Coins
                </Link>
              </p>
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className={`w-full min-h-touch max-w-sm rounded-lg px-8 py-3.5 font-bold text-[#0A0A0F] md:min-w-[200px] ${cinzel.className}`}
            style={{
              background: "linear-gradient(135deg, #F5C842, #D4A017)",
              letterSpacing: "0.05em",
            }}
          >
            Create table
          </button>
        </div>
      </section>
      <div
        className="sticky top-0 z-10 border-b"
        style={{
          background: "rgba(13,5,32,0.8)",
          borderColor: "rgba(124,58,237,0.15)",
        }}
      >
        <div className="flex max-w-4xl gap-0 overflow-x-auto px-2">
          {(
            [
              "all",
              "micro",
              "standard",
              "high",
              "vip",
            ] as const
          ).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className="min-h-touch flex-shrink-0 border-b-2 border-transparent py-3.5 px-3 font-mono text-[11px] font-bold tracking-wider"
              style={{
                borderColor: f === filter ? "#F5C842" : "transparent",
                color: f === filter ? "#F5C842" : "#6B7280",
                background: "none",
                letterSpacing: "0.06em",
                whiteSpace: "nowrap",
              }}
            >
              {f === "all"
                ? "ALL"
                : f === "high"
                  ? "HIGH ROLLER"
                  : f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div
        className="mx-auto grid max-w-4xl gap-3 p-4"
        style={{
          gridTemplateColumns: "repeat(1, minmax(0,1fr))",
        }}
      >
        {loading && (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-40 rounded-xl"
                style={{
                  background: "#0D0520",
                  animation: "pulse 1.2s ease-in-out infinite",
                }}
              />
            ))}
          </>
        )}
        {err && (
          <div
            className="rounded-xl border p-4 text-center"
            style={{ borderColor: "rgba(239,68,68,0.4)", background: "#0D0520" }}
          >
            <p className="text-sm text-amber-200/90">⚠️ {err}</p>
            <button
              type="button"
              onClick={() => void loadRooms()}
              className="mt-3 rounded-lg px-4 py-2 text-sm font-bold"
              style={{
                background: "linear-gradient(135deg, #F5C842, #D4A017)",
                color: "#0A0A0A",
              }}
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !err && filtered.length === 0 && (
          <div
            className="rounded-[14px] p-8 text-center"
            style={{ background: "#0D0520", border: "1px solid rgba(124,58,237,0.15)" }}
          >
            <div className="text-4xl">🎲</div>
            <p className={`mt-2 text-sm text-[#9CA3AF] ${cinzel.className}`}>
              No tables right now
            </p>
            <p className="mt-1 text-[13px] text-[#6B7280]">Be the first to run the bank</p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-4 rounded-lg px-6 py-2 text-sm font-bold text-[#0A0A0A]"
              style={{
                background: "linear-gradient(135deg, #F5C842, #D4A017)",
              }}
            >
              Create table
            </button>
          </div>
        )}
        {!loading &&
          filtered.map((r) => (
            <div
              key={r.id}
              className="rounded-[14px] p-4"
              style={{
                background: "#0D0520",
                border: "1px solid rgba(124,58,237,0.2)",
              }}
            >
              <div className="mb-1 flex items-start justify-between">
                <span
                  className={`text-sm font-bold text-white ${cinzel.className}`}
                >
                  {r.name}
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                    style={{ background: "#10B981" }}
                  />
                  <span className="font-mono text-[10px] text-[#10B981]">
                    LIVE
                  </span>
                </span>
              </div>
              <div
                className="my-2 grid grid-cols-2 gap-2"
                style={{ fontFamily: "ui-monospace, 'Courier New', monospace" }}
              >
                {[
                  ["BANKER", (r.banker_id ?? "—").slice(0, 4) + "…"],
                  ["PLAYERS", "— / " + r.max_players],
                  [
                    "MIN ENTRY",
                    `${(minForRoom(r) || 0).toLocaleString()} GPC`,
                  ],
                  [
                    "BANK",
                    `${(r.current_bank_sc ?? r.current_bank_cents ?? 0).toLocaleString()} GPC`,
                  ],
                ].map(([a, b]) => (
                  <div key={String(a)}>
                    <div className="text-[9px] uppercase text-[#6B7280]">
                      {a}
                    </div>
                    <div className="text-xs font-bold text-[#F5C842]">{b}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Link
                  href={`/dashboard/games/celo/${r.id}`}
                  className="min-h-touch flex-1 cursor-pointer rounded-lg border py-2.5 text-center text-xs font-bold"
                  style={{
                    borderColor: "rgba(124,58,237,0.4)",
                    color: "#A855F7",
                    fontFamily: "ui-monospace, 'Courier New', monospace",
                  }}
                >
                  👁 Watch
                </Link>
                <Link
                  href={`/dashboard/games/celo/${r.id}`}
                  className="min-h-touch min-w-0 flex-[2] cursor-pointer rounded-lg py-2.5 text-center text-xs font-bold text-[#0A0A0F] md:min-w-[200px]"
                  style={{
                    background: "linear-gradient(135deg, #F5C842, #D4A017)",
                    fontFamily: "ui-monospace, 'Courier New', monospace",
                  }}
                >
                  🎲 Join
                </Link>
              </div>
            </div>
          ))}
      </div>
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
          style={{ background: "rgba(0,0,0,0.85)" }}
        >
          <div
            className="w-full max-h-[90vh] overflow-y-auto rounded-t-3xl p-5 md:max-w-md md:rounded-2xl"
            style={{ background: "#0D0520", border: "1px solid rgba(124,58,237,0.2)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className={`text-lg text-[#F5C842] ${cinzel.className}`}>
                Create table
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-2xl leading-none text-[#6B7280] hover:text-white"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <label
              className="block text-[10px] font-mono text-[#6B7280]"
              style={{ letterSpacing: "0.1em" }}
            >
              TABLE NAME
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full min-h-touch rounded-lg border px-3.5 py-2.5"
              style={{
                background: "rgba(255,255,255,0.05)",
                borderColor: "rgba(124,58,237,0.3)",
                color: "#fff",
              }}
              placeholder="e.g. Overtown Nights"
            />
            <p className="mb-1 mt-4 text-[10px] font-mono text-[#6B7280]">MAX SEATS</p>
            <div className="flex flex-wrap gap-2">
              {([2, 4, 6, 10] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, max_players: n }))}
                  className="min-h-touch rounded-lg border px-3"
                  style={{
                    borderColor:
                      form.max_players === n
                        ? "#F5C842"
                        : "rgba(255,255,255,0.1)",
                    color: form.max_players === n ? "#F5C842" : "#9CA3AF",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mb-1 mt-3 text-[10px] font-mono text-[#6B7280]">
              MIN ENTRY
            </p>
            <div className="flex flex-wrap gap-2">
              {ENTRY_PILLS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, minimum_entry_sc: c }))}
                  className="min-h-touch rounded-lg border px-2.5"
                  style={{
                    borderColor:
                      form.minimum_entry_sc === c
                        ? "#F5C842"
                        : "rgba(255,255,255,0.1)",
                    color: form.minimum_entry_sc === c ? "#F5C842" : "#9CA3AF",
                  }}
                >
                  ${DOLLAR[i]}
                </button>
              ))}
            </div>
            <p className="mt-1 font-mono text-[11px] text-[#9CA3AF]">
              = {form.minimum_entry_sc.toLocaleString()} GPC
            </p>
            <label
              className="mb-1 mt-3 block text-[10px] font-mono text-[#6B7280]"
            >
              STARTING BANK
            </label>
            <input
              type="number"
              min={form.minimum_entry_sc}
              step={form.minimum_entry_sc}
              value={form.starting_bank_sc}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  starting_bank_sc: Math.floor(
                    Math.max(0, Number(e.target.value))
                  ),
                }))
              }
              className="w-full min-h-touch rounded-lg border px-3 py-2.5"
              style={{
                background: "rgba(255,255,255,0.05)",
                borderColor: "rgba(124,58,237,0.3)",
                color: "#fff",
              }}
            />
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Available: {myBalance.toLocaleString()} GPC
            </p>
            {form.starting_bank_sc > myBalance && (
              <p className="text-sm text-[#EF4444]">Insufficient GPay Coins</p>
            )}
            {createError && <p className="mt-2 text-sm text-[#EF4444]">{createError}</p>}
            <button
              type="button"
              disabled={creating || !form.name.trim() || form.starting_bank_sc > myBalance}
              onClick={() => void handleCreate()}
              className="mt-4 w-full min-h-[52px] font-bold"
              style={{
                background: "linear-gradient(135deg, #F5C842, #D4A017)",
                color: "#0A0A0A",
                borderRadius: 8,
                opacity: creating || !form.name.trim() || form.starting_bank_sc > myBalance ? 0.5 : 1,
              }}
            >
              {creating ? "CREATING…" : "CREATE TABLE"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="mt-2 w-full min-h-touch py-2 text-sm text-[#6B7280] hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
