"use client";

import { Cinzel_Decorative } from "next/font/google";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase";
import { getSessionAsync } from "@/lib/session";
import { useCoins } from "@/hooks/useCoins";
import {
  CeloEmptyRoomsCard,
  CeloLiveStatusStrip,
  CeloReadinessPanel,
  CeloRoomsReconnectCard,
} from "@/components/celo/CeloLobbySections";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

interface CeloRoom {
  id: string;
  name: string;
  banker_id: string;
  status: string;
  room_type: string;
  minimum_entry_sc: number;
  current_bank_sc: number;
  max_players: number;
  created_at: string;
  last_activity: string;
  banker?: {
    full_name: string;
    email: string;
  };
  player_count?: number;
}

interface CreateRoomForm {
  name: string;
  max_players: number;
  minimum_entry_sc: number;
  starting_bank_sc: number;
}

/** Supabase may return null; never call .toLocaleString on undefined */
function safeSc(n: unknown): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

export default function CeloLobbyPage() {
  const router = useRouter();
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const { goldCoins, gpayCoins, refresh: refreshCoins, formatGPC } = useCoins();

  const [rooms, setRooms] = useState<CeloRoom[]>([]);
  const [loading, setLoading] = useState(true);
  /** Room list failed — show soft error UI and auto-retry in background */
  const [roomsUnavailable, setRoomsUnavailable] = useState(false);
  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState<CreateRoomForm>({
    name: "",
    max_players: 6,
    minimum_entry_sc: 500,
    starting_bank_sc: 500,
  });

  const loadRooms = useCallback(async (sb: SupabaseClient) => {
    const withBanker = await sb
      .from("celo_rooms")
      .select(
        `
        *,
        banker:users!celo_rooms_banker_id_fkey(
          full_name, email
        )
      `
      )
      .eq("status", "waiting")
      .or("room_type.eq.public,room_type.is.null")
      .order("created_at", { ascending: false });

    if (!withBanker.error) {
      setRooms((withBanker.data ?? []) as CeloRoom[]);
      return;
    }

    console.warn("[celo/lobby] load with banker embed failed, retrying without embed", withBanker.error.message);

    const plain = await sb
      .from("celo_rooms")
      .select("*")
      .eq("status", "waiting")
      .or("room_type.eq.public,room_type.is.null")
      .order("created_at", { ascending: false });

    if (plain.error) throw plain.error;
    setRooms((plain.data ?? []) as CeloRoom[]);
  }, []);

  const [realtimeChannelStatus, setRealtimeChannelStatus] = useState<string>("idle");
  const [restFailureStreak, setRestFailureStreak] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let realtimeBackoffMs = 1000;
    let realtimeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let restPollTimer: ReturnType<typeof setInterval> | null = null;

    const devLog = (...args: unknown[]) => {
      if (process.env.NODE_ENV === "development") console.log("[celo/lobby]", ...args);
    };

    const clearRealtimeReconnect = () => {
      if (realtimeReconnectTimer) {
        clearTimeout(realtimeReconnectTimer);
        realtimeReconnectTimer = null;
      }
    };

    const attemptRestLoad = async (sb: SupabaseClient, reason: string): Promise<boolean> => {
      try {
        await loadRooms(sb);
        if (!cancelled) {
          setRestFailureStreak(0);
          setRoomsUnavailable(false);
          void refreshCoins();
        }
        devLog(`REST ok (${reason})`);
        return true;
      } catch (e) {
        console.error(`[celo/lobby] REST load failed (${reason})`, e);
        if (!cancelled) {
          setRestFailureStreak((s) => {
            const n = s + 1;
            if (n >= 2) setRoomsUnavailable(true);
            return n;
          });
        }
        devLog(`REST fail (${reason})`);
        return false;
      }
    };

    const subscribeRealtime = (sb: SupabaseClient) => {
      clearRealtimeReconnect();
      if (channel) {
        void sb.removeChannel(channel);
        channel = null;
      }

      const ch = sb
        .channel("celo-lobby")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "celo_rooms" },
          () => {
            void loadRooms(sb).catch((err) => console.error("[celo/lobby] realtime refresh", err));
          }
        )
        .subscribe((status, err) => {
          console.log("[celo/lobby] realtime status:", status, err?.message ?? "");
          if (!cancelled) setRealtimeChannelStatus(status + (err ? `: ${err.message}` : ""));

          if (status === "SUBSCRIBED") {
            realtimeBackoffMs = 1000;
            devLog("realtime SUBSCRIBED");
            return;
          }

          if (cancelled) return;

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            const delayMs = realtimeBackoffMs;
            devLog("realtime terminal status, will resubscribe after backoff ms=", delayMs, status);
            if (channel) {
              void sb.removeChannel(channel);
              channel = null;
            }
            realtimeReconnectTimer = setTimeout(() => {
              if (cancelled) return;
              realtimeBackoffMs = Math.min(realtimeBackoffMs * 2, 30_000);
              subscribeRealtime(sb);
            }, delayMs);
          }

          if (status === "CLOSED") {
            devLog("realtime CLOSED (cleanup or server)");
          }
        });

      channel = ch;
    };

    const init = async () => {
      setRoomsUnavailable(false);
      setRestFailureStreak(0);
      setRealtimeChannelStatus("connecting");

      const sb = createBrowserClient();
      supabaseRef.current = sb;
      if (!sb) {
        if (!cancelled) {
          setRestFailureStreak(2);
          setRoomsUnavailable(true);
          setLoading(false);
          setRealtimeChannelStatus("no_client");
        }
        return;
      }

      const session = await getSessionAsync();
      if (!session?.userId) {
        router.replace("/login?next=/dashboard/games/celo");
        if (!cancelled) setLoading(false);
        return;
      }

      if (cancelled) return;

      const initialOk = await attemptRestLoad(sb, "initial");
      if (!cancelled && !initialOk) {
        await attemptRestLoad(sb, "initial-retry");
      }

      if (!cancelled) setLoading(false);
      if (cancelled) return;

      subscribeRealtime(sb);

      restPollTimer = setInterval(() => {
        if (cancelled || !supabaseRef.current) return;
        void attemptRestLoad(supabaseRef.current, "poll");
      }, 25_000);
    };

    void init();

    return () => {
      cancelled = true;
      clearRealtimeReconnect();
      if (restPollTimer) {
        clearInterval(restPollTimer);
        restPollTimer = null;
      }
      const sb = supabaseRef.current;
      if (channel && sb) void sb.removeChannel(channel);
      supabaseRef.current = null;
      setRealtimeChannelStatus("idle");
    };
  }, [router, loadRooms, refreshCoins]);

  const openCreatePublic = () => {
    setCreateError("");
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setCreateError("Enter a room name");
      return;
    }
    if (form.starting_bank_sc > gpayCoins) {
      setCreateError("Insufficient GPC balance");
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
          minimum_entry_cents: form.minimum_entry_sc,
          starting_bank_cents: form.starting_bank_sc,
          room_type: "public",
          join_code: null,
        }),
      });
      const data = (await res.json()) as { error?: string; room?: { id: string } };
      if (!res.ok) {
        setCreateError(data.error || "Failed to create room");
        return;
      }
      if (data.room?.id) {
        router.push(`/dashboard/games/celo/${data.room.id}`);
      }
    } catch {
      setCreateError("Something went wrong");
    } finally {
      setCreating(false);
    }
  };

  const filteredRooms = rooms.filter((r) => {
    if (filter === "all") return true;
    const min = safeSc(r.minimum_entry_sc);
    if (filter === "micro") return min <= 1000;
    if (filter === "standard") return min > 1000 && min <= 5000;
    if (filter === "high") return min > 5000 && min <= 10000;
    if (filter === "vip") return min > 10000;
    return true;
  });

  const gpcToUsd = (gpc: number) => `$${(gpc / 100).toFixed(2)}`;

  const bankerName = (r: CeloRoom) =>
    r.banker?.full_name || r.banker?.email?.split("@")[0] || "Unknown";

  const playersAtTables = rooms.reduce((s, r) => s + (r.player_count ?? 1), 0);
  const liveStripVariant = roomsUnavailable
    ? ("reconnect" as const)
    : rooms.length > 0
      ? ("live" as const)
      : ("empty" as const);
  const minEntryForReadiness = 500;

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#030008] pb-24">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500/20 border-t-amber-400" />
          <p className="font-mono text-sm font-medium tracking-wide text-amber-200/90">Loading lobby…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="celo-lobby-root bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(88,28,135,0.22),transparent_50%),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(245,200,66,0.05),transparent_45%),#030008]"
      style={{
        position: "relative",
        minHeight: "100vh",
        paddingBottom: 100,
        fontFamily: "var(--font-dm-sans), DM Sans, sans-serif",
        overflowX: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(ellipse 70% 45% at 50% -10%, rgba(124,58,237,0.14), transparent 55%), radial-gradient(ellipse 50% 40% at 85% 40%, rgba(245,200,66,0.06), transparent 50%)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: "-8%",
          top: "6%",
          fontSize: "clamp(120px, 28vw, 200px)",
          opacity: 0.045,
          filter: "blur(10px)",
          transform: "rotate(14deg)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        🎲
      </div>
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "-6%",
          bottom: "18%",
          fontSize: "clamp(100px, 24vw, 160px)",
          opacity: 0.035,
          filter: "blur(12px)",
          transform: "rotate(-18deg)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        🎲
      </div>
      <style>{`
        .celo-lobby-root {
          --celo-max: 1200px;
        }
        .celo-lobby-inner {
          max-width: var(--celo-max);
          margin-left: auto;
          margin-right: auto;
        }
        .celo-room-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 768px) {
          .celo-room-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        .celo-modal-overlay {
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        @media (min-width: 768px) {
          .celo-modal-overlay {
            align-items: center;
          }
        }
        .celo-modal-panel {
          width: 100%;
          max-width: 480px;
          border-radius: 20px 20px 0 0;
        }
        @media (min-width: 768px) {
          .celo-modal-panel {
            border-radius: 20px;
            max-height: 90vh;
          }
        }
        .celo-hero-cta {
          width: 100%;
        }
        @media (min-width: 768px) {
          .celo-hero-cta {
            width: auto;
          }
        }
        .celo-hero-title-glow {
          filter: drop-shadow(0 0 20px rgba(245, 200, 66, 0.45))
            drop-shadow(0 0 48px rgba(124, 58, 237, 0.25));
        }
        .celo-btn-primary {
          min-height: 52px;
          border-radius: 14px;
          box-shadow:
            0 4px 0 rgba(180, 130, 20, 0.55),
            0 8px 32px rgba(245, 200, 66, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.35);
        }
        .celo-btn-primary:active {
          transform: translateY(1px);
          box-shadow:
            0 2px 0 rgba(180, 130, 20, 0.45),
            0 4px 20px rgba(245, 200, 66, 0.28),
            inset 0 1px 0 rgba(255, 255, 255, 0.25);
        }
        .celo-filter-scroll {
          scrollbar-width: none;
        }
        .celo-filter-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      <div
        className="celo-lobby-inner -mt-1 max-w-[min(100%,1200px)] px-3 sm:px-4 tablet:px-0"
        style={{ position: "relative", zIndex: 1 }}
      >
        <CeloLiveStatusStrip
          variant={liveStripVariant}
          roomCount={rooms.length}
          playerCount={playersAtTables}
          className="mb-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
        />

        {/* HERO — centerpiece game card */}
        <div className="relative -mx-3 mb-3 sm:-mx-4 tablet:mx-0 tablet:mb-4">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-[min(160px,28vw)] w-[min(100%,440px)] -translate-x-1/2"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(245,200,66,0.2), transparent 58%)",
            }}
          />
          <div
            className="relative overflow-hidden rounded-[22px] border border-violet-500/45 shadow-[0_0_0_1px_rgba(245,200,66,0.1),0_28px_64px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl"
            style={{
              background: "linear-gradient(165deg, rgba(22,10,42,0.98) 0%, rgba(5,2,12,0.99) 100%)",
            }}
          >
            <div
              className="absolute bottom-0 left-0 top-0 w-[3px]"
              style={{
                background: "linear-gradient(180deg, #7C3AED, #5B21B6)",
                boxShadow: "0 0 16px rgba(124,58,237,0.5)",
              }}
            />
            <div
              className="absolute bottom-0 right-0 top-0 w-[3px]"
              style={{
                background: "linear-gradient(180deg, #F5C842, #B45309)",
                boxShadow: "0 0 14px rgba(245,200,66,0.4)",
              }}
            />
            <div className="relative px-4 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4">
              <p
                className="mb-1 text-center font-mono text-[10px] font-bold uppercase tracking-[0.32em] text-violet-300/95"
              >
                Street dice · Sweeps · Real stakes
              </p>
              <h1
                className={`${cinzel.className} celo-hero-title-glow text-center text-[clamp(3.25rem,14vw,6.75rem)] font-black leading-[0.95] tracking-[0.04em]`}
                style={{
                  background: "linear-gradient(180deg, #FFF8EA 0%, #EAB308 42%, #92400E 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter:
                    "drop-shadow(0 2px 20px rgba(245,200,66,0.28)) drop-shadow(0 0 36px rgba(124,58,237,0.18))",
                }}
              >
                C-LO
              </h1>
              <p className="mx-auto mb-3 max-w-[22rem] text-center font-mono text-[clamp(0.8rem,3.5vw,0.95rem)] font-semibold leading-snug tracking-wide text-slate-200/95">
                Digital street dice. Real pressure.
              </p>

              {!roomsUnavailable && rooms.length > 0 ? (
                <div className="mb-3 flex justify-center gap-2 font-mono text-[11px] text-slate-400">
                  <span className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5">
                    <span className="text-slate-500">Rooms</span>{" "}
                    <span className="font-bold text-amber-200/90">{rooms.length}</span>
                  </span>
                  <span className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5">
                    <span className="text-slate-500">At tables</span>{" "}
                    <span className="font-bold text-emerald-300/90">{playersAtTables}</span>
                  </span>
                </div>
              ) : null}

              <div className="mx-auto flex max-w-[26rem] flex-col gap-2.5">
                <button
                  type="button"
                  className="celo-btn-primary celo-hero-cta focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
                  onClick={openCreatePublic}
                  style={{
                    width: "100%",
                    background: "linear-gradient(180deg, #FFEFB8 0%, #F5C842 38%, #A16207 100%)",
                    color: "#0A0A0F",
                    border: "1px solid rgba(255,250,220,0.5)",
                    padding: "18px 22px",
                    minHeight: 56,
                    fontSize: 17,
                    fontWeight: 800,
                    fontFamily: cinzel.style.fontFamily,
                    cursor: "pointer",
                    letterSpacing: "0.04em",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    boxShadow:
                      "0 5px 0 rgba(120,80,10,0.55), 0 12px 40px rgba(245,200,66,0.38), inset 0 1px 0 rgba(255,255,255,0.45)",
                  }}
                >
                  🎲 Start a Game
                </button>
              </div>

              <CeloReadinessPanel
                className="mt-3"
                goldCoins={goldCoins}
                gpayCoins={gpayCoins}
                minEntrySc={minEntryForReadiness}
                formatGPC={formatGPC}
              />
            </div>
          </div>
        </div>

        {/* Stake filters — segmented control */}
        <div
          className="celo-filter-scroll -mx-3 mb-2 flex flex-wrap gap-1.5 rounded-2xl border border-violet-500/30 bg-gradient-to-b from-[#140a22]/95 to-[#08030f] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:-mx-4 tablet:mx-0 tablet:flex-nowrap tablet:gap-1 tablet:overflow-x-auto tablet:py-1.5 tablet:pl-1 tablet:pr-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {(
            [
              ["all", "ALL"],
              ["micro", "MICRO"],
              ["standard", "STANDARD"],
              ["high", "HIGH ROLLER"],
              ["vip", "VIP"],
            ] as const
          ).map(([key, label]) => {
            const active = filter === key;
            return (
              <button
                type="button"
                key={key}
                onClick={() => setFilter(key)}
                className={`min-h-[46px] min-w-[3.25rem] shrink-0 whitespace-nowrap rounded-xl px-3 py-2.5 font-mono text-[10px] font-extrabold tracking-[0.06em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 sm:min-w-0 sm:px-3.5 sm:tracking-[0.08em] ${
                  active
                    ? "border border-amber-400/50 bg-gradient-to-b from-amber-400/25 to-amber-600/10 text-amber-50 shadow-[0_0_24px_rgba(245,200,66,0.15)]"
                    : "border border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ROOMS */}
        <div id="celo-room-list" className="pb-6 pt-1">
          {!roomsUnavailable && filteredRooms.length === 0 && rooms.length === 0 ? (
            <CeloEmptyRoomsCard onStart={openCreatePublic} cinzelClassName={cinzel.className} />
          ) : !roomsUnavailable && filteredRooms.length === 0 && rooms.length > 0 ? (
            <div className="rounded-2xl border border-violet-500/25 bg-[#0c0618]/90 px-4 py-10 text-center font-mono text-sm text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              No tables match this stake filter.
            </div>
          ) : roomsUnavailable ? (
            <CeloRoomsReconnectCard />
          ) : (
            <div className="celo-room-grid">
              {filteredRooms.map((room) => (
                <div
                  key={room.id}
                  className="rounded-2xl border border-violet-500/35 bg-gradient-to-b from-[#140a24]/98 to-[#06020e] p-4 shadow-[0_0_0_1px_rgba(245,200,66,0.07),0_16px_48px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className={`${cinzel.className} min-w-0 text-[15px] font-bold leading-tight text-white`}>
                      {room.name}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      <span
                        className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                        aria-hidden
                      />
                      Live
                    </div>
                  </div>

                  <div className="mb-4 grid grid-cols-2 gap-3">
                    {(
                      [
                        ["Banker", bankerName(room)],
                        [
                          "Players",
                          `${room.player_count != null ? safeSc(room.player_count) : 1}/${room.max_players != null ? safeSc(room.max_players) : 6}`,
                        ],
                        ["Min entry", `${safeSc(room.minimum_entry_sc).toLocaleString()} GPC`],
                        ["Table bank", `${safeSc(room.current_bank_sc).toLocaleString()} GPC`],
                      ] as const
                    ).map(([label, val]) => (
                      <div key={label}>
                        <div className="mb-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-slate-500">
                          {label}
                        </div>
                        <div className="font-mono text-[13px] font-bold text-amber-200/95">{val}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/games/celo/${room.id}`)}
                      className="min-h-[48px] flex-1 rounded-xl border border-violet-500/40 bg-violet-950/30 py-2.5 font-mono text-[12px] font-bold text-violet-200 transition hover:border-violet-400/50 hover:bg-violet-900/40"
                    >
                      Watch
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/games/celo/${room.id}`)}
                      className="min-h-[48px] flex-[1.6] rounded-xl bg-gradient-to-r from-amber-300 via-amber-500 to-amber-700 py-2.5 font-mono text-[12px] font-bold text-[#0a0610] shadow-[0_4px_16px_rgba(245,200,66,0.25)] transition hover:brightness-105"
                    >
                      Join table
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {process.env.NODE_ENV === "development" ? (
        <div
          className="pointer-events-none fixed bottom-24 left-2 z-[90] max-w-[min(100vw-1rem,22rem)] rounded-lg border border-amber-500/35 bg-black/88 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-amber-100/95 shadow-xl backdrop-blur-sm"
          aria-hidden
        >
          <div className="text-amber-400/95">C-Lo realtime</div>
          <div className="break-all opacity-95">{realtimeChannelStatus}</div>
          <div className="mt-1 text-slate-400">
            REST fail streak: {restFailureStreak} · roomsUnavailable: {String(roomsUnavailable)}
          </div>
        </div>
      ) : null}

      {showCreate ? (
        <div
          className="celo-modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 100,
            padding: 0,
          }}
          role="presentation"
          onClick={() => {
            setShowCreate(false);
            setCreateError("");
          }}
        >
          <div
            className="celo-modal-panel"
            style={{
              background: "#0D0520",
              borderTop: "2px solid #F5C842",
              padding: "24px 20px",
              overflowY: "auto",
              boxSizing: "border-box",
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="celo-create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <h2
                id="celo-create-title"
                className={cinzel.className}
                style={{ color: "#F5C842", fontSize: 20, margin: 0 }}
              >
                Start a game
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setCreateError("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#6B7280",
                  fontSize: 24,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <label style={{ display: "block", marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#9CA3AF",
                  fontFamily: "Courier New, monospace",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                }}
              >
                ROOM NAME
              </div>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Head Crack House"
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(124,58,237,0.3)",
                  borderRadius: 8,
                  color: "#fff",
                  padding: "12px 14px",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </label>

            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#9CA3AF",
                  fontFamily: "Courier New, monospace",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                }}
              >
                MAX PLAYERS
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[2, 4, 6, 10].map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setForm((f) => ({ ...f, max_players: n }))}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 8,
                      border:
                        form.max_players === n
                          ? "2px solid #F5C842"
                          : "1px solid rgba(124,58,237,0.3)",
                      background:
                        form.max_players === n ? "rgba(245,200,66,0.1)" : "transparent",
                      color: form.max_players === n ? "#F5C842" : "#6B7280",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "Courier New, monospace",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#9CA3AF",
                  fontFamily: "Courier New, monospace",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                }}
              >
                MINIMUM ENTRY —{" "}
                <span style={{ color: "#F5C842" }}>
                  {form.minimum_entry_sc.toLocaleString()} GPC ({gpcToUsd(form.minimum_entry_sc)})
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[500, 1000, 2000, 5000, 10000].map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        minimum_entry_sc: v,
                        starting_bank_sc: Math.max(f.starting_bank_sc, v),
                      }))
                    }
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border:
                        form.minimum_entry_sc === v
                          ? "2px solid #F5C842"
                          : "1px solid rgba(124,58,237,0.3)",
                      background:
                        form.minimum_entry_sc === v
                          ? "rgba(245,200,66,0.1)"
                          : "transparent",
                      color: form.minimum_entry_sc === v ? "#F5C842" : "#6B7280",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "Courier New, monospace",
                    }}
                  >
                    ${v / 100}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#9CA3AF",
                  fontFamily: "Courier New, monospace",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                }}
              >
                STARTING BANK —{" "}
                <span style={{ color: "#F5C842" }}>
                  {form.starting_bank_sc.toLocaleString()} GPC ({gpcToUsd(form.starting_bank_sc)})
                </span>
              </div>
              <input
                type="number"
                value={form.starting_bank_sc}
                onChange={(e) => {
                  const raw = parseInt(e.target.value, 10);
                  const v = Math.max(
                    form.minimum_entry_sc,
                    Math.round(raw / form.minimum_entry_sc) * form.minimum_entry_sc
                  );
                  setForm((f) => ({
                    ...f,
                    starting_bank_sc: Number.isFinite(v) ? v : f.minimum_entry_sc,
                  }));
                }}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.05)",
                  border:
                    form.starting_bank_sc > gpayCoins
                      ? "1px solid #EF4444"
                      : "1px solid rgba(124,58,237,0.3)",
                  borderRadius: 8,
                  color: "#fff",
                  padding: "12px 14px",
                  fontSize: 15,
                  fontFamily: "Courier New, monospace",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  gap: 8,
                  marginTop: 6,
                  fontSize: 11,
                  fontFamily: "Courier New, monospace",
                }}
              >
                <span style={{ color: form.starting_bank_sc > gpayCoins ? "#EF4444" : "#6B7280" }}>
                  {form.starting_bank_sc > gpayCoins
                    ? "✗ Insufficient GPC"
                    : `✓ You have ${safeSc(gpayCoins).toLocaleString()} GPC available`}
                </span>
                <span style={{ color: "#6B7280" }}>Multiple of min entry</span>
              </div>
            </div>

            {createError ? (
              <div
                style={{
                  color: "#EF4444",
                  fontSize: 13,
                  marginBottom: 12,
                  fontFamily: "Courier New, monospace",
                  textAlign: "center",
                }}
              >
                {createError}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !form.name.trim() || form.starting_bank_sc > gpayCoins}
              style={{
                width: "100%",
                background:
                  creating || form.starting_bank_sc > gpayCoins
                    ? "rgba(255,255,255,0.1)"
                    : "linear-gradient(135deg, #F5C842, #D4A017)",
                border: "none",
                borderRadius: 10,
                color:
                  creating || form.starting_bank_sc > gpayCoins ? "#6B7280" : "#0A0A0F",
                padding: "16px",
                fontSize: 15,
                fontWeight: 700,
                cursor:
                  creating || form.starting_bank_sc > gpayCoins ? "not-allowed" : "pointer",
                fontFamily: cinzel.style.fontFamily,
                letterSpacing: "0.05em",
              }}
            >
              {creating ? "STARTING…" : "🎲 START GAME"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
