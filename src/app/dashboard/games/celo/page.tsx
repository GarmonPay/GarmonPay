"use client";

import Link from "next/link";
import { Cinzel_Decorative } from "next/font/google";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase";
import { getSessionAsync } from "@/lib/session";
import { useCoins } from "@/hooks/useCoins";

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
  /** Required when hosting a private table; shared with invitees only */
  join_code: string;
}

function randomJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i += 1) {
    const c = chars[Math.floor(Math.random() * chars.length)];
    if (c) s += c;
  }
  return s;
}

export default function CeloLobbyPage() {
  const router = useRouter();
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const {
    goldCoins,
    gpayCoins,
    gpayTokens,
    refresh: refreshCoins,
    formatGPC,
  } = useCoins();

  const [rooms, setRooms] = useState<CeloRoom[]>([]);
  const [loading, setLoading] = useState(true);
  /** Room list failed — show soft error UI and auto-retry in background */
  const [roomsUnavailable, setRoomsUnavailable] = useState(false);
  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  /** Public = listed in lobby; private = invite-only via join code */
  const [createMode, setCreateMode] = useState<"public" | "private">("public");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState<CreateRoomForm>({
    name: "",
    max_players: 6,
    minimum_entry_sc: 500,
    starting_bank_sc: 500,
    join_code: "",
  });

  const loadRooms = useCallback(async (sb: SupabaseClient) => {
    const { data, error } = await sb
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

    if (error) throw error;
    setRooms((data ?? []) as CeloRoom[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const init = async () => {
      setRoomsUnavailable(false);

      const sb = createBrowserClient();
      supabaseRef.current = sb;
      if (!sb) {
        if (!cancelled) {
          setRoomsUnavailable(true);
          setLoading(false);
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

      try {
        await loadRooms(sb);
        if (!cancelled) setRoomsUnavailable(false);
      } catch (e) {
        console.error("[celo/lobby] load failed", e);
        if (!cancelled) setRoomsUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }

      if (cancelled) return;

      channel = sb
        .channel("celo-lobby")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "celo_rooms" },
          () => {
            void loadRooms(sb).catch((err) => console.error("[celo/lobby] realtime refresh", err));
          }
        )
        .subscribe();
    };

    void init();

    return () => {
      cancelled = true;
      const sb = supabaseRef.current;
      if (channel && sb) void sb.removeChannel(channel);
      supabaseRef.current = null;
    };
  }, [router, loadRooms]);

  /** Background reconnect when room list failed */
  useEffect(() => {
    if (!roomsUnavailable) return;
    const tick = async () => {
      const sb = createBrowserClient();
      if (!sb) return;
      try {
        await loadRooms(sb);
        setRoomsUnavailable(false);
        void refreshCoins();
      } catch {
        /* keep banner; next interval retries */
      }
    };
    void tick();
    const id = setInterval(() => {
      void tick();
    }, 5000);
    return () => clearInterval(id);
  }, [roomsUnavailable, loadRooms, refreshCoins]);

  const openCreatePublic = () => {
    setCreateMode("public");
    setCreateError("");
    setShowCreate(true);
  };

  const openCreatePrivate = () => {
    setCreateMode("private");
    setForm((f) => ({ ...f, join_code: f.join_code.trim() ? f.join_code : randomJoinCode() }));
    setCreateError("");
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setCreateError("Enter a room name");
      return;
    }
    const isPrivate = createMode === "private";
    const code = form.join_code.trim();
    if (isPrivate && code.length < 4) {
      setCreateError("Join code must be at least 4 characters");
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
          room_type: isPrivate ? "private" : "public",
          join_code: isPrivate ? code : null,
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
    const min = r.minimum_entry_sc;
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
  const liveStatusText =
    rooms.length > 0
      ? `🟢 LIVE • ${playersAtTables} player${playersAtTables === 1 ? "" : "s"} • ${rooms.length} room${rooms.length === 1 ? "" : "s"}`
      : "🟡 Waiting for players — start the first game";

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#05010F",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: 100,
        }}
      >
        <div style={{ color: "#F5C842", fontFamily: "Courier New, monospace", fontSize: 16 }}>
          Loading rooms...
        </div>
      </div>
    );
  }

  return (
    <div
      className="celo-lobby-root"
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "#05010F",
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
          padding-left: 16px;
          padding-right: 16px;
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
        @keyframes celo-pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
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
        @keyframes celo-spin {
          to {
            transform: rotate(360deg);
          }
        }
        .celo-reconnect-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(245, 200, 66, 0.22);
          border-top-color: #f5c842;
          border-radius: 50%;
          animation: celo-spin 0.75s linear infinite;
          flex-shrink: 0;
        }
        .celo-reconnect-pulse {
          animation: celo-pulse-dot 1.2s ease-in-out infinite;
        }
      `}</style>

      <div className="celo-lobby-inner" style={{ position: "relative", zIndex: 1 }}>
        {/* Wallet strip — balance + actions */}
        <div
          style={{
            marginTop: 0,
            marginBottom: 10,
            padding: "10px 12px",
            borderRadius: 16,
            border: "1px solid rgba(124,58,237,0.35)",
            background: "linear-gradient(180deg, rgba(22,10,42,0.95), rgba(8,4,18,0.98))",
            boxShadow: "0 0 0 1px rgba(245,200,66,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                rowGap: 8,
              }}
            >
              {(
                [
                  ["Gold", goldCoins, "#FDE68A"],
                  ["GPC", gpayCoins, "#F5C842"],
                  ["Tokens", gpayTokens, "#C4B5FD"],
                ] as const
              ).map(([label, val, color]) => (
                <div
                  key={label}
                  style={{
                    minWidth: 0,
                    padding: "6px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(0,0,0,0.35)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      letterSpacing: "0.14em",
                      color: "#9CA3AF",
                      fontFamily: "Courier New, monospace",
                      marginBottom: 2,
                    }}
                  >
                    {label === "GPC" ? "GPay Coins" : label === "Gold" ? "Gold Coins" : "Tokens"}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color,
                      fontFamily: "Courier New, monospace",
                      letterSpacing: "-0.02em",
                      lineHeight: 1.2,
                    }}
                  >
                    {label === "GPC" ? formatGPC(val) : val.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                alignItems: "center",
              }}
            >
              <Link
                href="/dashboard/coins/buy"
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textDecoration: "none",
                  color: "#0A0A0F",
                  background: "linear-gradient(180deg, #FDE68A, #CA8A04)",
                  border: "1px solid rgba(255,250,220,0.35)",
                  fontFamily: cinzel.style.fontFamily,
                  whiteSpace: "nowrap",
                }}
              >
                Buy
              </Link>
              <Link
                href="/dashboard/convert"
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textDecoration: "none",
                  color: "#E9D5FF",
                  border: "1px solid rgba(124,58,237,0.5)",
                  background: "rgba(15,8,28,0.9)",
                  fontFamily: "Courier New, monospace",
                  whiteSpace: "nowrap",
                }}
              >
                Convert
              </Link>
              <Link
                href="/dashboard/wallet#redeem"
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textDecoration: "none",
                  color: "#A7F3D0",
                  border: "1px solid rgba(16,185,129,0.45)",
                  background: "rgba(6,24,18,0.75)",
                  fontFamily: "Courier New, monospace",
                  whiteSpace: "nowrap",
                }}
              >
                Redeem
              </Link>
            </div>
          </div>
        </div>

        {roomsUnavailable ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginBottom: 12,
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid rgba(245,158,11,0.35)",
              background: "linear-gradient(180deg, rgba(55,35,10,0.85), rgba(25,15,8,0.92))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span className="celo-reconnect-pulse" style={{ fontSize: 16 }} aria-hidden>
              ⚠️
            </span>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <div
                style={{
                  color: "#FDE68A",
                  fontWeight: 800,
                  fontSize: 13,
                  fontFamily: "system-ui, sans-serif",
                  marginBottom: 2,
                }}
              >
                Rooms temporarily unavailable
              </div>
              <div
                style={{
                  color: "rgba(253,230,138,0.85)",
                  fontSize: 12,
                  fontFamily: "Courier New, monospace",
                }}
              >
                Reconnecting…
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="celo-reconnect-spinner" aria-hidden />
              <span style={{ color: "#94A3B8", fontSize: 11, fontFamily: "Courier New, monospace" }}>
                Auto-retry
              </span>
            </div>
          </div>
        ) : null}

        {/* HERO — premium C-LO card */}
        <div
          style={{
            marginTop: 0,
            marginBottom: 10,
            marginLeft: -16,
            marginRight: -16,
            paddingLeft: 16,
            paddingRight: 16,
            position: "relative",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              top: -8,
              transform: "translateX(-50%)",
              width: "min(100%, 420px)",
              height: 140,
              background:
                "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(245,200,66,0.18), transparent 55%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "relative",
              borderRadius: 22,
              border: "1px solid rgba(124,58,237,0.45)",
              background:
                "linear-gradient(165deg, rgba(26,12,48,0.97) 0%, rgba(8,4,18,0.99) 100%)",
              boxShadow:
                "0 0 0 1px rgba(245,200,66,0.12), 0 24px 56px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
              overflow: "hidden",
              backdropFilter: "blur(14px)",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 3,
                background: "linear-gradient(180deg, #7C3AED, #5B21B6)",
                boxShadow: "0 0 16px rgba(124,58,237,0.6)",
              }}
            />
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                bottom: 0,
                width: 3,
                background: "linear-gradient(180deg, #F5C842, #B45309)",
                boxShadow: "0 0 14px rgba(245,200,66,0.45)",
              }}
            />
            <div style={{ padding: "14px 14px 14px", position: "relative" }}>
              <p
                style={{
                  textAlign: "center",
                  margin: "0 0 4px",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  color: "rgba(167,139,250,0.95)",
                  fontFamily: "Courier New, monospace",
                }}
              >
                Street dice · Sweeps
              </p>
              <h1
                className={`${cinzel.className} celo-hero-title-glow`}
                style={{
                  fontSize: "clamp(56px, 15vw, 108px)",
                  fontWeight: 900,
                  textAlign: "center",
                  margin: "0 0 4px",
                  background: "linear-gradient(180deg, #FFF8E6 0%, #F5C842 42%, #A16207 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  letterSpacing: "0.04em",
                  lineHeight: 0.98,
                  filter:
                    "drop-shadow(0 2px 24px rgba(245,200,66,0.35)) drop-shadow(0 0 40px rgba(124,58,237,0.2))",
                }}
              >
                C-LO
              </h1>
              <p
                style={{
                  color: "#E5E7EB",
                  textAlign: "center",
                  fontSize: "clamp(12px, 3.2vw, 14px)",
                  margin: "0 0 10px",
                  letterSpacing: "0.1em",
                  fontFamily: "Courier New, monospace",
                  fontWeight: 600,
                  lineHeight: 1.5,
                  maxWidth: 380,
                  marginLeft: "auto",
                  marginRight: "auto",
                  opacity: 0.95,
                }}
              >
                THE FIRST LEGITIMATE
                <br />
                DIGITAL STREET DICE
              </p>

              <div
                style={{
                  marginBottom: 12,
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(16,185,129,0.22)",
                  background: "rgba(0,0,0,0.35)",
                  textAlign: "center",
                  fontSize: "clamp(11px, 3vw, 12px)",
                  fontWeight: 700,
                  color: rooms.length > 0 ? "#A7F3D0" : "#FDE68A",
                  fontFamily: "Courier New, monospace",
                  letterSpacing: "0.04em",
                  lineHeight: 1.45,
                }}
              >
                {liveStatusText}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  maxWidth: 420,
                  margin: "0 auto 0",
                }}
              >
                <button
                  type="button"
                  className="celo-btn-primary celo-hero-cta"
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
                    letterSpacing: "0.06em",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    boxShadow:
                      "0 5px 0 rgba(120,80,10,0.55), 0 12px 40px rgba(245,200,66,0.4), inset 0 1px 0 rgba(255,255,255,0.45)",
                  }}
                >
                  🎲 START A GAME
                </button>
                <button
                  type="button"
                  className="celo-hero-cta"
                  onClick={openCreatePrivate}
                  style={{
                    width: "100%",
                    textAlign: "center",
                    borderRadius: 14,
                    minHeight: 52,
                    padding: "15px 18px",
                    fontSize: 14,
                    fontWeight: 800,
                    fontFamily: cinzel.style.fontFamily,
                    letterSpacing: "0.05em",
                    color: "#DDD6FE",
                    border: "1px solid rgba(167,139,250,0.55)",
                    background: "linear-gradient(180deg, rgba(28,12,52,0.95), rgba(8,4,18,0.98))",
                    boxShadow:
                      "0 0 0 1px rgba(124,58,237,0.35), 0 0 28px rgba(124,58,237,0.25), inset 0 1px 0 rgba(255,255,255,0.07)",
                    cursor: "pointer",
                  }}
                >
                  🔐 HOST PRIVATE GAME
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* FILTER TABS */}
        <div
          className="celo-filter-scroll"
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            borderRadius: 16,
            border: "1px solid rgba(124,58,237,0.28)",
            background: "linear-gradient(180deg, rgba(20,8,40,0.92), rgba(10,4,20,0.96))",
            marginLeft: -16,
            marginRight: -16,
            padding: "10px 12px",
            marginTop: 0,
            marginBottom: 4,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
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
                style={{
                  background: active
                    ? "linear-gradient(180deg, rgba(245,200,66,0.22), rgba(245,200,66,0.08))"
                    : "transparent",
                  border: active ? "1px solid rgba(245,200,66,0.45)" : "1px solid transparent",
                  borderRadius: 12,
                  color: active ? "#FEF3C7" : "#9CA3AF",
                  padding: "12px 14px",
                  minHeight: 44,
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "Courier New, monospace",
                  letterSpacing: "0.08em",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  boxShadow: active ? "0 0 20px rgba(245,200,66,0.12)" : "none",
                  transition: "color 0.15s ease, background 0.15s ease, border-color 0.15s ease",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ROOMS */}
        <div id="celo-room-list" style={{ paddingTop: 8, paddingBottom: 20 }}>
          {!roomsUnavailable && filteredRooms.length === 0 && rooms.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "48px 16px",
                color: "#6B7280",
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎲</div>
              <div
                className={cinzel.className}
                style={{ fontSize: 18, color: "#9CA3AF", marginBottom: 8, fontWeight: 700 }}
              >
                No rooms yet
              </div>
              <div style={{ fontSize: 14, marginBottom: 20, color: "#9CA3AF" }}>
                Be the first to open a room — the lobby updates live.
              </div>
              <button
                type="button"
                onClick={openCreatePublic}
                className="celo-btn-primary"
                style={{
                  background: "linear-gradient(180deg, #FDE68A 0%, #F5C842 40%, #CA8A04 100%)",
                  color: "#0A0A0F",
                  border: "1px solid rgba(255,250,220,0.4)",
                  borderRadius: 14,
                  padding: "14px 28px",
                  fontSize: 15,
                  fontWeight: 800,
                  fontFamily: cinzel.style.fontFamily,
                  cursor: "pointer",
                  letterSpacing: "0.05em",
                  minHeight: 48,
                }}
              >
                🎲 START A GAME
              </button>
            </div>
          ) : !roomsUnavailable && filteredRooms.length === 0 && rooms.length > 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "32px 16px",
                color: "#6B7280",
                fontFamily: "Courier New, monospace",
                fontSize: 14,
              }}
            >
              No rooms match this filter.
            </div>
          ) : roomsUnavailable ? null : (
            <div className="celo-room-grid">
              {filteredRooms.map((room) => (
                <div
                  key={room.id}
                  style={{
                    background: "linear-gradient(180deg, rgba(15,8,35,0.98), rgba(8,4,18,0.99))",
                    border: "1px solid rgba(124,58,237,0.35)",
                    borderRadius: 16,
                    padding: 16,
                    boxShadow:
                      "0 0 0 1px rgba(245,200,66,0.06), 0 12px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 12,
                    }}
                  >
                    <div
                      className={cinzel.className}
                      style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}
                    >
                      {room.name}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11,
                        color: "#10B981",
                        fontFamily: "Courier New, monospace",
                      }}
                    >
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "#10B981",
                          animation: "celo-pulse-dot 1.5s infinite",
                        }}
                      />
                      LIVE
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                      marginBottom: 14,
                    }}
                  >
                    {(
                      [
                        ["Banker", bankerName(room)],
                        ["Players", `${room.player_count ?? 1}/${room.max_players}`],
                        ["Min Entry", `${room.minimum_entry_sc.toLocaleString()} GPC`],
                        ["Bank", `${room.current_bank_sc.toLocaleString()} GPC`],
                      ] as const
                    ).map(([label, val]) => (
                      <div key={label}>
                        <div
                          style={{
                            fontSize: 9,
                            color: "#6B7280",
                            fontFamily: "Courier New, monospace",
                            letterSpacing: "0.08em",
                            marginBottom: 2,
                          }}
                        >
                          {label}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#F5C842",
                            fontFamily: "Courier New, monospace",
                            fontWeight: 700,
                          }}
                        >
                          {val}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/games/celo/${room.id}`)}
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: "1px solid rgba(124,58,237,0.4)",
                        borderRadius: 8,
                        color: "#A855F7",
                        padding: "10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "Courier New, monospace",
                      }}
                    >
                      👁 WATCH
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/games/celo/${room.id}`)}
                      style={{
                        flex: 2,
                        background: "linear-gradient(135deg, #F5C842, #D4A017)",
                        border: "none",
                        borderRadius: 8,
                        color: "#0A0A0F",
                        padding: "10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "Courier New, monospace",
                      }}
                    >
                      🎲 JOIN TABLE
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
                {createMode === "private" ? "Host a private game" : "Start a game"}
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

            {createMode === "private" ? (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#9CA3AF",
                    fontFamily: "Courier New, monospace",
                    letterSpacing: "0.08em",
                    marginBottom: 6,
                  }}
                >
                  JOIN CODE — share only with players you invite (not listed in the lobby)
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                  <input
                    value={form.join_code}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        join_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12),
                      }))
                    }
                    placeholder="e.g. GOLD42"
                    autoComplete="off"
                    spellCheck={false}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(167,139,250,0.45)",
                      borderRadius: 8,
                      color: "#E9D5FF",
                      padding: "12px 14px",
                      fontSize: 16,
                      fontWeight: 800,
                      letterSpacing: "0.12em",
                      fontFamily: "Courier New, monospace",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, join_code: randomJoinCode() }))}
                    style={{
                      flexShrink: 0,
                      padding: "0 14px",
                      borderRadius: 8,
                      border: "1px solid rgba(124,58,237,0.5)",
                      background: "rgba(45,20,80,0.85)",
                      color: "#C4B5FD",
                      fontSize: 11,
                      fontWeight: 800,
                      fontFamily: "Courier New, monospace",
                      letterSpacing: "0.06em",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    NEW CODE
                  </button>
                </div>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 11,
                    color: "#6B7280",
                    fontFamily: "system-ui, sans-serif",
                    lineHeight: 1.4,
                  }}
                >
                  Friends enter this code to join. Minimum 4 characters.
                </p>
              </div>
            ) : null}

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
                    : `✓ You have ${gpayCoins.toLocaleString()} GPC available`}
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
              disabled={
                creating ||
                !form.name.trim() ||
                form.starting_bank_sc > gpayCoins ||
                (createMode === "private" && form.join_code.trim().length < 4)
              }
              style={{
                width: "100%",
                background:
                  creating ||
                  form.starting_bank_sc > gpayCoins ||
                  (createMode === "private" && form.join_code.trim().length < 4)
                    ? "rgba(255,255,255,0.1)"
                    : "linear-gradient(135deg, #F5C842, #D4A017)",
                border: "none",
                borderRadius: 10,
                color:
                  creating ||
                  form.starting_bank_sc > gpayCoins ||
                  (createMode === "private" && form.join_code.trim().length < 4)
                    ? "#6B7280"
                    : "#0A0A0F",
                padding: "16px",
                fontSize: 15,
                fontWeight: 700,
                cursor:
                  creating ||
                  form.starting_bank_sc > gpayCoins ||
                  (createMode === "private" && form.join_code.trim().length < 4)
                    ? "not-allowed"
                    : "pointer",
                fontFamily: cinzel.style.fontFamily,
                letterSpacing: "0.05em",
              }}
            >
              {creating
                ? "STARTING…"
                : createMode === "private"
                  ? "🔐 CREATE PRIVATE TABLE"
                  : "🎲 START GAME"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
