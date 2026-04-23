"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Cinzel_Decorative, DM_Sans } from "next/font/google";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";
import { gpcToUsdDisplay } from "@/lib/coins";
import {
  countSeatedParticipants,
  isPublicLiveCeloRoom,
  safeBankGpcCents,
} from "@/lib/celo-lobby-stats";
import { CeloRoomCard, type CeloRoomCardData } from "@/components/celo/CeloRoomCard";

const cinzel = Cinzel_Decorative({ subsets: ["latin"], weight: ["400", "700"] });
const dm = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700"] });

const ENTRY_PILLS = [500, 1000, 2000, 5000, 10_000] as const;
const DOLLAR = [5, 10, 20, 50, 100] as const;

export default function CeloLobbyPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<CeloRoomCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [myBalance, setMyBalance] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState({
    name: "",
    max_players: 4 as 2 | 4 | 6 | 10,
    minimum_entry_sc: 1000,
    starting_bank_sc: 2000,
  });
  /** Seated player + banker count across public live rooms only; from DB, not guessed. */
  const [seatsTakenInLivePublicRooms, setSeatsTakenInLivePublicRooms] = useState(0);
  // Single stable client; creating a new client every render retriggered effects and left loading stuck.
  const supabase = useMemo(() => createBrowserClient(), []);

  const loadRooms = useCallback(async () => {
    if (!supabase) return;
    setErr(null);
    const { data, error } = await supabase
      .from("celo_rooms")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message || "Could not load rooms");
      setRooms([]);
      setSeatsTakenInLivePublicRooms(0);
      return;
    }
    const list = (data as CeloRoomCardData[]) ?? [];
    setRooms(list);

    const livePublic = list.filter(isPublicLiveCeloRoom);
    const liveIds = livePublic.map((r) => r.id);
    if (liveIds.length === 0) {
      setSeatsTakenInLivePublicRooms(0);
      return;
    }
    const { data: participations, error: pErr } = await supabase
      .from("celo_room_players")
      .select("id, role")
      .in("room_id", liveIds);
    if (pErr) {
      setSeatsTakenInLivePublicRooms(0);
      return;
    }
    setSeatsTakenInLivePublicRooms(countSeatedParticipants(participations as { role: string }[]));
  }, [supabase]);

  const filteredRooms = rooms || [];

  const livePublicRooms = useMemo(
    () => rooms.filter(isPublicLiveCeloRoom),
    [rooms]
  );

  const tablesLive = livePublicRooms.length;
  const gpcInPlay = useMemo(
    () => livePublicRooms.reduce((s, r) => s + safeBankGpcCents(r), 0),
    [livePublicRooms]
  );

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
      try {
        await loadRooms();
      } finally {
        if (!cancelled) setLoading(false);
      }
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_room_players" },
        () => {
          void loadRooms();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, loadRooms]);

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
      <div className="mx-auto max-w-6xl px-4">
        <section
          className="relative overflow-hidden pt-10"
          style={{
            background: "linear-gradient(160deg, #0D0520 0%, #05010F 60%)",
            borderRadius: 16,
            padding: "20px 12px 24px",
          }}
        >
          <div
            className="pointer-events-none absolute left-2 top-0 h-full w-0.5"
            style={{
              background: "#7C3AED",
              boxShadow: "0 0 15px #7C3AED",
            }}
          />
          <div
            className="pointer-events-none absolute right-2 top-0 h-full w-0.5"
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
              fontSize: "clamp(48px, 12vw, 100px)",
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
        </section>

        {loading ? (
          <div
            className="mb-4 h-5 w-full max-w-md mx-auto rounded bg-white/[0.06] pt-2"
            style={{ animation: "pulse 1.2s ease-in-out infinite" }}
            aria-hidden
          />
        ) : err ? null : (
          <div className="mb-4 flex flex-wrap justify-center gap-3 pt-2 font-mono text-[12px] text-[#9CA3AF]">
            <span>🎲 {tablesLive} tables live</span>
            <span>💰 {gpcInPlay.toLocaleString()} GPC in play</span>
            <span>👥 {seatsTakenInLivePublicRooms} seats taken</span>
          </div>
        )}

        <div className="text-center text-sm">
          {myBalance > 0 ? (
            <p className="font-mono text-[13px] text-[#F5C842]">
              Your GPay Coins: {myBalance.toLocaleString()} GPC
              <span className="ml-2 text-[#6B7280]">({gpcToUsdDisplay(myBalance)})</span>
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

        <div className="mb-6 flex justify-center">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-gradient-to-r from-yellow-400 to-yellow-600 px-6 py-3 font-bold text-black shadow-lg transition hover:scale-105"
          >
            CREATE TABLE
          </button>
        </div>

        <div>
          {loading && (
            <div className="space-y-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-xl"
                  style={{
                    background: "#0D0520",
                    animation: "pulse 1.2s ease-in-out infinite",
                  }}
                />
              ))}
            </div>
          )}

          {err && (
            <div
              className="mb-4 rounded-xl border p-4 text-center"
              style={{ borderColor: "rgba(239,68,68,0.4)", background: "#0D0520" }}
            >
              <p className="text-sm text-amber-200/90">⚠️ {err}</p>
              <p className="mt-1 text-xs text-gray-500">
                If the list is empty, check RLS and that `celo_rooms` has rows, or the browser console
                for ROOMS.
              </p>
              <button
                type="button"
                onClick={() => void loadRooms()}
                className="mt-3 rounded-lg bg-gradient-to-r from-yellow-400 to-yellow-600 px-4 py-2 text-sm font-bold text-black"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !err && filteredRooms.length === 0 && (
            <div className="mt-6 text-center text-gray-400">
              No tables available. Create one to start playing.
            </div>
          )}

          {!loading && !err && filteredRooms.length > 0 && (
            <ul className="w-full list-none p-0">
              {filteredRooms.map((room) => (
                <li key={room.id}>
                  <CeloRoomCard room={room} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
          style={{ background: "rgba(0,0,0,0.85)" }}
        >
          <div
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl p-5 md:max-w-md md:rounded-2xl"
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
