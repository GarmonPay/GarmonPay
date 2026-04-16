"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";

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
  room_type: "public" | "private";
  join_code: string;
  minimum_entry_sc: number;
  starting_bank_sc: number;
}

export default function CeloLobbyPage() {
  const supabase = useMemo(() => {
    const c = createBrowserClient();
    if (!c) throw new Error("Supabase not configured");
    return c;
  }, []);
  const router = useRouter();

  const [rooms, setRooms] = useState<CeloRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [myBalance, setMyBalance] = useState(0);
  const [myUserId, setMyUserId] = useState("");
  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState<CreateRoomForm>({
    name: "",
    max_players: 6,
    room_type: "public",
    join_code: "",
    minimum_entry_sc: 500,
    starting_bank_sc: 500,
  });

  const loadRooms = useCallback(async () => {
    const { data } = await supabase
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
    if (data) setRooms(data as CeloRoom[]);
  }, [supabase]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      if (cancelled) return;
      setMyUserId(session.user.id);
      const { data: user } = await supabase
        .from("users")
        .select("gpay_coins")
        .eq("id", session.user.id)
        .single();
      if (user && !cancelled)
        setMyBalance((user as { gpay_coins?: number }).gpay_coins || 0);
      await loadRooms();
      if (!cancelled) setLoading(false);

      channel = supabase
        .channel("celo-lobby")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "celo_rooms",
          },
          () => {
            void loadRooms();
          }
        )
        .subscribe();
    };

    void init();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, router, loadRooms]);

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
        body: JSON.stringify(form),
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

  const handleJoinPrivate = async () => {
    if (!joinCode.trim()) return;
    try {
      const res = await fetch("/api/celo/room/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          join_code: joinCode.trim().toUpperCase(),
          role: "player",
          entry_sc: form.minimum_entry_sc,
        }),
      });
      const data = (await res.json()) as { room?: { id: string } };
      if (data.room?.id) {
        router.push(`/dashboard/games/celo/${data.room.id}`);
      }
    } catch {
      /* ignore */
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

  if (loading)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#05010F",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            color: "#F5C842",
            fontFamily: "Courier New",
            fontSize: 16,
          }}
        >
          Loading rooms...
        </div>
      </div>
    );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#05010F",
        paddingBottom: 100,
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <div
        style={{
          background: `
          linear-gradient(135deg, #0D0520, #1A0535),
          radial-gradient(ellipse at 30% 50%,
            rgba(124,58,237,0.15) 0%, transparent 60%),
          radial-gradient(ellipse at 70% 50%,
            rgba(245,200,66,0.08) 0%, transparent 60%)
        `,
          padding: "40px 20px 32px",
          borderBottom: "1px solid rgba(124,58,237,0.2)",
          position: "relative",
          overflow: "hidden",
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
          style={{
            fontFamily: '"Cinzel Decorative", serif',
            fontSize: "clamp(48px, 12vw, 96px)",
            fontWeight: 900,
            textAlign: "center",
            margin: "0 0 8px",
            background: "linear-gradient(135deg, #F5C842, #D4A017)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "0.05em",
          }}
        >
          C-LO
        </h1>

        <p
          style={{
            color: "#9CA3AF",
            textAlign: "center",
            fontSize: 14,
            margin: "0 0 24px",
            letterSpacing: "0.05em",
          }}
        >
          THE FIRST LEGITIMATE DIGITAL STREET DICE
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 24,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          {[
            ["🎲", `${rooms.length} rooms live`],
            [
              "💰",
              `${rooms.reduce((s, r) => s + r.current_bank_sc, 0).toLocaleString()} GPC in play`,
            ],
            ["👁", `${rooms.reduce((s) => s + 2, 0)} watching`],
          ].map(([icon, label]) => (
            <div
              key={String(label)}
              style={{
                color: "#9CA3AF",
                fontSize: 13,
                fontFamily: "Courier New",
              }}
            >
              {icon} {label}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            style={{
              background: "linear-gradient(135deg, #F5C842, #D4A017)",
              color: "#0A0A0F",
              border: "none",
              borderRadius: 10,
              padding: "14px 28px",
              fontSize: 15,
              fontWeight: 700,
              fontFamily: '"Cinzel Decorative", serif',
              cursor: "pointer",
              letterSpacing: "0.05em",
            }}
          >
            🎲 CREATE ROOM
          </button>
          <button
            type="button"
            onClick={() => setShowJoin(true)}
            style={{
              background: "transparent",
              color: "#A855F7",
              border: "1.5px solid #7C3AED",
              borderRadius: 10,
              padding: "14px 28px",
              fontSize: 15,
              fontWeight: 700,
              fontFamily: '"Cinzel Decorative", serif',
              cursor: "pointer",
              letterSpacing: "0.05em",
            }}
          >
            🔑 PRIVATE ROOM
          </button>
        </div>

        <div
          style={{
            textAlign: "center",
            marginTop: 16,
            color: "#6B7280",
            fontSize: 12,
            fontFamily: "Courier New",
          }}
        >
          Your balance:{" "}
          <span style={{ color: "#F5C842" }}>{myBalance.toLocaleString()} GPC</span> ({gpcToUsd(myBalance)})
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 0,
          overflowX: "auto",
          borderBottom: "1px solid rgba(124,58,237,0.15)",
          background: "rgba(13,5,32,0.8)",
          padding: "0 16px",
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
              borderBottom:
                filter === key ? "2px solid #F5C842" : "2px solid transparent",
              color: filter === key ? "#F5C842" : "#6B7280",
              padding: "14px 16px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "Courier New",
              letterSpacing: "0.05em",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px" }}>
        {filteredRooms.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "#6B7280",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎲</div>
            <div
              style={{
                fontFamily: '"Cinzel Decorative", serif',
                fontSize: 16,
                color: "#9CA3AF",
                marginBottom: 8,
              }}
            >
              No rooms yet
            </div>
            <div style={{ fontSize: 13 }}>Be the first to create one</div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 12,
            }}
          >
            {filteredRooms.map((room) => (
              <div
                key={room.id}
                style={{
                  background: "#0D0520",
                  border: "1px solid rgba(124,58,237,0.2)",
                  borderRadius: 14,
                  padding: "16px",
                  transition: "border-color 0.2s",
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
                    style={{
                      fontFamily: '"Cinzel Decorative", serif',
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                    }}
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
                      fontFamily: "Courier New",
                    }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#10B981",
                        animation: "pulse 1.5s infinite",
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
                      [
                        "Players",
                        `${room.player_count || 1}/${room.max_players}`,
                      ],
                      [
                        "Min Entry",
                        `${room.minimum_entry_sc.toLocaleString()} GPC`,
                      ],
                      ["Bank", `${room.current_bank_sc.toLocaleString()} GPC`],
                    ] as const
                  ).map(([label, val]) => (
                    <div key={label}>
                      <div
                        style={{
                          fontSize: 9,
                          color: "#6B7280",
                          fontFamily: "Courier New",
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
                          fontFamily: "Courier New",
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
                    onClick={() =>
                      router.push(`/dashboard/games/celo/${room.id}`)
                    }
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
                      fontFamily: "Courier New",
                    }}
                  >
                    👁 WATCH
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/dashboard/games/celo/${room.id}`)
                    }
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
                      fontFamily: "Courier New",
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

      {showCreate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 100,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "0",
          }}
        >
          <div
            style={{
              background: "#0D0520",
              borderTop: "2px solid #F5C842",
              borderRadius: "20px 20px 0 0",
              padding: "24px 20px",
              width: "100%",
              maxWidth: 480,
              maxHeight: "90vh",
              overflowY: "auto",
            }}
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
                style={{
                  fontFamily: '"Cinzel Decorative", serif',
                  color: "#F5C842",
                  fontSize: 20,
                  margin: 0,
                }}
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
                  fontFamily: "Courier New",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                }}
              >
                ROOM NAME
              </div>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    name: e.target.value,
                  }))
                }
                placeholder="e.g. Head Crack House"
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(124,58,237,0.3)",
                  borderRadius: 8,
                  color: "#fff",
                  padding: "12px 14px",
                  fontSize: 15,
                  fontFamily: "DM Sans",
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
                  fontFamily: "Courier New",
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
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        max_players: n,
                      }))
                    }
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 8,
                      border:
                        form.max_players === n
                          ? "2px solid #F5C842"
                          : "1px solid rgba(124,58,237,0.3)",
                      background:
                        form.max_players === n
                          ? "rgba(245,200,66,0.1)"
                          : "transparent",
                      color: form.max_players === n ? "#F5C842" : "#6B7280",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "Courier New",
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
                  fontFamily: "Courier New",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                }}
              >
                ROOM TYPE
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["public", "private"] as const).map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        room_type: t,
                      }))
                    }
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 8,
                      border:
                        form.room_type === t
                          ? "2px solid #F5C842"
                          : "1px solid rgba(124,58,237,0.3)",
                      background:
                        form.room_type === t
                          ? "rgba(245,200,66,0.1)"
                          : "transparent",
                      color: form.room_type === t ? "#F5C842" : "#6B7280",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "Courier New",
                      textTransform: "uppercase",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {form.room_type === "private" && (
                <input
                  value={form.join_code}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      join_code: e.target.value.toUpperCase().slice(0, 6),
                    }))
                  }
                  placeholder="6-CHAR CODE"
                  style={{
                    width: "100%",
                    marginTop: 8,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(124,58,237,0.3)",
                    borderRadius: 8,
                    color: "#fff",
                    padding: "10px 14px",
                    fontSize: 14,
                    fontFamily: "Courier New",
                    outline: "none",
                    letterSpacing: "0.2em",
                    boxSizing: "border-box",
                  }}
                />
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#9CA3AF",
                  fontFamily: "Courier New",
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
                      fontFamily: "Courier New",
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
                  fontFamily: "Courier New",
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
                  fontFamily: "Courier New",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 6,
                  fontSize: 11,
                  fontFamily: "Courier New",
                }}
              >
                <span
                  style={{
                    color:
                      form.starting_bank_sc > myBalance ? "#EF4444" : "#6B7280",
                  }}
                >
                  {form.starting_bank_sc > myBalance
                    ? "✗ Insufficient GPC"
                    : `✓ You have ${myBalance.toLocaleString()} GPC`}
                </span>
                <span style={{ color: "#6B7280" }}>Must be multiple of min entry</span>
              </div>
            </div>

            {createError ? (
              <div
                style={{
                  color: "#EF4444",
                  fontSize: 13,
                  marginBottom: 12,
                  fontFamily: "Courier New",
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
                creating || !form.name.trim() || form.starting_bank_sc > myBalance
              }
              style={{
                width: "100%",
                background:
                  creating || form.starting_bank_sc > myBalance
                    ? "rgba(255,255,255,0.1)"
                    : "linear-gradient(135deg, #F5C842, #D4A017)",
                border: "none",
                borderRadius: 10,
                color:
                  creating || form.starting_bank_sc > myBalance
                    ? "#6B7280"
                    : "#0A0A0F",
                padding: "16px",
                fontSize: 15,
                fontWeight: 700,
                cursor:
                  creating || form.starting_bank_sc > myBalance
                    ? "not-allowed"
                    : "pointer",
                fontFamily: '"Cinzel Decorative", serif',
                letterSpacing: "0.05em",
              }}
            >
              {creating ? "CREATING..." : "🎲 CREATE ROOM"}
            </button>
          </div>
        </div>
      )}

      {showJoin && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#0D0520",
              border: "1px solid rgba(124,58,237,0.3)",
              borderRadius: 16,
              padding: 24,
              width: "100%",
              maxWidth: 360,
            }}
          >
            <h3
              style={{
                fontFamily: '"Cinzel Decorative", serif',
                color: "#F5C842",
                fontSize: 18,
                margin: "0 0 16px",
              }}
            >
              Join Private Room
            </h3>
            <input
              value={joinCode}
              onChange={(e) =>
                setJoinCode(e.target.value.toUpperCase().slice(0, 6))
              }
              placeholder="ENTER CODE"
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(124,58,237,0.3)",
                borderRadius: 8,
                color: "#fff",
                padding: "14px",
                fontSize: 20,
                fontFamily: "Courier New",
                letterSpacing: "0.3em",
                textAlign: "center",
                outline: "none",
                marginBottom: 16,
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowJoin(false)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "1px solid rgba(124,58,237,0.3)",
                  borderRadius: 8,
                  color: "#6B7280",
                  padding: "12px",
                  cursor: "pointer",
                  fontFamily: "Courier New",
                  fontSize: 13,
                }}
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => void handleJoinPrivate()}
                disabled={joinCode.length < 6}
                style={{
                  flex: 2,
                  background:
                    joinCode.length < 6
                      ? "rgba(255,255,255,0.1)"
                      : "linear-gradient(135deg, #F5C842, #D4A017)",
                  border: "none",
                  borderRadius: 8,
                  color: joinCode.length < 6 ? "#6B7280" : "#0A0A0F",
                  padding: "12px",
                  cursor: joinCode.length < 6 ? "not-allowed" : "pointer",
                  fontFamily: '"Cinzel Decorative", serif',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                JOIN ROOM
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1 }
          50% { opacity: 0.4 }
        }
      `}</style>
    </div>
  );
}
