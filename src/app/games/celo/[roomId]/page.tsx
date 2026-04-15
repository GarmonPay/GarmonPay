"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createBrowserClient } from "@/lib/supabase";

const VoiceChat = dynamic(() => import("@/components/celo/VoiceChat"), { ssr: false });

// =============================================================================
// TYPES
// =============================================================================

type DiceType =
  | "standard"
  | "gold"
  | "diamond"
  | "blood"
  | "street"
  | "midnight"
  | "fire";

type Player = {
  id: string;
  user_id: string;
  name: string;
  role: "banker" | "player" | "spectator";
  seat_number: number;
  entry_sc: number;
  dice_type: DiceType;
  is_active: boolean;
};

type Room = {
  id: string;
  name: string;
  banker_id: string;
  status: string;
  minimum_entry_sc: number;
  current_bank_sc: number;
  max_players: number;
};

type Round = {
  id: string;
  status: string;
  banker_dice: number[];
  banker_roll_name: string;
  banker_roll_result: string;
  banker_point: number;
  prize_pool_sc: number;
  bank_covered: boolean;
  covered_by: string;
};

type ChatMessage = {
  id: string;
  user_id: string;
  message: string;
  is_system: boolean;
  created_at: string;
  user_name?: string;
};

type SideBet = {
  id: string;
  creator_id: string;
  creator_name: string;
  bet_type: string;
  amount_sc: number;
  odds_multiplier: number;
  status: string;
  expires_at: string;
};

type DbPlayerRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  role: string;
  seat_number: number | null;
  entry_sc?: number | null;
  bet_cents?: number | null;
  dice_type?: string | null;
  users?: { full_name?: string | null; email?: string | null } | null;
};

// =============================================================================
// CONSTANTS
// =============================================================================

const DICE_COLORS: Record<
  DiceType,
  {
    bg: string;
    dot: string;
    glow: string;
  }
> = {
  standard: {
    bg: "#CC2200",
    dot: "#ffffff",
    glow: "rgba(204,34,0,0.6)",
  },
  gold: {
    bg: "#D4A017",
    dot: "#1a1a1a",
    glow: "rgba(212,160,23,0.6)",
  },
  diamond: {
    bg: "#E8F4FD",
    dot: "#1a3a5c",
    glow: "rgba(232,244,253,0.6)",
  },
  blood: {
    bg: "#8B0000",
    dot: "#F5C842",
    glow: "rgba(139,0,0,0.6)",
  },
  street: {
    bg: "#1a5c1a",
    dot: "#ffffff",
    glow: "rgba(26,92,26,0.6)",
  },
  midnight: {
    bg: "#0a0a2e",
    dot: "#ffffff",
    glow: "rgba(10,10,46,0.6)",
  },
  fire: {
    bg: "#FF4500",
    dot: "#FFD700",
    glow: "rgba(255,69,0,0.6)",
  },
};

const DOT_GRID: Record<number, number[][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
};

const FACE_ROTATIONS: Record<number, string> = {
  1: "rotateX(0deg) rotateY(0deg)",
  2: "rotateX(-90deg) rotateY(0deg)",
  3: "rotateX(0deg) rotateY(90deg)",
  4: "rotateX(0deg) rotateY(-90deg)",
  5: "rotateX(90deg) rotateY(0deg)",
  6: "rotateX(180deg) rotateY(0deg)",
};

void FACE_ROTATIONS;

const ROLL_STYLES: Record<
  string,
  {
    color: string;
    size: number;
    glow: string;
    animation: string;
  }
> = {
  "C-LO! 🎲": {
    color: "#F5C842",
    size: 56,
    glow: "0 0 40px #F5C842, 0 0 80px rgba(245,200,66,0.4)",
    animation: "cloFlash 0.4s ease infinite alternate",
  },
  "HAND CRACK! 💥": {
    color: "#F5C842",
    size: 44,
    glow: "0 0 30px #F5C842",
    animation: "explode 0.4s ease",
  },
  "SHIT! 💩": {
    color: "#EF4444",
    size: 44,
    glow: "0 0 30px #EF4444",
    animation: "shake 0.5s ease",
  },
  "DICK! 😂": {
    color: "#EF4444",
    size: 44,
    glow: "0 0 20px #EF4444",
    animation: "explode 0.3s ease",
  },
  "TRIP SIXES - THE BOSS! 👑": {
    color: "#F5C842",
    size: 36,
    glow: "0 0 40px #F5C842",
    animation: "rainbow 1s linear infinite",
  },
  "ACE OUT! 🎲": {
    color: "#F5C842",
    size: 44,
    glow: "0 0 30px #F5C842",
    animation: "explode 0.4s ease",
  },
};

function getRollStyle(rollName: string) {
  if (ROLL_STYLES[rollName]) return ROLL_STYLES[rollName];
  if (rollName.includes("ZOE") || rollName.includes("HAITIAN"))
    return { color: "#10B981", size: 44, glow: "0 0 20px #10B981", animation: "explode 0.3s ease" };
  if (rollName.includes("POLICE") || rollName.includes("POUND"))
    return { color: "#3B82F6", size: 44, glow: "0 0 20px #3B82F6", animation: "explode 0.3s ease" };
  if (rollName.includes("GIRL") || rollName.includes("HOE"))
    return { color: "#EC4899", size: 44, glow: "0 0 20px #EC4899", animation: "explode 0.3s ease" };
  if (rollName.includes("SHORTLY") || rollName.includes("JIT"))
    return { color: "#A855F7", size: 44, glow: "0 0 20px #A855F7", animation: "explode 0.3s ease" };
  if (rollName.includes("TRIP"))
    return { color: "#F5C842", size: 40, glow: "0 0 30px #F5C842", animation: "explode 0.4s ease" };
  return { color: "#666", size: 24, glow: "none", animation: "none" };
}

function mapDiceType(raw: string | null | undefined): DiceType {
  const t = String(raw ?? "standard").toLowerCase();
  if (t in DICE_COLORS) return t as DiceType;
  return "standard";
}

function normalizeRoomRow(row: Record<string, unknown>): Room {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    banker_id: String(row.banker_id ?? ""),
    status: String(row.status ?? ""),
    minimum_entry_sc: Number(row.minimum_entry_sc ?? row.min_bet_cents ?? 0),
    current_bank_sc: Number(row.current_bank_sc ?? row.current_bank_cents ?? 0),
    max_players: Number(row.max_players ?? 6),
  };
}

function normalizeRoundRow(r: Record<string, unknown>): Round {
  const bankerDice = (r.banker_dice ?? r.banker_roll) as number[] | undefined;
  const name = String(r.banker_roll_name ?? r.banker_dice_name ?? "");
  const result = String(r.banker_roll_result ?? r.banker_dice_result ?? "");
  return {
    id: String(r.id ?? ""),
    status: String(r.status ?? ""),
    banker_dice: Array.isArray(bankerDice) ? bankerDice : [1, 1, 1],
    banker_roll_name: name,
    banker_roll_result: result,
    banker_point: Number(r.banker_point ?? 0),
    prize_pool_sc: Number(r.prize_pool_sc ?? r.total_pot_cents ?? 0),
    bank_covered: Boolean(r.bank_covered),
    covered_by: String(r.covered_by ?? ""),
  };
}

function mapPlayerRow(p: DbPlayerRow): Player {
  const entry = Number(p.entry_sc ?? p.bet_cents ?? 0);
  const nm =
    p.users?.full_name?.trim() ||
    (p.users?.email?.split("@")[0] ?? "").trim() ||
    "Player";
  return {
    id: String(p.id),
    user_id: String(p.user_id),
    name: nm,
    role: (p.role === "banker" || p.role === "spectator" ? p.role : "player") as Player["role"],
    seat_number: Number(p.seat_number ?? 0),
    entry_sc: entry,
    dice_type: mapDiceType(p.dice_type as string | undefined),
    is_active: true,
  };
}

// =============================================================================
// DIE / DICE / SEAT
// =============================================================================

function DieFace({
  value,
  diceType = "standard",
  rolling = false,
  rollEpoch = 0,
  size = 72,
}: {
  value: number;
  diceType?: DiceType;
  rolling?: boolean;
  rollEpoch?: number;
  size?: number;
}) {
  const colors = DICE_COLORS[diceType];
  const dots = DOT_GRID[value] || DOT_GRID[1];

  return (
    <div
      style={{
        width: size,
        height: size,
        perspective: 400,
        flexShrink: 0,
      }}
    >
      <div
        key={`die-${rollEpoch}`}
        style={{
          width: "100%",
          height: "100%",
          background: colors.bg,
          borderRadius: 12,
          border: "2px solid rgba(255,255,255,0.2)",
          boxShadow: rolling
            ? `0 0 30px ${colors.glow}, 
               inset 0 1px 0 rgba(255,255,255,0.3)`
            : `0 4px 20px rgba(0,0,0,0.6),
               inset 0 1px 0 rgba(255,255,255,0.2)`,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gridTemplateRows: "repeat(3, 1fr)",
          padding: size * 0.12,
          gap: size * 0.04,
          animation: rolling ? `rollDie${rollEpoch % 3} 2.5s ease-out forwards` : "none",
          position: "relative",
          transformStyle: "preserve-3d",
        }}
      >
        {[0, 1, 2].map((row) =>
          [0, 1, 2].map((col) => {
            const hasDot = dots.some(([r, c]) => r === row && c === col);
            return (
              <div
                key={`${row}-${col}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {hasDot && (
                  <div
                    style={{
                      width: size * 0.14,
                      height: size * 0.14,
                      borderRadius: "50%",
                      background: colors.dot,
                      boxShadow: "inset 0 1px 3px rgba(0,0,0,0.4)",
                    }}
                  />
                )}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

function DiceDisplay({
  dice,
  rolling,
  rollEpoch,
  diceType = "standard",
}: {
  dice: [number, number, number];
  rolling: boolean;
  rollEpoch: number;
  diceType?: DiceType;
}) {
  const [displayDice, setDisplayDice] = useState<[number, number, number]>([1, 1, 1]);

  useEffect(() => {
    if (!rolling) {
      setDisplayDice(dice);
      return;
    }
    const interval = setInterval(() => {
      setDisplayDice([
        Math.ceil(Math.random() * 6),
        Math.ceil(Math.random() * 6),
        Math.ceil(Math.random() * 6),
      ] as [number, number, number]);
    }, 100);
    return () => clearInterval(interval);
  }, [rolling, dice]);

  return (
    <div
      style={{
        display: "flex",
        gap: 20,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {displayDice.map((val, i) => (
        <DieFace
          key={i}
          value={val}
          diceType={diceType}
          rolling={rolling}
          rollEpoch={rollEpoch}
          size={72}
        />
      ))}
    </div>
  );
}

function PlayerSeat({
  player,
  isCurrentUser,
  isActive,
  isBankCovered,
  onJoin,
  isEmpty,
  seatNumber,
}: {
  player?: Player;
  isCurrentUser?: boolean;
  isActive?: boolean;
  isBankCovered?: boolean;
  onJoin?: () => void;
  isEmpty?: boolean;
  seatNumber: number;
}) {
  if (isEmpty || !player) {
    return (
      <div
        onClick={onJoin}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          cursor: onJoin ? "pointer" : "default",
          opacity: 0.5,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            border: "2px dashed #444",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            color: "#444",
            transition: "all 0.2s",
          }}
        >
          +
        </div>
        <span
          style={{
            fontSize: 10,
            color: "#555",
            fontFamily: "Courier New",
          }}
        >
          OPEN
        </span>
      </div>
    );
  }

  const initial = (player.name || "P")[0].toUpperCase();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        animation: "seatJoin 0.4s ease-out",
        position: "relative",
      }}
    >
      {isActive && (
        <div
          style={{
            position: "absolute",
            top: -4,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 10,
            color: "#F5C842",
            fontFamily: "Courier New",
            whiteSpace: "nowrap",
            animation: "pulse 1s ease infinite",
          }}
        >
          ROLLING...
        </div>
      )}

      {isBankCovered && (
        <div
          style={{
            position: "absolute",
            top: -16,
            fontSize: 14,
          }}
        >
          💰
        </div>
      )}

      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: isCurrentUser
            ? "linear-gradient(135deg, #7C3AED, #F5C842)"
            : "linear-gradient(135deg, #4C1D95, #7C3AED)",
          border: isCurrentUser
            ? "3px solid #F5C842"
            : isActive
              ? "3px solid #F5C842"
              : "2px solid rgba(124,58,237,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          fontWeight: "bold",
          color: "#fff",
          boxShadow: isActive
            ? "0 0 20px rgba(245,200,66,0.6)"
            : isCurrentUser
              ? "0 0 15px rgba(124,58,237,0.5)"
              : "none",
          animation: isActive ? "turnPulse 1s ease infinite" : "none",
          transition: "all 0.3s",
        }}
      >
        {initial}
      </div>

      <span
        style={{
          fontSize: 10,
          color: isCurrentUser ? "#F5C842" : "#ccc",
          fontFamily: "Courier New",
          maxWidth: 60,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {isCurrentUser ? "YOU" : player.name}
      </span>

      {player.entry_sc > 0 && (
        <span
          style={{
            fontSize: 9,
            color: "#10B981",
            fontFamily: "Courier New",
          }}
        >
          {player.entry_sc} SC
        </span>
      )}
    </div>
  );
}

export default function CeloRoomPage() {
  const params = useParams();
  const rid = params.roomId;
  const roomId = (Array.isArray(rid) ? rid[0] : rid) as string;
  const router = useRouter();
  /** Same client as login + C-Lo lobby (`@/core/supabase` → localStorage session). Auth-helpers cookie client would not see this session. */
  const supabase = useMemo(() => createBrowserClient(), []);

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [myBalance, setMyBalance] = useState(0);
  const [dice, setDice] = useState<[number, number, number]>([1, 1, 1]);
  const [rolling, setRolling] = useState(false);
  const [rollEpoch, setRollEpoch] = useState(0);
  const [rollName, setRollName] = useState<string | null>(null);
  const [rollResult, setRollResult] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sideBets, setSideBets] = useState<SideBet[]>([]);
  const [onlineCount, setOnlineCount] = useState(1);
  const [connected, setConnected] = useState(true);
  const [myStreak, setMyStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDiceShop, setShowDiceShop] = useState(false);
  const [showLowerBank, setShowLowerBank] = useState(false);
  const [showBecomeBanker, setShowBecomeBanker] = useState(false);
  const [showCoverBank, setShowCoverBank] = useState(false);
  const [showSideBetModal, setShowSideBetModal] = useState(false);
  const [canLowerBank, setCanLowerBank] = useState(false);
  const [canBecomeBanker, setCanBecomeBanker] = useState(false);
  const [lowerBankTimer, setLowerBankTimer] = useState(60);
  const [becomeBankerTimer, setBecomeBankerTimer] = useState(30);
  const [myDiceType, setMyDiceType] = useState<DiceType>("standard");
  const [balanceFlash, setBalanceFlash] = useState<"up" | "down" | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const rollingRef = useRef(false);

  const myPlayer = players.find((p) => p.user_id === currentUser?.id);
  const banker = players.find((p) => p.role === "banker");
  const activePlayers = players.filter((p) => p.role === "player");
  const isMyTurn = currentRound?.status === "player_rolling" && myPlayer?.role === "player";
  const isBankerTurn = currentRound?.status === "banker_rolling" && myPlayer?.role === "banker";
  const isMyRoll = isMyTurn || isBankerTurn;
  const canStartRound = Boolean(
    myPlayer?.role === "banker" && !currentRound && activePlayers.some((p) => p.entry_sc > 0),
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const flashBalance = (direction: "up" | "down") => {
    setBalanceFlash(direction);
    setTimeout(() => setBalanceFlash(null), 1000);
  };

  const addSystemMessage = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev.slice(-49),
      {
        id: `sys-${Date.now()}`,
        user_id: "system",
        message: text,
        is_system: true,
        created_at: new Date().toISOString(),
      },
    ]);
  }, []);

  const fetchRoomData = useCallback(async () => {
    if (!roomId) {
      setError("Room not found");
      setLoading(false);
      return;
    }
    if (!supabase) {
      setError("Not configured");
      setLoading(false);
      return;
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) {
        router.push("/login");
        return;
      }
      const u = user as { email_confirmed_at?: string | null };
      if (u.email_confirmed_at == null || u.email_confirmed_at === "") {
        router.push("/login");
        return;
      }
      setCurrentUser(user);

      const accessToken = session?.access_token;
      const snapshotRes = await fetch(`/api/celo/room/${encodeURIComponent(roomId)}/snapshot`, {
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });

      if (snapshotRes.status === 401) {
        router.push("/login");
        return;
      }

      if (snapshotRes.status === 403 || snapshotRes.status === 404) {
        setError("Room not found");
        setLoading(false);
        return;
      }

      if (snapshotRes.ok) {
        const snap = (await snapshotRes.json()) as {
          room?: Record<string, unknown>;
          players?: DbPlayerRow[];
          round?: Record<string, unknown> | null;
        };
        if (!snap.room) {
          setError("Room not found");
          setLoading(false);
          return;
        }
        setRoom(normalizeRoomRow(snap.room));
        const mapped = (snap.players ?? []).map((p) => mapPlayerRow(p));
        setPlayers(mapped);
        const mine = mapped.find((p) => p.user_id === user.id);
        if (mine?.dice_type) setMyDiceType(mine.dice_type);
        if (snap.round) {
          const nr = normalizeRoundRow(snap.round);
          setCurrentRound(nr);
          if (nr.banker_dice?.length === 3) {
            setDice(nr.banker_dice as [number, number, number]);
          }
        } else {
          setCurrentRound(null);
        }
      } else {
        const { data: roomData, error: roomErr } = await supabase.from("celo_rooms").select("*").eq("id", roomId).maybeSingle();
        if (roomErr || !roomData) {
          setError("Room not found");
          setLoading(false);
          return;
        }
        setRoom(normalizeRoomRow(roomData as Record<string, unknown>));

        const { data: playersData } = await supabase
          .from("celo_room_players")
          .select(
            `*,
        users (
          full_name,
          email
        )`,
          )
          .eq("room_id", roomId)
          .order("seat_number", { ascending: true });

        if (playersData) {
          const mapped = (playersData as DbPlayerRow[]).map(mapPlayerRow);
          setPlayers(mapped);
          const mine = mapped.find((p) => p.user_id === user.id);
          if (mine?.dice_type) setMyDiceType(mine.dice_type);
        }

        const { data: roundData } = await supabase
          .from("celo_rounds")
          .select("*")
          .eq("room_id", roomId)
          .neq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (roundData) {
          const nr = normalizeRoundRow(roundData as Record<string, unknown>);
          setCurrentRound(nr);
          if (nr.banker_dice?.length === 3) {
            setDice(nr.banker_dice as [number, number, number]);
          }
        } else {
          setCurrentRound(null);
        }
      }

      const { data: userData } = await supabase.from("users").select("sweeps_coins, balance_cents").eq("id", user.id).maybeSingle();

      const balRow = userData as { sweeps_coins?: number; balance_cents?: number } | null;
      setMyBalance(Number(balRow?.sweeps_coins ?? balRow?.balance_cents ?? 0));

      const { data: chatData } = await supabase
        .from("celo_chat")
        .select(
          `*,
        users (full_name, email)`,
        )
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(50);

      if (chatData) {
        setMessages(
          (chatData as Array<Record<string, unknown> & { users?: { full_name?: string | null; email?: string | null } }>).map((m) => ({
            id: String(m.id),
            user_id: String(m.user_id),
            message: String(m.message ?? ""),
            is_system: false,
            created_at: String(m.created_at ?? ""),
            user_name: m.users?.full_name?.trim() || m.users?.email?.split("@")[0] || "Player",
          })),
        );
      }

      const { data: betsData } = await supabase
        .from("celo_side_bets")
        .select(
          `*,
        users (full_name, email)`,
        )
        .eq("room_id", roomId)
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (betsData) {
        setSideBets(
          (betsData as Array<Record<string, unknown> & { users?: { full_name?: string | null; email?: string | null } }>).map((b) => ({
            id: String(b.id),
            creator_id: String(b.creator_id),
            creator_name: b.users?.full_name?.trim() || b.users?.email?.split("@")[0] || "Player",
            bet_type: String(b.bet_type ?? ""),
            amount_sc: Number(b.amount_cents ?? b.amount_sc ?? 0),
            odds_multiplier: Number(b.odds_multiplier ?? 2),
            status: String(b.status ?? "open"),
            expires_at: String(b.expires_at ?? ""),
          })),
        );
      }

      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Failed to load room");
      setLoading(false);
    }
  }, [roomId, router, supabase]);

  const triggerRollAnimation = useCallback(
    async (rollData: Record<string, unknown>) => {
      if (rollingRef.current) return;
      rollingRef.current = true;
      setRolling(true);
      setRollName(null);
      setRollResult(null);
      setRollEpoch((e) => e + 1);

      await new Promise((r) => setTimeout(r, 2500));

      setRolling(false);
      const d = rollData.dice as number[] | undefined;
      setDice((d?.length === 3 ? d : [1, 1, 1]) as [number, number, number]);
      rollingRef.current = false;

      await new Promise((r) => setTimeout(r, 400));
      setRollName((rollData.roll_name as string) ?? null);

      await new Promise((r) => setTimeout(r, 1500));
      setRollResult((rollData.outcome as string) ?? null);

      const rn = rollData.roll_name as string | undefined;
      if (rn) addSystemMessage(`🎲 ${rn}`);
    },
    [addSystemMessage],
  );

  useEffect(() => {
    if (!supabase) return;
    void fetchRoomData();

    const channel = supabase.channel(`celo-room-${roomId}`, {
      config: { broadcast: { self: true } },
    });

    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.new) setRoom(normalizeRoomRow(payload.new as Record<string, unknown>));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_room_players", filter: `room_id=eq.${roomId}` },
        () => {
          void fetchRoomData();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_rounds", filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            if (payload.new) setCurrentRound(normalizeRoundRow(payload.new as Record<string, unknown>));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "celo_player_rolls", filter: `room_id=eq.${roomId}` },
        (payload) => {
          void triggerRollAnimation(payload.new as Record<string, unknown>);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "celo_side_bets", filter: `room_id=eq.${roomId}` },
        async () => {
          const { data } = await supabase
            .from("celo_side_bets")
            .select(
              `*,
            users (full_name, email)`,
            )
            .eq("room_id", roomId)
            .eq("status", "open")
            .order("created_at", { ascending: false });
          if (data) {
            setSideBets(
              (data as Array<Record<string, unknown> & { users?: { full_name?: string | null; email?: string | null } }>).map((b) => ({
                id: String(b.id),
                creator_id: String(b.creator_id),
                creator_name: b.users?.full_name?.trim() || b.users?.email?.split("@")[0] || "Player",
                bet_type: String(b.bet_type ?? ""),
                amount_sc: Number(b.amount_cents ?? b.amount_sc ?? 0),
                odds_multiplier: Number(b.odds_multiplier ?? 2),
                status: String(b.status ?? "open"),
                expires_at: String(b.expires_at ?? ""),
              })),
            );
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "celo_chat", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const raw = payload.new as Record<string, unknown>;
          const msgId = String(raw.id);
          const uid = String(raw.user_id ?? "");
          const { data: u } = await supabase.from("users").select("full_name, email").eq("id", uid).maybeSingle();
          const ur = u as { full_name?: string | null; email?: string | null } | null;
          const userName = ur?.full_name?.trim() || ur?.email?.split("@")[0] || "Player";
          const incoming: ChatMessage = {
            id: msgId,
            user_id: uid,
            message: String(raw.message ?? ""),
            is_system: false,
            created_at: String(raw.created_at ?? new Date().toISOString()),
            user_name: userName,
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === msgId)) return prev;
            return [...prev.slice(-49), incoming];
          });
        },
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void fetchRoomData();
      });

    const presenceChannel = supabase.channel(`presence-${roomId}`);
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        setOnlineCount(Math.max(1, Object.keys(state).length));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: currentUser?.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(presenceChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, supabase]);

  useEffect(() => {
    if (!canLowerBank) return;
    if (lowerBankTimer <= 0) {
      setCanLowerBank(false);
      return;
    }
    const t = setInterval(() => setLowerBankTimer((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [canLowerBank, lowerBankTimer]);

  useEffect(() => {
    if (!canBecomeBanker) return;
    if (becomeBankerTimer <= 0) {
      setCanBecomeBanker(false);
      return;
    }
    const t = setInterval(() => setBecomeBankerTimer((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [canBecomeBanker, becomeBankerTimer]);

  const handleRoll = async () => {
    if (!supabase || rollingRef.current || !currentRound) return;
    rollingRef.current = true;
    setRolling(true);
    setRollName(null);
    setRollResult(null);
    setRollEpoch((e) => e + 1);

    const token = (await supabase.auth.getSession()).data.session?.access_token;

    const [, res] = await Promise.all([
      new Promise((r) => setTimeout(r, 2500)),
      fetch("/api/celo/round/roll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ room_id: roomId, round_id: currentRound.id }),
      }).then((r) => r.json() as Promise<Record<string, unknown>>),
    ]);

    setRolling(false);
    rollingRef.current = false;

    if (res.error) {
      setRollName("Error — try again");
      return;
    }

    const d = res.dice as number[] | undefined;
    setDice((d?.length === 3 ? d : [1, 1, 1]) as [number, number, number]);

    await new Promise((r) => setTimeout(r, 400));
    setRollName((res.rollName as string) ?? null);

    await new Promise((r) => setTimeout(r, 1500));
    setRollResult((res.outcome as string) ?? null);

    if (res.banker_can_lower_bank || res.banker_can_adjust_bank) {
      setCanLowerBank(true);
      setLowerBankTimer(60);
      setShowLowerBank(true);
    }
    if (res.player_can_become_banker) {
      setCanBecomeBanker(true);
      setBecomeBankerTimer(30);
      setShowBecomeBanker(true);
    }

    if (currentUser?.id) {
      const { data: userData } = await supabase.from("users").select("sweeps_coins, balance_cents").eq("id", currentUser.id).maybeSingle();
      const row = userData as { sweeps_coins?: number; balance_cents?: number } | null;
      const newBal = Number(row?.sweeps_coins ?? row?.balance_cents ?? 0);
      if (newBal > myBalance) flashBalance("up");
      if (newBal < myBalance) flashBalance("down");
      setMyBalance(newBal);
    }

    const oc = res.outcome as string | undefined;
    if (myPlayer?.role === "player") {
      if (oc === "win") setMyStreak((s) => s + 1);
      else if (oc === "loss") setMyStreak(0);
    }

    void fetchRoomData();
  };

  const handleStartRound = async () => {
    if (!supabase) return;
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/celo/round/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ room_id: roomId }),
    });
  };

  const sendChat = async () => {
    if (!supabase || !chatInput.trim() || !currentUser) return;
    const msg = chatInput.trim();
    setChatInput("");
    await supabase.from("celo_chat").insert({
      room_id: roomId,
      user_id: currentUser.id,
      message: msg,
    });
  };

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          background: "#0A0A0F",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            border: "3px solid rgba(245,200,66,0.3)",
            borderTop: "3px solid #F5C842",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        <p style={{ color: "#F5C842", fontFamily: "Courier New", fontSize: 14, letterSpacing: 2 }}>LOADING ROOM...</p>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div
        style={{
          height: "100vh",
          background: "#0A0A0F",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <p style={{ color: "#EF4444", fontSize: 24 }}>{error || "Room not found"}</p>
        <button
          type="button"
          onClick={() => router.push("/dashboard/games/celo")}
          style={{
            background: "linear-gradient(135deg, #F5C842, #D4A017)",
            border: "none",
            borderRadius: 8,
            color: "#000",
            padding: "12px 24px",
            fontWeight: "bold",
            cursor: "pointer",
            fontFamily: "Courier New",
          }}
        >
          BACK TO LOBBY
        </button>
      </div>
    );
  }

  const rollStyle = rollName ? getRollStyle(rollName) : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes cloFlash {
          from { opacity: 1; transform: scale(1) }
          to { opacity: 0.7; transform: scale(1.08) }
        }
        @keyframes shake {
          0%,100% { transform: translateX(0) }
          20% { transform: translateX(-12px) }
          40% { transform: translateX(12px) }
          60% { transform: translateX(-12px) }
          80% { transform: translateX(12px) }
        }
        @keyframes explode {
          0% { transform: scale(0.3); opacity: 0 }
          60% { transform: scale(1.15) }
          100% { transform: scale(1); opacity: 1 }
        }
        @keyframes turnPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(245,200,66,0.6) }
          50% { box-shadow: 0 0 0 14px rgba(245,200,66,0) }
        }
        @keyframes seatJoin {
          from { opacity: 0; transform: scale(0.8) translateY(10px) }
          to { opacity: 1; transform: scale(1) translateY(0) }
        }
        @keyframes bankGrow {
          0% { transform: scale(1); color: #F5C842 }
          50% { transform: scale(1.3); color: #10B981 }
          100% { transform: scale(1); color: #F5C842 }
        }
        @keyframes pulse {
          0%,100% { opacity: 1 }
          50% { opacity: 0.5 }
        }
        @keyframes livePulse {
          0%,100% { transform: scale(1); opacity: 1 }
          50% { transform: scale(1.4); opacity: 0.6 }
        }
        @keyframes rainbow {
          0% { color: #F5C842 }
          25% { color: #10B981 }
          50% { color: #A855F7 }
          75% { color: #3B82F6 }
          100% { color: #F5C842 }
        }
        @keyframes rollDie0 {
          0%   { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg) }
          30%  { transform: rotateX(540deg) rotateY(270deg) rotateZ(180deg) }
          70%  { transform: rotateX(900deg) rotateY(450deg) rotateZ(270deg) }
          100% { transform: rotateX(1080deg) rotateY(540deg) rotateZ(360deg) }
        }
        @keyframes rollDie1 {
          0%   { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg) }
          30%  { transform: rotateX(270deg) rotateY(540deg) rotateZ(90deg) }
          70%  { transform: rotateX(450deg) rotateY(720deg) rotateZ(180deg) }
          100% { transform: rotateX(720deg) rotateY(900deg) rotateZ(360deg) }
        }
        @keyframes rollDie2 {
          0%   { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg) }
          30%  { transform: rotateX(360deg) rotateY(180deg) rotateZ(270deg) }
          70%  { transform: rotateX(540deg) rotateY(360deg) rotateZ(450deg) }
          100% { transform: rotateX(900deg) rotateY(720deg) rotateZ(360deg) }
        }
        ::-webkit-scrollbar { width: 4px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb {
          background: rgba(124,58,237,0.4);
          border-radius: 2px;
        }
      `}</style>

      <div
        style={{
          height: "100vh",
          background: "#0A0A0F",
          backgroundImage: `
          radial-gradient(ellipse at 15% 50%,
            rgba(124,58,237,0.08) 0%, transparent 55%),
          radial-gradient(ellipse at 85% 50%,
            rgba(245,200,66,0.05) 0%, transparent 55%)
        `,
          display: "grid",
          gridTemplateRows: "60px 1fr 80px",
          overflow: "hidden",
          fontFamily: "DM Sans, sans-serif",
        }}
      >
        <div
          style={{
            background: "rgba(13,5,32,0.95)",
            borderBottom: "1px solid rgba(124,58,237,0.25)",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: 16,
            backdropFilter: "blur(10px)",
          }}
        >
          <button
            type="button"
            onClick={() => router.push("/dashboard/games/celo")}
            style={{
              background: "none",
              border: "1px solid rgba(124,58,237,0.3)",
              borderRadius: 8,
              color: "#aaa",
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "Courier New",
            }}
          >
            ← LOBBY
          </button>

          <h1
            style={{
              fontFamily: "Cinzel Decorative, serif",
              fontSize: 16,
              color: "#F5C842",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {room.name}
          </h1>

          <div
            style={{
              background: "rgba(245,200,66,0.1)",
              border: "1px solid rgba(245,200,66,0.3)",
              borderRadius: 8,
              padding: "4px 14px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 10, color: "#888", fontFamily: "Courier New", letterSpacing: 1 }}>BANK</div>
            <div style={{ fontSize: 16, color: "#F5C842", fontWeight: "bold", fontFamily: "Courier New" }}>
              {(room.current_bank_sc / 100).toFixed(0)} SC
            </div>
          </div>

          {currentRound && (
            <div
              style={{
                background: "rgba(124,58,237,0.1)",
                border: "1px solid rgba(124,58,237,0.3)",
                borderRadius: 8,
                padding: "4px 14px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 10, color: "#888", fontFamily: "Courier New" }}>PRIZE POOL</div>
              <div style={{ fontSize: 16, color: "#A855F7", fontWeight: "bold", fontFamily: "Courier New" }}>
                {(currentRound.prize_pool_sc / 100).toFixed(0)} SC
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#666", fontFamily: "Courier New" }}>👁 {onlineCount}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: connected ? "#10B981" : "#EF4444",
                  animation: connected ? "livePulse 2s ease infinite" : "none",
                }}
              />
              <span style={{ fontSize: 10, color: connected ? "#10B981" : "#EF4444", fontFamily: "Courier New" }}>
                {connected ? "LIVE" : "RECONNECTING"}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", overflow: "hidden" }}>
          <div
            style={{
              flex: 1,
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "20px 20px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%,-50%) rotate(-15deg)",
                fontSize: 200,
                fontWeight: 900,
                color: "#7C3AED",
                opacity: 0.03,
                userSelect: "none",
                pointerEvents: "none",
                fontFamily: "Cinzel Decorative",
                whiteSpace: "nowrap",
              }}
            >
              C-LO
            </div>

            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 3,
                background: "linear-gradient(to bottom, transparent, #7C3AED, transparent)",
                boxShadow: "0 0 30px rgba(124,58,237,0.5)",
              }}
            />
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                bottom: 0,
                width: 3,
                background: "linear-gradient(to bottom, transparent, #F5C842, transparent)",
                boxShadow: "0 0 30px rgba(245,200,66,0.3)",
              }}
            />

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, zIndex: 2 }}>
              <div style={{ fontSize: 20 }}>👑</div>
              <div
                style={{
                  width: 70,
                  height: 70,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #4C1D95, #7C3AED)",
                  border: "3px solid #F5C842",
                  boxShadow: "0 0 25px rgba(245,200,66,0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  fontWeight: "bold",
                  color: "#fff",
                }}
              >
                {(banker?.name || "B")[0].toUpperCase()}
              </div>
              <span style={{ color: "#F5C842", fontFamily: "Courier New", fontSize: 11, letterSpacing: 1 }}>
                {banker?.name || "BANKER"}
              </span>
              <div
                style={{
                  background: "rgba(245,200,66,0.15)",
                  border: "1px solid rgba(245,200,66,0.4)",
                  borderRadius: 99,
                  padding: "2px 10px",
                  fontSize: 10,
                  color: "#F5C842",
                  fontFamily: "Courier New",
                }}
              >
                BANKER
              </div>

              {myPlayer?.role === "banker" && (
                <button
                  type="button"
                  onClick={() => setShowDiceShop(true)}
                  style={{
                    background: "rgba(124,58,237,0.2)",
                    border: "1px solid rgba(124,58,237,0.4)",
                    borderRadius: 6,
                    color: "#A855F7",
                    padding: "4px 10px",
                    fontSize: 10,
                    cursor: "pointer",
                    fontFamily: "Courier New",
                  }}
                >
                  🎲 CHANGE DICE
                </button>
              )}
            </div>

            <div
              style={{
                position: "relative",
                width: 360,
                height: 230,
                borderRadius: "50%",
                background: "radial-gradient(circle, #1a3a2a 0%, #0d2018 60%, #080f0c 100%)",
                border: "4px solid #2a5a3a",
                boxShadow: `
                0 0 60px rgba(0,0,0,0.9),
                inset 0 0 40px rgba(0,0,0,0.6),
                0 0 30px rgba(16,185,129,0.1)
              `,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                zIndex: 2,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background:
                    "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
                }}
              />

              <DiceDisplay dice={dice} rolling={rolling} rollEpoch={rollEpoch} diceType={myDiceType} />

              {rollName && !rolling && (
                <div
                  style={{
                    fontFamily: "Cinzel Decorative, serif",
                    fontSize: rollStyle?.size || 32,
                    color: rollStyle?.color || "#fff",
                    textShadow: rollStyle?.glow || "none",
                    animation: rollStyle?.animation || "none",
                    textAlign: "center",
                    lineHeight: 1.2,
                    zIndex: 1,
                  }}
                >
                  {rollName}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 20,
                alignItems: "flex-start",
                justifyContent: "center",
                flexWrap: "wrap",
                zIndex: 2,
              }}
            >
              {Array.from({ length: room.max_players }).map((_, i) => {
                const player = activePlayers[i];
                const isCurrentUser = player?.user_id === currentUser?.id;
                const isActive = currentRound?.status === "player_rolling" && i === 0;
                const isCovered = currentRound?.bank_covered && currentRound?.covered_by === player?.user_id;

                return (
                  <PlayerSeat
                    key={i}
                    seatNumber={i + 1}
                    player={player}
                    isEmpty={!player}
                    isCurrentUser={isCurrentUser}
                    isActive={isActive}
                    isBankCovered={isCovered}
                    onJoin={!player ? () => {} : undefined}
                  />
                );
              })}
            </div>

            {myStreak >= 2 && (
              <div
                style={{
                  position: "absolute",
                  top: 20,
                  left: 20,
                  background: "rgba(245,200,66,0.15)",
                  border: "1px solid rgba(245,200,66,0.4)",
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontFamily: "Courier New",
                  fontSize: 12,
                  color: "#F5C842",
                }}
              >
                🔥 {myStreak} WIN STREAK
              </div>
            )}

            {myPlayer?.role === "player" && currentRound && !currentRound.bank_covered && (
              <button
                type="button"
                onClick={() => setShowCoverBank(true)}
                style={{
                  position: "absolute",
                  top: 20,
                  right: 20,
                  background: "rgba(16,185,129,0.15)",
                  border: "1px solid rgba(16,185,129,0.4)",
                  borderRadius: 8,
                  color: "#10B981",
                  padding: "8px 14px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "Courier New",
                  letterSpacing: 1,
                }}
              >
                💰 COVER THE BANK
              </button>
            )}
          </div>

          <div
            style={{
              width: 340,
              background: "rgba(8,5,20,0.95)",
              borderLeft: "1px solid rgba(124,58,237,0.2)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "12px 12px 0" }}>
              <VoiceChat
                roomId={roomId}
                userId={currentUser?.id || ""}
                userName={myPlayer?.name || "Player"}
                role={myPlayer?.role || "spectator"}
              />
            </div>

            <div
              style={{
                flex: "0 0 auto",
                maxHeight: "35%",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                borderBottom: "1px solid rgba(124,58,237,0.15)",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ color: "#F5C842", fontFamily: "Courier New", fontSize: 11, fontWeight: "bold", letterSpacing: 2 }}>
                  SIDE BETS
                </span>
                <button
                  type="button"
                  onClick={() => setShowSideBetModal(true)}
                  style={{
                    background: "linear-gradient(135deg, #F5C842, #D4A017)",
                    border: "none",
                    borderRadius: 6,
                    color: "#000",
                    padding: "4px 10px",
                    fontSize: 10,
                    cursor: "pointer",
                    fontFamily: "Courier New",
                    fontWeight: "bold",
                  }}
                >
                  + CREATE
                </button>
              </div>

              <div
                style={{
                  overflow: "auto",
                  padding: "0 12px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {sideBets.length === 0 ? (
                  <p style={{ color: "#444", fontSize: 11, fontFamily: "Courier New", textAlign: "center", padding: "12px 0" }}>
                    No open side bets
                  </p>
                ) : (
                  sideBets.map((bet) => (
                    <div
                      key={bet.id}
                      style={{
                        background: "rgba(124,58,237,0.08)",
                        border: "1px solid rgba(124,58,237,0.2)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: "#A855F7", fontFamily: "Courier New", marginBottom: 2 }}>{bet.creator_name}</div>
                        <div style={{ fontSize: 11, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {bet.bet_type.replace(/_/g, " ").toUpperCase()}
                        </div>
                        <div style={{ fontSize: 10, color: "#F5C842", fontFamily: "Courier New" }}>
                          {bet.amount_sc} SC · {bet.odds_multiplier}x
                        </div>
                      </div>
                      {bet.creator_id !== currentUser?.id && (
                        <button
                          type="button"
                          style={{
                            background: "linear-gradient(135deg, #10B981, #059669)",
                            border: "none",
                            borderRadius: 6,
                            color: "#fff",
                            padding: "6px 10px",
                            fontSize: 10,
                            cursor: "pointer",
                            fontFamily: "Courier New",
                            fontWeight: "bold",
                            flexShrink: 0,
                          }}
                        >
                          TAKE IT
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid rgba(124,58,237,0.1)" }}>
                <span style={{ color: "#F5C842", fontFamily: "Courier New", fontSize: 11, fontWeight: "bold", letterSpacing: 2 }}>
                  TABLE TALK
                </span>
              </div>

              <div style={{ flex: 1, overflow: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                {messages.map((msg) => (
                  <div key={msg.id}>
                    {msg.is_system ? (
                      <div
                        style={{
                          background: "rgba(245,200,66,0.1)",
                          border: "1px solid rgba(245,200,66,0.2)",
                          borderRadius: 99,
                          padding: "4px 12px",
                          fontSize: 11,
                          color: "#F5C842",
                          textAlign: "center",
                          fontFamily: "Courier New",
                        }}
                      >
                        {msg.message}
                      </div>
                    ) : (
                      <div>
                        <span style={{ fontSize: 10, color: "#7C3AED", fontFamily: "Courier New", marginRight: 6 }}>
                          {msg.user_name || "Player"}
                        </span>
                        <span style={{ fontSize: 12, color: "#ccc" }}>{msg.message}</span>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div style={{ padding: "8px 12px", borderTop: "1px solid rgba(124,58,237,0.15)", display: "flex", gap: 8 }}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void sendChat()}
                  placeholder="Say something..."
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(124,58,237,0.25)",
                    borderRadius: 8,
                    color: "#fff",
                    padding: "8px 12px",
                    fontSize: 12,
                    outline: "none",
                    fontFamily: "DM Sans",
                  }}
                />
                <button
                  type="button"
                  onClick={() => void sendChat()}
                  style={{
                    background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                    border: "none",
                    borderRadius: 8,
                    color: "#fff",
                    padding: "8px 14px",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: "bold",
                  }}
                >
                  →
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            background: "rgba(13,5,32,0.98)",
            borderTop: "1px solid rgba(124,58,237,0.25)",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: 16,
            backdropFilter: "blur(10px)",
          }}
        >
          <div style={{ minWidth: 100 }}>
            <div style={{ fontSize: 10, color: "#555", fontFamily: "Courier New", letterSpacing: 1 }}>YOUR SC</div>
            <div
              style={{
                fontSize: 18,
                fontWeight: "bold",
                fontFamily: "Courier New",
                color: balanceFlash === "up" ? "#10B981" : balanceFlash === "down" ? "#EF4444" : "#F5C842",
                transition: "color 0.3s ease",
              }}
            >
              {myBalance.toLocaleString()}
            </div>
          </div>

          {myPlayer && myPlayer.entry_sc > 0 && (
            <div style={{ minWidth: 80 }}>
              <div style={{ fontSize: 10, color: "#555", fontFamily: "Courier New", letterSpacing: 1 }}>ENTRY</div>
              <div style={{ fontSize: 16, color: "#10B981", fontFamily: "Courier New", fontWeight: "bold" }}>{myPlayer.entry_sc} SC</div>
            </div>
          )}

          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            {canStartRound ? (
              <button
                type="button"
                onClick={() => void handleStartRound()}
                style={{
                  background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                  border: "none",
                  borderRadius: 12,
                  color: "#fff",
                  padding: "14px 40px",
                  fontSize: 16,
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontFamily: "Courier New",
                  letterSpacing: 2,
                  boxShadow: "0 0 20px rgba(124,58,237,0.4)",
                }}
              >
                🎲 START ROUND
              </button>
            ) : isMyRoll ? (
              <button
                type="button"
                onClick={() => void handleRoll()}
                disabled={rolling}
                style={{
                  background: rolling ? "rgba(245,200,66,0.3)" : "linear-gradient(135deg, #F5C842, #D4A017)",
                  border: "none",
                  borderRadius: 12,
                  color: rolling ? "#888" : "#000",
                  padding: "14px 48px",
                  fontSize: 18,
                  fontWeight: "bold",
                  cursor: rolling ? "not-allowed" : "pointer",
                  fontFamily: "Courier New",
                  letterSpacing: 2,
                  animation: rolling ? "none" : "pulse 2s ease infinite",
                  boxShadow: rolling ? "none" : "0 0 30px rgba(245,200,66,0.5)",
                  transition: "all 0.3s",
                }}
              >
                {rolling
                  ? "🎲 ROLLING..."
                  : rollResult === "win"
                    ? "🔥 ROLL AGAIN"
                    : rollResult === "loss"
                      ? "💀 RUN IT BACK"
                      : "🎲 ROLL DICE"}
              </button>
            ) : (
              <div style={{ color: "#444", fontFamily: "Courier New", fontSize: 14, letterSpacing: 1 }}>
                {currentRound ? `${banker?.name || "BANKER"}'S TURN...` : "WAITING FOR ROUND..."}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, minWidth: 120, justifyContent: "flex-end" }}>
            {canLowerBank && (
              <button
                type="button"
                onClick={() => setShowLowerBank(true)}
                style={{
                  background: "rgba(16,185,129,0.15)",
                  border: "1px solid #10B981",
                  borderRadius: 8,
                  color: "#10B981",
                  padding: "8px 12px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "Courier New",
                }}
              >
                📉 LOWER BANK
                <div style={{ fontSize: 9 }}>{lowerBankTimer}s</div>
              </button>
            )}
            {canBecomeBanker && (
              <button
                type="button"
                onClick={() => setShowBecomeBanker(true)}
                style={{
                  background: "rgba(245,200,66,0.15)",
                  border: "1px solid #F5C842",
                  borderRadius: 8,
                  color: "#F5C842",
                  padding: "8px 12px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "Courier New",
                }}
              >
                👑 TAKE BANK
                <div style={{ fontSize: 9 }}>{becomeBankerTimer}s</div>
              </button>
            )}
          </div>
        </div>
      </div>

      {showDiceShop && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: "#0D0520",
              border: "1px solid rgba(124,58,237,0.4)",
              borderRadius: 16,
              padding: 28,
              width: 480,
              maxWidth: "95vw",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontFamily: "Cinzel Decorative", color: "#F5C842", fontSize: 18 }}>UPGRADE YOUR DICE</h2>
              <button type="button" onClick={() => setShowDiceShop(false)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 20 }}>
                ×
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {(Object.keys(DICE_COLORS) as DiceType[]).map((type) => {
                const colors = DICE_COLORS[type];
                return (
                  <button
                    type="button"
                    key={type}
                    onClick={() => {
                      setMyDiceType(type);
                      setShowDiceShop(false);
                    }}
                    style={{
                      background: myDiceType === type ? "rgba(245,200,66,0.15)" : "rgba(255,255,255,0.03)",
                      border: myDiceType === type ? "2px solid #F5C842" : "1px solid rgba(124,58,237,0.2)",
                      borderRadius: 10,
                      padding: "14px 10px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        background: colors.bg,
                        borderRadius: 8,
                        border: "2px solid rgba(255,255,255,0.2)",
                      }}
                    />
                    <span style={{ color: "#fff", fontSize: 11, fontFamily: "Courier New", textTransform: "uppercase" }}>{type}</span>
                    <span style={{ color: "#F5C842", fontSize: 10, fontFamily: "Courier New" }}>{type === "standard" ? "FREE" : "100 SC/die"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showCoverBank && room && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: "#0D0520",
              border: "1px solid rgba(16,185,129,0.4)",
              borderRadius: 16,
              padding: 28,
              width: 400,
              maxWidth: "95vw",
              textAlign: "center",
            }}
          >
            <h2 style={{ fontFamily: "Cinzel Decorative", color: "#10B981", fontSize: 20, marginBottom: 16 }}>COVER THE BANK</h2>
            <p style={{ color: "#ccc", fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
              Go head to head with the banker alone. Other players cannot enter this round but can still watch and side bet.
            </p>
            <div
              style={{
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.3)",
                borderRadius: 10,
                padding: "16px",
                marginBottom: 20,
              }}
            >
              <div style={{ fontSize: 32, color: "#F5C842", fontFamily: "Courier New", fontWeight: "bold" }}>{room.current_bank_sc} SC</div>
              <div style={{ fontSize: 12, color: "#888" }}>Required to cover bank</div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => setShowCoverBank(false)}
                style={{
                  flex: 1,
                  background: "none",
                  border: "1px solid #444",
                  borderRadius: 10,
                  color: "#888",
                  padding: "12px",
                  cursor: "pointer",
                  fontFamily: "Courier New",
                }}
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!supabase) return;
                  setShowCoverBank(false);
                  const token = (await supabase.auth.getSession()).data.session?.access_token;
                  await fetch("/api/celo/room/cover-bank", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ room_id: roomId, round_id: currentRound?.id }),
                  });
                  void fetchRoomData();
                }}
                disabled={myBalance < room.current_bank_sc}
                style={{
                  flex: 1,
                  background: myBalance >= room.current_bank_sc ? "linear-gradient(135deg, #10B981, #059669)" : "#333",
                  border: "none",
                  borderRadius: 10,
                  color: myBalance >= room.current_bank_sc ? "#fff" : "#666",
                  padding: "12px",
                  cursor: myBalance >= room.current_bank_sc ? "pointer" : "not-allowed",
                  fontFamily: "Courier New",
                  fontWeight: "bold",
                  fontSize: 14,
                }}
              >
                {myBalance >= room.current_bank_sc ? "💰 COVER IT" : "INSUFFICIENT SC"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
