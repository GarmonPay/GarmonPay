"use client";

import Link from "next/link";
import { Cinzel_Decorative } from "next/font/google";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase";
import { getSessionAsync } from "@/lib/session";

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

export default function CeloLobbyPage() {
  const router = useRouter();
  const supabaseRef = useRef<SupabaseClient | null>(null);

  const [rooms, setRooms] = useState<CeloRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [myBalance, setMyBalance] = useState(0);
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
      .order("created_at", { ascending: false });

    if (error) throw error;
    setRooms((data ?? []) as CeloRoom[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const init = async () => {
      setLoadError(null);

      const sb = createBrowserClient();
      supabaseRef.current = sb;
      if (!sb) {
        if (!cancelled) {
          setLoadError("Could not load rooms. Refresh to try again.");
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
        const { data: userRow, error: userErr } = await sb
          .from("users")
          .select("gpay_coins")
          .eq("id", session.userId)
          .maybeSingle();

        if (userErr) console.error("[celo/lobby] users row:", userErr.message);
        if (!cancelled && userRow) {
          setMyBalance((userRow as { gpay_coins?: number }).gpay_coins ?? 0);
        }

        await loadRooms(sb);
      } catch (e) {
        console.error("[celo/lobby] load failed", e);
        if (!cancelled) {
          setLoadError("Could not load rooms. Refresh to try again.");
        }
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

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setCreateError("Enter a room name");
      return;
    }
    if (form.starting_bank_sc > myBalance) {
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

  const gpcInPlay = rooms.reduce((s, r) => s + (r.current_bank_sc || 0), 0);

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
        minHeight: "100vh",
        background: "#05010F",
        paddingBottom: 100,
        fontFamily: "var(--font-dm-sans), DM Sans, sans-serif",
      }}
    >
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
      `}</style>

      <div className="celo-lobby-inner">
        {loadError ? (
          <div
            style={{
              padding: "24px 0",
              textAlign: "center",
              color: "#F87171",
              fontFamily: "Courier New, monospace",
              fontSize: 14,
            }}
          >
            {loadError}{" "}
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginLeft: 8,
                background: "transparent",
                border: "1px solid rgba(124,58,237,0.5)",
                color: "#A855F7",
                borderRadius: 8,
                padding: "6px 12px",
                cursor: "pointer",
                fontFamily: "Courier New, monospace",
                fontSize: 12,
              }}
            >
              Refresh
            </button>
          </div>
        ) : null}

        {/* HERO */}
        <div
          style={{
            background: `
              linear-gradient(135deg, #0D0520, #1A0535),
              radial-gradient(ellipse at 30% 50%, rgba(124,58,237,0.15) 0%, transparent 60%),
              radial-gradient(ellipse at 70% 50%, rgba(245,200,66,0.08) 0%, transparent 60%)
            `,
            padding: "32px 0 28px",
            borderBottom: "1px solid rgba(124,58,237,0.2)",
            position: "relative",
            overflow: "hidden",
            marginLeft: -16,
            marginRight: -16,
            paddingLeft: 16,
            paddingRight: 16,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 2,
              background: "#7C3AED",
              boxShadow: "0 0 12px #7C3AED, 0 0 30px rgba(124,58,237,0.5)",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 2,
              background: "#F5C842",
              boxShadow: "0 0 12px #F5C842, 0 0 30px rgba(245,200,66,0.4)",
            }}
          />

          <h1
            className={cinzel.className}
            style={{
              fontSize: "clamp(48px, 12vw, 96px)",
              fontWeight: 900,
              textAlign: "center",
              margin: "0 0 8px",
              background: "linear-gradient(135deg, #F5C842, #D4A017)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              letterSpacing: "0.05em",
              lineHeight: 1.05,
            }}
          >
            C-LO
          </h1>

          <p
            style={{
              color: "#9CA3AF",
              textAlign: "center",
              fontSize: 13,
              margin: "0 0 20px",
              letterSpacing: "0.08em",
              fontFamily: "Courier New, monospace",
            }}
          >
            THE FIRST LEGITIMATE DIGITAL STREET DICE
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 20,
              marginBottom: 20,
              flexWrap: "wrap",
            }}
          >
            <div style={{ color: "#9CA3AF", fontSize: 13, fontFamily: "Courier New, monospace" }}>
              🎲 {rooms.length} rooms live
            </div>
            <div style={{ color: "#9CA3AF", fontSize: 13, fontFamily: "Courier New, monospace" }}>
              💰 {gpcInPlay.toLocaleString()} GPC in play
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <button
              type="button"
              className="celo-hero-cta"
              onClick={() => setShowCreate(true)}
              style={{
                background: "linear-gradient(135deg, #F5C842, #D4A017)",
                color: "#0A0A0F",
                border: "none",
                borderRadius: 10,
                padding: "14px 28px",
                fontSize: 15,
                fontWeight: 700,
                fontFamily: cinzel.style.fontFamily,
                cursor: "pointer",
                letterSpacing: "0.05em",
                maxWidth: 400,
              }}
            >
              🎲 CREATE ROOM
            </button>
          </div>

          <div
            style={{
              textAlign: "center",
              color: "#6B7280",
              fontSize: 12,
              fontFamily: "Courier New, monospace",
            }}
          >
            {myBalance <= 0 ? (
              <>
                You need GPC to play →{" "}
                <Link href="/dashboard/coins/buy" style={{ color: "#F5C842", fontWeight: 700 }}>
                  Get GPC
                </Link>
              </>
            ) : (
              <>
                Your balance: <span style={{ color: "#F5C842" }}>{myBalance.toLocaleString()} GPC</span> (
                {gpcToUsd(myBalance)})
              </>
            )}
          </div>
        </div>

        {/* FILTER TABS */}
        <div
          style={{
            display: "flex",
            gap: 0,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            borderBottom: "1px solid rgba(124,58,237,0.15)",
            background: "rgba(13,5,32,0.8)",
            marginLeft: -16,
            marginRight: -16,
            paddingLeft: 16,
            paddingRight: 16,
            marginTop: 0,
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
          ).map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => setFilter(key)}
              style={{
                background: "none",
                border: "none",
                borderBottom: filter === key ? "2px solid #F5C842" : "2px solid transparent",
                color: filter === key ? "#F5C842" : "#6B7280",
                padding: "14px 16px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "Courier New, monospace",
                letterSpacing: "0.05em",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ROOMS */}
        <div style={{ paddingTop: 16, paddingBottom: 24 }}>
          {!loadError && filteredRooms.length === 0 && rooms.length === 0 ? (
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
              <div style={{ fontSize: 14, marginBottom: 20 }}>Be the first to create one</div>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                style={{
                  background: "linear-gradient(135deg, #F5C842, #D4A017)",
                  color: "#0A0A0F",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 24px",
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: cinzel.style.fontFamily,
                  cursor: "pointer",
                }}
              >
                CREATE ROOM
              </button>
            </div>
          ) : !loadError && filteredRooms.length === 0 && rooms.length > 0 ? (
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
          ) : loadError ? null : (
            <div className="celo-room-grid">
              {filteredRooms.map((room) => (
                <div
                  key={room.id}
                  style={{
                    background: "#0D0520",
                    border: "1px solid rgba(124,58,237,0.2)",
                    borderRadius: 14,
                    padding: 16,
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
                Create Room
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
                    form.starting_bank_sc > myBalance
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
                <span style={{ color: form.starting_bank_sc > myBalance ? "#EF4444" : "#6B7280" }}>
                  {form.starting_bank_sc > myBalance
                    ? "✗ Insufficient GPC"
                    : `✓ You have ${myBalance.toLocaleString()} GPC available`}
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
              disabled={creating || !form.name.trim() || form.starting_bank_sc > myBalance}
              style={{
                width: "100%",
                background:
                  creating || form.starting_bank_sc > myBalance
                    ? "rgba(255,255,255,0.1)"
                    : "linear-gradient(135deg, #F5C842, #D4A017)",
                border: "none",
                borderRadius: 10,
                color:
                  creating || form.starting_bank_sc > myBalance ? "#6B7280" : "#0A0A0F",
                padding: "16px",
                fontSize: 15,
                fontWeight: 700,
                cursor:
                  creating || form.starting_bank_sc > myBalance ? "not-allowed" : "pointer",
                fontFamily: cinzel.style.fontFamily,
                letterSpacing: "0.05em",
              }}
            >
              {creating ? "CREATING..." : "🎲 CREATE ROOM"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
