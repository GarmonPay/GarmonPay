"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Cinzel_Decorative, DM_Sans } from "next/font/google";
import { createBrowserClient } from "@/lib/supabase";
import { gpcToUsdDisplay } from "@/lib/coins";
import {
  computeGarmonFourSettlement,
  GARMONFOUR_MIN_ENTRY_GPC,
} from "@/lib/connect-four";

const cinzel = Cinzel_Decorative({ subsets: ["latin"], weight: ["400", "700"] });
const dm = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700"] });

const ENTRY_PILLS = [100, 500, 1000, 2500, 5000] as const;
const API = "/api/garmonfour";

type OpenRoom = {
  id: string;
  createdAt: string;
  entryAmountMinor: number;
  creatorLabel: string;
};

export default function GarmonFourLobbyPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [myBalance, setMyBalance] = useState(0);
  const [entry, setEntry] = useState(500);
  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([]);
  const [myWaitingId, setMyWaitingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const authHeaders = useCallback(
    (json = true) => {
      const h: Record<string, string> = {};
      if (json) h["Content-Type"] = "application/json";
      if (token) h.Authorization = `Bearer ${token}`;
      return h;
    },
    [token]
  );

  const loadBalance = useCallback(async () => {
    if (!supabase || !token) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    const { data: u } = await supabase.from("users").select("gpay_coins").eq("id", uid).maybeSingle();
    const row = u as { gpay_coins?: number } | null;
    setMyBalance(Math.max(0, Math.floor(row?.gpay_coins ?? 0)));
  }, [supabase, token]);

  const loadOpen = useCallback(async () => {
    if (!token) return;
    setLoadErr(null);
    const r = await fetch(`${API}/open`, { credentials: "include", headers: authHeaders(false) });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { message?: string };
      setLoadErr(j.message ?? "Could not load open rooms");
      setOpenRooms([]);
      return;
    }
    const d = (await r.json()) as { rooms?: OpenRoom[] };
    setOpenRooms(Array.isArray(d.rooms) ? d.rooms : []);
  }, [token, authHeaders]);

  const loadMyWaiting = useCallback(async () => {
    if (!supabase || !token) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) {
      setMyWaitingId(null);
      return;
    }
    const { data } = await supabase
      .from("garmonfour_rooms")
      .select("id")
      .eq("creator_id", uid)
      .eq("status", "waiting")
      .maybeSingle();
    setMyWaitingId((data as { id?: string } | null)?.id ?? null);
  }, [supabase, token]);

  useEffect(() => {
    if (!supabase) {
      setLoadingSession(false);
      return;
    }
    const sync = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const u = session?.user as { email_confirmed_at?: string | null } | undefined;
      if (!session?.user || u?.email_confirmed_at == null || u?.email_confirmed_at === "") {
        setToken(null);
      } else {
        setToken(session.access_token);
      }
      setLoadingSession(false);
    };
    void sync();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void sync();
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!token || !supabase) return;
    void loadBalance();
    void loadOpen();
    void loadMyWaiting();
    const ch = supabase
      .channel("garmonfour-lobby")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "garmonfour_rooms" },
        () => {
          void loadOpen();
          void loadMyWaiting();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [token, supabase, loadOpen, loadMyWaiting, loadBalance]);

  useEffect(() => {
    if (loadingSession) return;
    if (!token) {
      router.replace("/login?next=/dashboard/games/garmonfour");
    }
  }, [token, router, loadingSession]);

  const settlement = computeGarmonFourSettlement(entry);
  const canAfford = myBalance >= entry;

  async function handleCreate() {
    if (!token) return;
    setErr(null);
    if (entry < GARMONFOUR_MIN_ENTRY_GPC || !canAfford) {
      setErr(`Need at least ${GARMONFOUR_MIN_ENTRY_GPC} GPC and sufficient balance`);
      return;
    }
    setBusy(true);
    try {
      const reference = `garmonfour_create_${crypto.randomUUID()}`;
      const res = await fetch(`${API}/post-entry`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ op: "create", entryAmount: entry, reference }),
      });
      const j = (await res.json().catch(() => ({}))) as { message?: string; roomId?: string };
      if (!res.ok) {
        setErr(j.message ?? "Create failed");
        return;
      }
      if (j.roomId) {
        router.push(`/dashboard/games/garmonfour/${j.roomId}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(roomId: string, stake: number) {
    if (!token) return;
    setErr(null);
    if (myBalance < stake) {
      setErr("Insufficient GPay Coins");
      return;
    }
    setBusy(true);
    try {
      const reference = `garmonfour_join_${roomId}_${crypto.randomUUID()}`;
      const res = await fetch(`${API}/post-entry`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ op: "join", roomId, entryAmount: stake, reference }),
      });
      const j = (await res.json().catch(() => ({}))) as { message?: string; roomId?: string };
      if (!res.ok) {
        setErr(j.message ?? "Join failed");
        void loadOpen();
        return;
      }
      if (j.roomId) {
        router.push(`/dashboard/games/garmonfour/${j.roomId}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelWaiting() {
    if (!token || !myWaitingId) return;
    if (!window.confirm("Cancel your open table? Your entry will be refunded.")) return;
    setErr(null);
    setBusy(true);
    try {
      const reference = `garmonfour_cancel_${myWaitingId}_${crypto.randomUUID()}`;
      const res = await fetch(`${API}/cancel`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ roomId: myWaitingId, reference }),
      });
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setErr(j.message ?? "Cancel failed");
        return;
      }
      void loadBalance();
      void loadOpen();
      void loadMyWaiting();
    } finally {
      setBusy(false);
    }
  }

  if (loadingSession) {
    return (
      <div
        className={`flex min-h-[200px] items-center justify-center text-white/60 ${dm.className}`}
        style={{ background: "#0e0118" }}
      >
        Loading…
      </div>
    );
  }

  if (!token) {
    return null;
  }

  return (
    <div
      className={`min-h-screen w-full pb-28 text-white ${dm.className}`}
      style={{ background: "#0e0118" }}
    >
      <div className="mx-auto w-full max-w-lg px-4 pt-6">
        <p
          className="text-center font-mono text-[10px] text-[#A855F7] sm:text-[11px]"
          style={{ letterSpacing: "0.15em" }}
        >
          PVP · GPC POT · 10% PLATFORM FEE
        </p>
        <h1
          className={`mt-1 text-center text-4xl font-black sm:text-5xl ${cinzel.className}`}
          style={{
            background: "linear-gradient(135deg, #F5C842, #D4A017)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          GarmonFour
        </h1>
        <p className="mt-2 text-center text-sm text-white/60">
          Drop discs and connect four. Beat your opponent and take the pot.
        </p>

        <div className="mt-6 rounded-2xl border border-[#7c3aed]/30 bg-black/25 p-4">
          <p className="font-mono text-xs text-[#f5c842]">
            Balance: {myBalance.toLocaleString()} GPC
            <span className="ml-2 text-white/50">({gpcToUsdDisplay(myBalance)})</span>
          </p>
          <p className="mt-2 text-xs text-white/55">
            Winner takes {settlement.winnerPayoutGpc.toLocaleString()} GPC after 10% fee ({" "}
            {(settlement.totalPotGpc / 2).toLocaleString()} GPC entry each).
          </p>
        </div>

        <div className="mt-6">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-white/45">Entry (GPC)</p>
          <div className="flex flex-wrap gap-2">
            {ENTRY_PILLS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={busy}
                onClick={() => setEntry(c)}
                className="rounded-lg border px-3 py-2 text-sm font-medium transition"
                style={{
                  borderColor: entry === c ? "#f5c842" : "rgba(124,58,237,0.35)",
                  color: entry === c ? "#f5c842" : "#9CA3AF",
                  background: entry === c ? "rgba(245,200,66,0.08)" : "transparent",
                }}
              >
                {c.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {err && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {err}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            disabled={busy || entry < GARMONFOUR_MIN_ENTRY_GPC || !canAfford}
            onClick={() => void handleCreate()}
            className="w-full rounded-xl py-3.5 text-base font-bold text-black transition disabled:opacity-40"
            style={{
              background: "linear-gradient(135deg, #F5C842, #D4A017)",
              boxShadow: "0 0 24px rgba(124,58,237,0.25)",
            }}
          >
            {busy ? "Working…" : "Create room"}
          </button>

          {myWaitingId && (
            <div className="flex flex-col gap-2 rounded-xl border border-[#7c3aed]/40 bg-[#7c3aed]/10 p-3">
              <p className="text-sm text-white/80">You have a table waiting for an opponent.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => router.push(`/dashboard/games/garmonfour/${myWaitingId}`)}
                  className="rounded-lg border border-[#f5c842]/50 px-4 py-2 text-sm font-semibold text-[#f5c842]"
                >
                  Open table
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleCancelWaiting()}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/70"
                >
                  Cancel & refund
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-10">
          <h2 className={`mb-3 text-lg text-[#f5c842] ${cinzel.className}`}>Open rooms</h2>
          {loadErr && <p className="text-sm text-amber-200/90">{loadErr}</p>}
          {!loadErr && openRooms.length === 0 && (
            <p className="text-sm text-white/50">No open tables right now. Create one above.</p>
          )}
          <ul className="mt-3 space-y-3 p-0">
            {openRooms.map((room) => (
              <li
                key={room.id}
                className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-white">{room.creatorLabel}</p>
                  <p className="text-xs text-white/55">
                    Entry {room.entryAmountMinor.toLocaleString()} GPC · Pot{" "}
                    {(room.entryAmountMinor * 2).toLocaleString()} GPC
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy || myBalance < room.entryAmountMinor}
                  onClick={() => void handleJoin(room.id, room.entryAmountMinor)}
                  className="rounded-lg px-4 py-2 text-sm font-bold text-black disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #F5C842, #D4A017)" }}
                >
                  Join
                </button>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-10 text-center text-xs text-white/40">
          <Link href="/games" className="text-[#7c3aed] underline">
            Game Station
          </Link>
          {" · "}
          <Link href="/dashboard/games/celo" className="text-[#7c3aed] underline">
            C-Lo
          </Link>
        </p>
      </div>
    </div>
  );
}
