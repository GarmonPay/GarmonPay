"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Cinzel_Decorative, DM_Sans } from "next/font/google";
import { createBrowserClient } from "@/lib/supabase";
import { CELO_USER_PROFILE_FIELDS } from "@/lib/celo-player-state";
import { resolveDisplayName } from "@/lib/display-name";
import {
  boardHasConnectFour,
  computeGarmonDropSettlement,
  detectBoardWinner,
  findBoardWinningLine,
  findLastPlacedCell,
  findWinningLine,
  createEmptyConnectFourBoard,
  GARMONDROP_MIN_ENTRY_GPC,
  isConnectFourBoardFull,
  parseConnectFourBoard,
  type ConnectFourBoard,
} from "@/lib/connect-four";
import { useCoins } from "@/hooks/useCoins";
import { scToUsdDisplay } from "@/lib/coins";
import { GPAY_COINS_TICKER } from "@/lib/gpay-coins-branding";
import { getReferralLink } from "@/lib/site-url";

const cinzel = Cinzel_Decorative({ subsets: ["latin"], weight: ["400", "700"] });
const dm = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700"] });

const API = "/api/garmondrop";
const DROP_ANIM_MS = 450;

type UserEmbed = {
  id?: string;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
};

type RoomRow = {
  id: string;
  creator_id: string;
  opponent_id: string | null;
  entry_amount_minor: number;
  status: string;
  board_state: unknown;
  current_turn: string | null;
  winner_id: string | null;
  pot_total_minor: number;
  platform_fee_minor: number;
  winner_payout_minor: number;
  move_seq: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  creator?: UserEmbed | null;
  opponent?: UserEmbed | null;
};

function labelFor(profile: UserEmbed | null | undefined, fallbackId: string): string {
  return resolveDisplayName(
    profile
      ? {
          full_name: profile.full_name ?? null,
          username: profile.username ?? null,
          email: profile.email ?? null,
        }
      : null,
    fallbackId
  );
}

function pieceForUser(room: RoomRow, uid: string): 1 | 2 | null {
  if (uid === room.creator_id) return 1;
  if (room.opponent_id && uid === room.opponent_id) return 2;
  return null;
}

function lowestEmptyRow(b: ConnectFourBoard, col: number): number | null {
  for (let r = 5; r >= 0; r--) {
    if (b[r][col] === 0) return r;
  }
  return null;
}

function ClassicDisc({
  piece,
  highlighted = false,
  ghost = false,
  className = "",
}: {
  piece: 1 | 2;
  highlighted?: boolean;
  ghost?: boolean;
  className?: string;
}) {
  const fill = piece === 1 ? "#f5c842" : "#dc2626";
  return (
    <div
      className={`rounded-full ${className}`}
      style={{
        background: fill,
        border: "1px solid rgba(255,255,255,0.25)",
        boxShadow: highlighted
          ? `0 0 0 2px rgba(255,255,255,0.35), 0 0 18px ${fill}, inset 0 -5px 10px rgba(0,0,0,0.25)`
          : "inset 0 -5px 10px rgba(0,0,0,0.25)",
        opacity: ghost ? 0.45 : 1,
      }}
    />
  );
}

/** Same burst pattern as C-Lo result banner — fires once per completion key. */
function GarmonDropWinConfetti({ fireKey }: { fireKey: string }) {
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    if (firedRef.current === fireKey) return;
    firedRef.current = fireKey;
    let cancelled = false;
    void import("canvas-confetti").then((mod) => {
      if (cancelled) return;
      const fire = mod.default;
      fire({
        particleCount: 88,
        spread: 58,
        origin: { y: 0.72 },
        ticks: 240,
        gravity: 1.05,
        scalar: 0.92,
        zIndex: 10001,
        colors: ["#f5c842", "#eab308", "#fde68a", "#c4b5fd"],
      });
      window.setTimeout(() => {
        if (cancelled) return;
        fire({
          particleCount: 42,
          spread: 68,
          origin: { y: 0.76, x: 0.58 },
          ticks: 190,
          scalar: 0.85,
          zIndex: 10001,
          colors: ["#fde68a", "#f5c842", "#a78bfa"],
        });
      }, 340);
    });
    return () => {
      cancelled = true;
    };
  }, [fireKey]);

  return null;
}

function usePayoutCountUp(target: number, durationMs = 800): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const goal = Math.max(0, Math.floor(target));
    if (goal === 0) {
      setValue(0);
      return;
    }
    let start: number | null = null;
    let raf = 0;
    const easeOut = (t: number) => 1 - (1 - t) ** 3;
    const tick = (ts: number) => {
      if (start == null) start = ts;
      const progress = Math.min(1, (ts - start) / durationMs);
      setValue(Math.round(goal * easeOut(progress)));
      if (progress < 1) raf = requestAnimationFrame(tick);
      else setValue(goal);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

function GarmonDropWinModalBody({
  payoutGpc,
  endedByForfeit,
  settlementPending,
  winnerName,
  referralLink,
  cinzelClassName,
}: {
  payoutGpc: number;
  endedByForfeit: boolean;
  settlementPending: boolean;
  winnerName: string | null;
  referralLink: string;
  cinzelClassName: string;
}) {
  const animatedPayout = usePayoutCountUp(settlementPending ? 0 : payoutGpc);
  const [shareCopied, setShareCopied] = useState(false);
  const shareCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const payoutLine =
    settlementPending && payoutGpc > 0
      ? `${payoutGpc.toLocaleString()} ${GPAY_COINS_TICKER} (${scToUsdDisplay(payoutGpc)})`
      : `${animatedPayout.toLocaleString()} ${GPAY_COINS_TICKER} (${scToUsdDisplay(animatedPayout)})`;

  useEffect(() => {
    return () => {
      if (shareCopiedTimerRef.current) clearTimeout(shareCopiedTimerRef.current);
    };
  }, []);

  const handleShareWin = useCallback(async () => {
    const shareText = `I just won ${payoutGpc.toLocaleString()} ${GPAY_COINS_TICKER} on GarmonPay 🎮 Think you can beat me? Who's next?`;
    const clipboardText = referralLink ? `${shareText}\n${referralLink}` : shareText;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          text: shareText,
          ...(referralLink ? { url: referralLink } : {}),
        });
      } catch {
        /* user dismissed or share failed */
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(clipboardText);
      setShareCopied(true);
      if (shareCopiedTimerRef.current) clearTimeout(shareCopiedTimerRef.current);
      shareCopiedTimerRef.current = setTimeout(() => {
        setShareCopied(false);
        shareCopiedTimerRef.current = null;
      }, 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [payoutGpc, referralLink]);

  const actionBtnClass =
    "inline-block rounded-lg border border-[#7c3aed]/70 bg-[#7c3aed]/15 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-[#7c3aed]/28";

  return (
    <>
      <p
        className={`gf-victory-heading text-2xl font-bold sm:text-3xl ${cinzelClassName}`}
        style={{ color: "#f5c842" }}
      >
        Victory!
      </p>
      <p className="mt-2 text-sm text-white/80">
        {endedByForfeit ? (
          <>Opponent forfeited. You take {payoutLine}.</>
        ) : settlementPending ? (
          <>You connected four! Payout {payoutLine} is processing — refresh shortly.</>
        ) : (
          <>You connected four and take {payoutLine}.</>
        )}
      </p>
      {winnerName && (
        <p className="mt-1 text-xs uppercase tracking-wider text-[#f5c842]/70">{winnerName}</p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => void handleShareWin()} className={actionBtnClass}>
          {shareCopied ? "Copied!" : "Share"}
        </button>
        <Link href="/dashboard/games/garmondrop" className={actionBtnClass}>
          Back to lobby
        </Link>
      </div>
    </>
  );
}

function GarmonDropPlainResultBody({
  gameResult,
  cinzelClassName,
}: {
  gameResult: { kind: "loss" | "draw"; title: string; subtitle: string };
  cinzelClassName: string;
}) {
  return (
    <>
      <p
        className={`text-2xl font-bold sm:text-3xl ${cinzelClassName}`}
        style={{ color: gameResult.kind === "loss" ? "#fca5a5" : "#c4b5fd" }}
      >
        {gameResult.title}
      </p>
      <p className="mt-2 text-sm text-white/80">{gameResult.subtitle}</p>
      <Link
        href="/dashboard/games/garmondrop"
        className="mt-4 inline-block rounded-lg border border-[#7c3aed]/70 bg-[#7c3aed]/15 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-[#7c3aed]/28"
      >
        Back to lobby
      </Link>
    </>
  );
}

export default function GarmonDropRoomPage() {
  const params = useParams();
  const roomId = typeof params?.roomId === "string" ? params.roomId : "";
  const router = useRouter();
  const supabase = useMemo(() => createBrowserClient(), []);
  const { sweepsCoins, formatGPC, refresh } = useCoins();

  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [opponentAway, setOpponentAway] = useState(false);
  const oppAwayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opponentWasPresentRef = useRef(false);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [pulseCol, setPulseCol] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<Set<string> | null>(null);
  const [dropFlash, setDropFlash] = useState<{ r: number; c: number } | null>(null);
  const prevBoardRef = useRef<ConnectFourBoard | null>(null);
  const completionRefreshKeyRef = useRef<string | null>(null);

  const [roomUrl, setRoomUrl] = useState("");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [copyLinkDone, setCopyLinkDone] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const copyLinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [repairTurnErr, setRepairTurnErr] = useState<string | null>(null);
  const cancelledRedirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authHeaders = useCallback(
    (json = true) => {
      const h: Record<string, string> = {};
      if (json) h["Content-Type"] = "application/json";
      if (token) h.Authorization = `Bearer ${token}`;
      return h;
    },
    [token]
  );

  const fetchRoom = useCallback(async () => {
    if (!supabase || !roomId) return;
    const { data, error } = await supabase
      .from("garmondrop_rooms")
      .select(
        `*, creator:creator_id(${CELO_USER_PROFILE_FIELDS}), opponent:opponent_id(${CELO_USER_PROFILE_FIELDS})`
      )
      .eq("id", roomId)
      .maybeSingle();
    if (error) {
      setLoadError(error.message);
      setRoom(null);
      return;
    }
    if (!data) {
      setLoadError("Room not found");
      setRoom(null);
      return;
    }
    setLoadError(null);
    setRoom(data as RoomRow);
  }, [supabase, roomId]);

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
        setUserId(null);
      } else {
        setToken(session.access_token);
        setUserId(session.user.id);
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
    if (loadingSession) return;
    if (!token || !userId) {
      router.replace(`/login?next=${encodeURIComponent(`/dashboard/games/garmondrop/${roomId}`)}`);
    }
  }, [loadingSession, token, userId, router, roomId]);

  useEffect(() => {
    if (!userId || !roomId || !supabase) return;
    void fetchRoom();
    const ch = supabase
      .channel(`garmondrop-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "garmondrop_rooms",
          filter: `id=eq.${roomId}`,
        },
        () => {
          void fetchRoom();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, roomId, supabase, fetchRoom]);

  useEffect(() => {
    setRepairTurnErr(null);
  }, [roomId]);

  /** Active game with two players but null current_turn — retry repair until fixed (single-shot ref previously blocked all retries on failure). */
  useEffect(() => {
    if (!token || !roomId || !userId || !room) return;
    if (room.status !== "active" || !room.opponent_id || room.current_turn) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 45;
    let intervalId: number | null = null;

    const run = async () => {
      if (cancelled) return;
      if (attempts >= maxAttempts) {
        if (intervalId != null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
        setRepairTurnErr("Could not restore the first turn. Try refreshing the page.");
        return;
      }
      attempts += 1;
      try {
        const res = await fetch(`${API}/repair-turn`, {
          method: "POST",
          credentials: "include",
          headers: authHeaders(),
          body: JSON.stringify({ roomId }),
        });
        if (res.ok) {
          setRepairTurnErr(null);
          void fetchRoom();
        }
      } catch {
        /* network — interval will retry */
      }
    };

    void run();
    intervalId = window.setInterval(() => void run(), 3000);
    return () => {
      cancelled = true;
      if (intervalId != null) window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- full `room` would restart polling on every board sync
  }, [token, roomId, userId, room?.status, room?.opponent_id, room?.current_turn, fetchRoom, authHeaders]);

  useEffect(() => {
    opponentWasPresentRef.current = false;
  }, [room?.opponent_id]);

  useEffect(() => {
    setHoverCol(null);
  }, [room?.move_seq, room?.current_turn]);

  useEffect(() => {
    if (!supabase || !roomId || !userId) return;
    const opponentId =
      room?.creator_id === userId ? room.opponent_id : room?.creator_id === userId ? room.creator_id : null;

    if (!room || room.status !== "active" || !opponentId) {
      if (oppAwayTimerRef.current) clearTimeout(oppAwayTimerRef.current);
      setOpponentAway(false);
      return;
    }

    const ch = supabase.channel(`garmondrop-presence:${roomId}`, {
      config: { presence: { key: userId } },
    });

    const clearAwayTimer = () => {
      if (oppAwayTimerRef.current) {
        clearTimeout(oppAwayTimerRef.current);
        oppAwayTimerRef.current = null;
      }
    };

    const AWAY_AFTER_MS = 30_000;

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const keys = Object.keys(state);
      const present = keys.includes(opponentId);
      clearAwayTimer();
      if (present) {
        opponentWasPresentRef.current = true;
        setOpponentAway(false);
        return;
      }
      if (!opponentWasPresentRef.current) {
        return;
      }
      oppAwayTimerRef.current = setTimeout(() => setOpponentAway(true), AWAY_AFTER_MS);
    });

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ user_id: userId, online_at: Date.now() });
      }
    });

    return () => {
      clearAwayTimer();
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid resubscribing on every board_state tick
  }, [supabase, roomId, userId, room?.status, room?.creator_id, room?.opponent_id]);

  useEffect(() => {
    if (!room) return;
    const board = parseConnectFourBoard(room.board_state) ?? createEmptyConnectFourBoard();
    const prev = prevBoardRef.current;
    if (prev && room.status === "active") {
      const last = findLastPlacedCell(prev, board);
      if (last && last.v !== 0) {
        setDropFlash({ r: last.r, c: last.c });
        window.setTimeout(() => setDropFlash(null), DROP_ANIM_MS);
      }
    }
    prevBoardRef.current = board;

    const boardWinner = detectBoardWinner(board);
    const highlightPiece =
      room.winner_id != null
        ? pieceForUser(room, room.winner_id)
        : boardWinner;

    if (room.status === "completed" || boardWinner !== null) {
      if (highlightPiece) {
        const line = findBoardWinningLine(board, highlightPiece);
        if (line) {
          setHighlight(new Set(line.map(([rr, cc]) => `${rr},${cc}`)));
          return;
        }
        for (let r = 0; r < 6; r++) {
          for (let c = 0; c < 7; c++) {
            if (board[r][c] === highlightPiece) {
              const fallback = findWinningLine(board, r, c, highlightPiece);
              if (fallback) {
                setHighlight(new Set(fallback.map(([rr, cc]) => `${rr},${cc}`)));
                return;
              }
            }
          }
        }
      }
      setHighlight(null);
    } else {
      setHighlight(null);
    }
  }, [room]);

  useEffect(() => {
    if (!room || !userId) return;
    if (room.status !== "completed" && room.status !== "active") return;

    const boardNow = parseConnectFourBoard(room.board_state) ?? createEmptyConnectFourBoard();
    const visualWinner = detectBoardWinner(boardNow);
    const visualDraw = isConnectFourBoardFull(boardNow) && visualWinner === null;
    if (room.status === "active" && visualWinner === null && !visualDraw) return;

    const refreshKey = `${room.id}:${room.completed_at ?? room.updated_at ?? "done"}:${visualWinner ?? "draw"}`;
    if (completionRefreshKeyRef.current === refreshKey) return;
    completionRefreshKeyRef.current = refreshKey;
    void refresh();
  }, [room, userId, refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setRoomUrl(window.location.href);
    setCanNativeShare(typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!supabase || !userId) return;
    void supabase
      .from("users")
      .select("referral_code")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        const code = (data as { referral_code?: string | null } | null)?.referral_code?.trim() ?? "";
        setReferralCode(code || null);
      });
  }, [supabase, userId]);

  useEffect(() => {
    return () => {
      if (copyLinkTimerRef.current) clearTimeout(copyLinkTimerRef.current);
      if (cancelledRedirectTimerRef.current) clearTimeout(cancelledRedirectTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (room?.status !== "cancelled") return;
    if (cancelledRedirectTimerRef.current) clearTimeout(cancelledRedirectTimerRef.current);
    cancelledRedirectTimerRef.current = setTimeout(() => {
      router.replace("/dashboard/games/garmondrop");
    }, 1600);
  }, [room?.status, router]);

  const handleCopyRoomLink = useCallback(async () => {
    const url =
      typeof window !== "undefined" && window.location.href ? window.location.href : roomUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyLinkDone(true);
      if (copyLinkTimerRef.current) clearTimeout(copyLinkTimerRef.current);
      copyLinkTimerRef.current = setTimeout(() => {
        setCopyLinkDone(false);
        copyLinkTimerRef.current = null;
      }, 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [roomUrl]);

  const handleNativeShareRoom = useCallback(async () => {
    const url =
      typeof window !== "undefined" && window.location.href ? window.location.href : roomUrl;
    if (!url || typeof navigator.share !== "function") return;
    try {
      await navigator.share({
        title: "GarmonDrop — join my game",
        text: "Join my GarmonDrop game on GarmonPay",
        url,
      });
    } catch {
      /* user dismissed or share failed */
    }
  }, [roomUrl]);

  async function handleMove(col: number) {
    if (!token || !userId || !room || busy) return;
    if (room.status !== "active" || room.current_turn !== userId) return;
    const b = parseConnectFourBoard(room.board_state) ?? createEmptyConnectFourBoard();
    if (detectBoardWinner(b) !== null) return;
    if (b[0][col] !== 0) return;
    setPulseCol(col);
    window.setTimeout(() => setPulseCol(null), 280);
    setApiErr(null);
    setBusy(true);
    try {
      const reference = `garmondrop_move_${roomId}_${room.move_seq}_${crypto.randomUUID()}`;
      const res = await fetch(`${API}/move`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({
          roomId,
          column: col,
          expectedSeq: room.move_seq,
          reference,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        message?: string;
        outcome?: string;
        winnerId?: string | null;
        room?: RoomRow | null;
      };
      if (!res.ok) {
        setApiErr(j.message ?? "Move failed");
        return;
      }
      if (j.room) {
        setRoom(j.room);
      } else {
        void fetchRoom();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleForfeit() {
    if (!token || !userId || !room || busy) return;
    if (room.status !== "active") return;
    if (!window.confirm("Forfeit? Your opponent wins the pot (minus platform fee).")) return;
    setApiErr(null);
    setBusy(true);
    try {
      const reference = `garmondrop_forfeit_${roomId}_${crypto.randomUUID()}`;
      const res = await fetch(`${API}/forfeit`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ roomId, reference }),
      });
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setApiErr(j.message ?? "Forfeit failed");
        return;
      }
      void fetchRoom();
    } finally {
      setBusy(false);
    }
  }

  if (loadingSession) {
    return (
      <div className={`flex min-h-[200px] items-center justify-center text-white/60 ${dm.className}`} style={{ background: "#0e0118" }}>
        Loading…
      </div>
    );
  }

  if (!token || !userId) {
    return (
      <div className={`flex min-h-[200px] items-center justify-center text-white/50 ${dm.className}`} style={{ background: "#0e0118" }}>
        Redirecting…
      </div>
    );
  }

  if (loadError || !room) {
    return (
      <div className={`mx-auto max-w-md px-4 py-10 text-center ${dm.className}`} style={{ background: "#0e0118" }}>
        <p className="text-amber-200/90">{loadError ?? "Loading room…"}</p>
        <Link href="/dashboard/games/garmondrop" className="mt-4 inline-block text-[#7c3aed] underline">
          Back to lobby
        </Link>
      </div>
    );
  }

  if (room.status === "cancelled") {
    return (
      <div className={`mx-auto max-w-md px-4 py-10 text-center ${dm.className}`} style={{ background: "#0e0118" }}>
        <p className={`text-2xl text-[#f5c842] ${cinzel.className}`}>Room cancelled</p>
        <p className="mt-2 text-sm text-white/70">This room was cancelled and refunded.</p>
        <p className="mt-1 text-xs text-white/50">Returning to lobby…</p>
        <Link href="/dashboard/games/garmondrop" className="mt-4 inline-block text-[#7c3aed] underline">
          Back to lobby now
        </Link>
      </div>
    );
  }

  const myPiece = pieceForUser(room, userId);
  const isParticipant = myPiece !== null;
  if (!isParticipant) {
    return (
      <div className={`mx-auto max-w-md px-4 py-10 text-center ${dm.className}`} style={{ background: "#0e0118" }}>
        <p className="text-white/80">You are not a player in this room.</p>
        <Link href="/dashboard/games/garmondrop" className="mt-4 inline-block text-[#7c3aed] underline">
          Back to lobby
        </Link>
      </div>
    );
  }

  const board = parseConnectFourBoard(room.board_state) ?? createEmptyConnectFourBoard();
  const entry = Math.floor(room.entry_amount_minor);
  const { winnerPayoutGpc, totalPotGpc, platformFeeGpc } = computeGarmonDropSettlement(
    Math.max(GARMONDROP_MIN_ENTRY_GPC, entry)
  );

  const creatorName = labelFor(room.creator, room.creator_id);
  const opponentName = room.opponent_id ? labelFor(room.opponent, room.opponent_id) : "Waiting…";

  const boardWinnerPiece = detectBoardWinner(board);
  const boardIsDraw = isConnectFourBoardFull(board) && boardWinnerPiece === null;
  const isGameEnded =
    room.status === "completed" || boardWinnerPiece !== null || boardIsDraw;

  const resolvedWinnerId =
    room.winner_id ??
    (boardWinnerPiece === 1
      ? room.creator_id
      : boardWinnerPiece === 2
        ? room.opponent_id
        : null);

  const resolvedWinnerName =
    resolvedWinnerId === room.creator_id
      ? creatorName
      : resolvedWinnerId === room.opponent_id
        ? opponentName
        : null;

  const winnerName =
    room.winner_id === room.creator_id
      ? creatorName
      : room.winner_id === room.opponent_id
        ? opponentName
        : resolvedWinnerName;

  const boardParsed = parseConnectFourBoard(room.board_state);
  const winnerPiece: 1 | 2 | null =
    room.winner_id === room.creator_id
      ? 1
      : room.opponent_id === room.winner_id
        ? 2
        : boardWinnerPiece;
  const endedByForfeit =
    isGameEnded &&
    boardParsed !== null &&
    winnerPiece !== null &&
    !boardHasConnectFour(boardParsed, winnerPiece);

  const settlementPending =
    room.status === "active" && (boardWinnerPiece !== null || boardIsDraw);

  const gameResult = isGameEnded
    ? boardIsDraw && !resolvedWinnerId
      ? {
          kind: "draw" as const,
          title: "Draw",
          subtitle: settlementPending
            ? "Board full. Settlement is finishing — refresh in a moment."
            : `Board full. Each player refunded ~${Math.floor((totalPotGpc - platformFeeGpc) / 2).toLocaleString()} GPC after the 10% pot fee.`,
        }
      : resolvedWinnerId === userId
        ? {
            kind: "win" as const,
            title: "You won!",
            payoutGpc: winnerPayoutGpc,
            endedByForfeit,
            settlementPending,
          }
        : resolvedWinnerId
          ? {
              kind: "loss" as const,
              title: `${resolvedWinnerName ?? "Opponent"} wins`,
              subtitle: endedByForfeit
                ? "You forfeited the match."
                : `${resolvedWinnerName ?? "Your opponent"} connected four.`,
            }
          : null
    : null;

  const turnLabel =
    room.status === "waiting"
      ? "Waiting for opponent"
      : room.status === "active"
        ? gameResult
          ? gameResult.title
          : !room.current_turn
            ? "Starting game…"
            : room.current_turn === userId
              ? "Your turn"
              : `Waiting for ${room.current_turn === room.creator_id ? creatorName : opponentName}`
        : gameResult?.title ?? "Game over";

  const colFull = (c: number) => board[0][c] !== 0;

  const oppDisconnected = room.status === "active" && room.opponent_id && opponentAway;

  const celebrationStyle = gameResult
    ? {
        borderColor:
          gameResult.kind === "win"
            ? "rgba(245,200,66,0.55)"
            : gameResult.kind === "loss"
              ? "rgba(239,68,68,0.45)"
              : "rgba(124,58,237,0.45)",
        background:
          gameResult.kind === "win"
            ? "linear-gradient(145deg, rgba(245,200,66,0.14), rgba(14,1,24,0.92))"
            : gameResult.kind === "loss"
              ? "linear-gradient(145deg, rgba(239,68,68,0.1), rgba(14,1,24,0.92))"
              : "linear-gradient(145deg, rgba(124,58,237,0.12), rgba(14,1,24,0.92))",
      }
    : undefined;

  const referralLink = referralCode ? getReferralLink(referralCode) : "";

  const celebrationBody =
    gameResult?.kind === "win" ? (
      <GarmonDropWinModalBody
        payoutGpc={gameResult.payoutGpc}
        endedByForfeit={gameResult.endedByForfeit}
        settlementPending={gameResult.settlementPending}
        winnerName={resolvedWinnerName ?? winnerName}
        referralLink={referralLink}
        cinzelClassName={cinzel.className}
      />
    ) : gameResult?.kind === "loss" || gameResult?.kind === "draw" ? (
      <GarmonDropPlainResultBody gameResult={gameResult} cinzelClassName={cinzel.className} />
    ) : null;

  return (
    <div
      className={`min-h-screen w-full pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] text-white tablet:pb-8 ${dm.className}`}
      style={{ background: "#0e0118" }}
    >
      {gameResult && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 px-4">
          {gameResult.kind === "win" && (
            <GarmonDropWinConfetti
              fireKey={`${room.id}:${room.completed_at ?? room.updated_at ?? "win"}`}
            />
          )}
          <div
            className="w-full max-w-md rounded-2xl border px-5 py-6 text-center shadow-2xl"
            style={celebrationStyle}
          >
            {celebrationBody}
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-2xl px-3 pt-5 sm:px-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link href="/dashboard/games/garmondrop" className="text-sm text-[#7c3aed] underline">
            ← Lobby
          </Link>
          <p className="font-mono text-[10px] text-[#A855F7]" style={{ letterSpacing: "0.12em" }}>
            GARMONDROP
          </p>
        </div>

        <div className="rounded-2xl border border-[#7c3aed]/35 bg-black/25 p-4">
          <div className="flex flex-wrap gap-5 text-sm">
            <div className="flex min-w-0 items-start gap-2.5">
              <div className="mt-0.5 h-8 w-8 flex-shrink-0 sm:h-9 sm:w-9">
                <ClassicDisc piece={1} className="h-full w-full" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Host</p>
                <p className="font-semibold text-[#f5c842]">{creatorName}</p>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-2.5">
              <div className="mt-0.5 h-8 w-8 flex-shrink-0 sm:h-9 sm:w-9">
                <ClassicDisc piece={2} className="h-full w-full" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Guest</p>
                <p className="font-semibold text-[#c4b5fd]">{opponentName}</p>
              </div>
            </div>
          </div>
          {gameResult ? (
            <p className="mt-3 text-sm text-white/70">Game over</p>
          ) : (
            <p className="mt-3 text-sm text-white/70">{turnLabel}</p>
          )}
          <p className="mt-3 font-mono text-xs text-white/55 sm:mt-2">
            Entry {entry.toLocaleString()} GPC each · Pot {totalPotGpc.toLocaleString()} GPC · Fee{" "}
            {platformFeeGpc.toLocaleString()} GPC (10%) · Winner takes {winnerPayoutGpc.toLocaleString()} GPC
          </p>
          <p className="mt-1 text-xs text-white/45">Your balance: {formatGPC(sweepsCoins)}</p>

          {room.creator_id === userId &&
            (room.status === "waiting" || room.status === "active") && (
              <div className="mt-4 space-y-2 border-t border-[#7c3aed]/25 pt-4">
                <p className="text-xs text-white/55">
                  {room.status === "waiting"
                    ? "Share this link so your opponent can join — they need the same stake in the lobby or this URL."
                    : "Invite link — send this URL to your opponent if they need to reopen the room."}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 rounded-lg border border-[#7c3aed]/45 bg-black/35 px-3 py-2">
                    <p
                      className="select-text truncate font-mono text-[11px] leading-snug text-white/95 sm:text-xs"
                      title={roomUrl || undefined}
                    >
                      {roomUrl || "…"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyRoomLink()}
                      className="rounded-lg border border-[#f5c842]/55 bg-[#f5c842]/12 px-3 py-1.5 text-xs font-medium text-[#f5c842] transition hover:bg-[#f5c842]/22 sm:px-4 sm:py-2 sm:text-sm"
                    >
                      {copyLinkDone ? "Copied!" : "Copy invite link"}
                    </button>
                    {canNativeShare && (
                      <button
                        type="button"
                        onClick={() => void handleNativeShareRoom()}
                        className="rounded-lg border border-[#7c3aed]/70 bg-[#7c3aed]/15 px-3 py-1.5 text-xs font-medium text-white/90 transition hover:bg-[#7c3aed]/28 sm:px-4 sm:py-2 sm:text-sm"
                      >
                        Share
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
        </div>

        {oppDisconnected && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            Opponent may be disconnected — they might miss the realtime update until they return.
          </div>
        )}

        {repairTurnErr && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {repairTurnErr}
          </div>
        )}

        {apiErr && (
          <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{apiErr}</div>
        )}

        {room.status === "active" && !isGameEnded && (
          <p className="mt-6 text-center text-xs text-white/50">
            Tap a column to drop — you are{" "}
            <span className="font-semibold text-[#f5c842]">{myPiece === 1 ? "Heads" : "Tails"}</span>
          </p>
        )}

        <div className={`${room.status === "active" ? "mt-3" : "mt-6"} flex justify-center`}>
          <div
            className="inline-flex gap-1 rounded-2xl p-2 sm:gap-1.5 sm:p-3"
            style={{
              background: "linear-gradient(180deg, rgba(124,58,237,0.25), rgba(14,1,24,0.9))",
              border: "1px solid rgba(245,200,66,0.15)",
            }}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((c) => {
              const canClickCol =
                room.status === "active" &&
                !isGameEnded &&
                room.current_turn === userId &&
                !busy &&
                !colFull(c);
              const lr = lowestEmptyRow(board, c);
              const previewPiece: 1 | 2 = myPiece === 2 ? 2 : 1;
              const columnLit = (canClickCol && hoverCol === c) || pulseCol === c;
              return (
                <div
                  key={c}
                  role="button"
                  tabIndex={canClickCol ? 0 : -1}
                  aria-label={`Column ${c + 1}`}
                  aria-disabled={!canClickCol}
                  onClick={() => {
                    if (canClickCol) void handleMove(c);
                  }}
                  onMouseEnter={() => {
                    if (canClickCol) setHoverCol(c);
                  }}
                  onMouseLeave={() => setHoverCol(null)}
                  onKeyDown={(e) => {
                    if (!canClickCol) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void handleMove(c);
                    }
                  }}
                  className={`flex flex-col gap-1 rounded-lg p-0.5 outline-none transition ${
                    canClickCol
                      ? "cursor-pointer focus-visible:ring-2 focus-visible:ring-[#f5c842]/50"
                      : "cursor-not-allowed"
                  } ${columnLit ? "ring-1 ring-[#f5c842]/40 sm:bg-[#f5c842]/8" : ""}`}
                >
                  {[0, 1, 2, 3, 4, 5].map((r) => {
                    const v = board[r][c];
                    const isHi = highlight?.has(`${r},${c}`);
                    const isDrop = dropFlash?.r === r && dropFlash?.c === c;
                    const piece = v === 1 ? 1 : v === 2 ? 2 : null;
                    const showGhost =
                      canClickCol && hoverCol === c && lr !== null && lr === r && v === 0;
                    return (
                      <div
                        key={`${r}-${c}`}
                        className="pointer-events-none flex h-9 w-9 items-center justify-center rounded-lg sm:h-11 sm:w-11"
                        style={{
                          background: "rgba(0,0,0,0.35)",
                          boxShadow: "inset 0 2px 8px rgba(0,0,0,0.45)",
                        }}
                      >
                        {piece ? (
                          <div
                            className={`flex aspect-square h-[76%] w-[76%] max-h-[34px] max-w-[34px] items-center justify-center sm:h-[78%] sm:w-[78%] sm:max-h-[42px] sm:max-w-[42px] ${isDrop ? "[animation:gf-drop_0.45s_ease-in]" : ""}`}
                          >
                            <ClassicDisc piece={piece} highlighted={isHi} className="h-full w-full" />
                          </div>
                        ) : showGhost ? (
                          <div className="flex aspect-square h-[76%] w-[76%] max-h-[34px] max-w-[34px] items-center justify-center opacity-45 sm:h-[78%] sm:w-[78%] sm:max-h-[42px] sm:max-w-[42px]">
                            <ClassicDisc piece={previewPiece} ghost className="h-full w-full" />
                          </div>
                        ) : (
                          <div
                            className="h-[76%] w-[76%] max-h-[34px] max-w-[34px] rounded-full sm:h-[78%] sm:w-[78%] sm:max-h-[42px] sm:max-w-[42px]"
                            style={{
                              background: "rgba(255,255,255,0.06)",
                              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
                              border: "1px solid rgba(255,255,255,0.08)",
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <style>{`
          @keyframes gf-drop {
            0% { transform: translateY(-220%); opacity: 0.85; }
            70% { transform: translateY(4%); }
            100% { transform: translateY(0); opacity: 1; }
          }
          @keyframes gf-victory-glow {
            0%, 100% { filter: drop-shadow(0 0 6px rgba(245, 200, 66, 0.35)); }
            50% { filter: drop-shadow(0 0 16px rgba(245, 200, 66, 0.55)); }
          }
          .gf-victory-heading {
            animation:
              celo-banner-winner-pop 0.45s ease-out both,
              gf-victory-glow 2.2s ease-in-out 0.45s 2;
          }
        `}</style>

        {room.status === "active" && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleForfeit()}
              className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-200/90"
            >
              Forfeit
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
