"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Cinzel_Decorative } from "next/font/google";
import DiceFace, { type DiceFaceType } from "@/components/celo/DiceFace";
import RollNameDisplay, { type RollResultKind } from "@/components/celo/RollNameDisplay";
import type { CeloPlayer, CeloRoom, CeloRound } from "@/types/celo";
import { DICE_TYPES } from "@/lib/celo-engine";

const cinzel = Cinzel_Decorative({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });

function gpcToUsd(gpc: number): string {
  return (Math.max(0, gpc) / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function mapDice(t: string | undefined): DiceFaceType {
  const x = String(t ?? "standard").toLowerCase();
  if (x in DICE_TYPES) return x as DiceFaceType;
  return "standard";
}

function clampDie(n: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (!Number.isFinite(n)) return 1;
  const x = Math.min(6, Math.max(1, Math.round(n)));
  return x as 1 | 2 | 3 | 4 | 5 | 6;
}

const NAV_STACK = "calc(5rem + env(safe-area-inset-bottom, 0px))";
const TAB_H = 44;
const PANEL_MAX = 240;
const ACTION_H = 64;

export type CeloTableProps = {
  room: CeloRoom;
  currentRound: CeloRound | null;
  players: CeloPlayer[];
  currentUserId: string;
  onRoll: () => void | Promise<void>;
  onStartRound: () => void;
  rolling: boolean;
  rollSubmitting?: boolean;
  dice: [number, number, number] | null;
  rollName: string | null;
  rollResult: string | null;
  myBalance: number;
  myEntry: number;
  prizePoolSc: number;
  canLowerBank: boolean;
  lowerBankSecondsLeft: number;
  onLowerBank: (amountGpc: number) => void;
  onDismissLowerBank?: () => void;
  showCoverBank: boolean;
  coverBankAmountGpc: number;
  onCoverBank: () => void;
  onOpenDiceShop: () => void;
  diceShopOpen: boolean;
  onCloseDiceShop: () => void;
  onPurchaseDice: (diceType: DiceFaceType, quantity: number) => void;
  myDiceType: DiceFaceType;
  isBanker: boolean;
  compact?: boolean;
  roomTitle?: string;
  roundNumber?: number;
  onBackToLobby?: () => void;
  connectionStatus?: "live" | "connecting" | "offline";
  spectatorCount?: number;
  onJoinRound?: (entryGpc: number) => void;
  joinRoundBusy?: boolean;
  joinRoundError?: string | null;
  mobileTab?: "bets" | "chat" | "voice";
  onMobileTabChange?: (t: "bets" | "chat" | "voice") => void;
  mobileTabPanels?: {
    bets: ReactNode;
    chat: ReactNode;
    voice: ReactNode;
  };
};

export default function CeloTable({
  room,
  currentRound,
  players,
  currentUserId,
  onRoll,
  onStartRound,
  rolling,
  rollSubmitting = false,
  dice,
  rollName,
  rollResult,
  myBalance,
  myEntry,
  prizePoolSc,
  canLowerBank,
  lowerBankSecondsLeft,
  onLowerBank,
  onDismissLowerBank,
  showCoverBank,
  coverBankAmountGpc,
  onCoverBank,
  onOpenDiceShop,
  diceShopOpen,
  onCloseDiceShop,
  onPurchaseDice,
  myDiceType,
  isBanker,
  compact = false,
  roomTitle,
  roundNumber = 0,
  onBackToLobby,
  connectionStatus = "live",
  spectatorCount = 0,
  onJoinRound,
  joinRoundBusy = false,
  joinRoundError = null,
  mobileTab = "bets",
  onMobileTabChange,
  mobileTabPanels,
}: CeloTableProps) {
  const [shopQty, setShopQty] = useState(1);
  const [shopType, setShopType] = useState<DiceFaceType>("street");
  const [lowerAmt, setLowerAmt] = useState(room.minimum_entry_sc);
  const [coverConfirmOpen, setCoverConfirmOpen] = useState(false);
  const [joinSel, setJoinSel] = useState<number | "min" | "2x" | "5x" | "max">("min");
  const [lowerSheetOpen, setLowerSheetOpen] = useState(false);

  const d = dice ?? [1, 1, 1];
  const bankerPlayer = players.find((p) => p.role === "banker");
  const tablePlayers = players.filter((p) => p.role === "player").sort((a, b) => a.seat_number - b.seat_number);
  const myPlayer = players.find((p) => p.user_id === currentUserId);
  const spectator = myPlayer?.role === "spectator";

  const minEntry = room.minimum_entry_sc;
  const maxEntry = room.max_bet_cents > 0 ? room.max_bet_cents : Math.max(minEntry * 10, minEntry);

  const resolvedJoinAmount = useMemo(() => {
    if (joinSel === "min") return minEntry;
    if (joinSel === "2x") return Math.min(maxEntry, minEntry * 2);
    if (joinSel === "5x") return Math.min(maxEntry, minEntry * 5);
    if (joinSel === "max") return Math.min(maxEntry, myBalance);
    return joinSel;
  }, [joinSel, minEntry, maxEntry, myBalance]);

  const turnUserId = useMemo(() => {
    if (!currentRound) return null;
    if (currentRound.status === "banker_rolling") return room.banker_id;
    if (currentRound.status === "player_rolling") {
      const seat = Number(currentRound.current_player_seat ?? 0);
      const pl = tablePlayers.find((p) => Number(p.seat_number) === seat);
      return pl?.user_id ?? tablePlayers[0]?.user_id ?? null;
    }
    return null;
  }, [currentRound, room.banker_id, tablePlayers]);

  const myTurn = Boolean(turnUserId && turnUserId === currentUserId && !spectator);
  const canStart = isBanker && !currentRound && tablePlayers.some((p) => p.entry_sc > 0);
  const rollBusy = rolling || rollSubmitting;

  const rollResultKind: RollResultKind = useMemo(() => {
    const r = rollResult ?? "";
    if (r.includes("win") && r.includes("instant")) return "instant_win";
    if (r.includes("loss") || r === "loss") return "instant_loss";
    if (r === "point") return "point";
    if (r === "no_count" || r === "reroll") return "no_count";
    return null;
  }, [rollResult]);

  const lowerBankWindow =
    canLowerBank ||
    (isBanker &&
      room.last_round_was_celo &&
      room.banker_celo_at &&
      Date.now() - new Date(room.banker_celo_at).getTime() < 60_000);

  const lowerPills = useMemo(() => {
    const min = room.minimum_entry_sc;
    const cur = room.current_bank_sc;
    const opts: number[] = [];
    for (let v = min; v < cur; v += min) {
      opts.push(v);
      if (opts.length >= 10) break;
    }
    return opts;
  }, [room.minimum_entry_sc, room.current_bank_sc]);

  const title = roomTitle ?? room.name ?? "Table";
  const dieSize = compact ? 72 : 80;
  const gapDice = compact ? 12 : 16;

  const actionBarBottom = compact ? `calc(${NAV_STACK} + ${TAB_H}px + ${PANEL_MAX}px)` : "auto";

  const tabBarBottom = NAV_STACK;
  const panelBottom = `calc(${NAV_STACK} + ${TAB_H}px)`;

  const showJoinUi =
    Boolean(onJoinRound) &&
    !spectator &&
    myPlayer?.role === "player" &&
    myEntry <= 0 &&
    !currentRound;

  const primaryCenter = () => {
    if (showCoverBank && !isBanker && myPlayer?.role === "player" && currentRound && !showJoinUi) {
      return (
        <button
          type="button"
          onClick={() => setCoverConfirmOpen(true)}
          style={{
            width: "100%",
            maxWidth: 280,
            height: 44,
            borderRadius: 10,
            border: "none",
            fontWeight: 900,
            fontFamily: cinzel.style.fontFamily,
            fontSize: 13,
            cursor: "pointer",
            background: "linear-gradient(135deg,#92400E,#D4A017)",
            color: "#FFFBEB",
          }}
        >
          COVER ({coverBankAmountGpc.toLocaleString()} GPC)
        </button>
      );
    }
    if (showJoinUi) {
      return (
        <div style={{ width: "100%", maxWidth: 320, margin: "0 auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 8 }}>
            {(["min", "2x", "5x", "max"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setJoinSel(k)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: joinSel === k ? "2px solid #F5C842" : "1px solid rgba(124,58,237,0.5)",
                  background: joinSel === k ? "linear-gradient(135deg,#F5C842,#D4A017)" : "transparent",
                  color: joinSel === k ? "#0A0A0F" : "#A855F7",
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {k === "min" ? "MIN" : k === "2x" ? "2×" : k === "5x" ? "5×" : "MAX"}
              </button>
            ))}
          </div>
          <div style={{ textAlign: "center", fontSize: 11, color: "#9CA3AF", marginBottom: 8 }}>
            = {resolvedJoinAmount.toLocaleString()} GPC ({gpcToUsd(resolvedJoinAmount)})
          </div>
          <button
            type="button"
            disabled={joinRoundBusy || resolvedJoinAmount > myBalance}
            onClick={() => onJoinRound?.(resolvedJoinAmount)}
            style={{
              width: "100%",
              height: 44,
              borderRadius: 10,
              border: "none",
              fontWeight: 900,
              fontFamily: cinzel.style.fontFamily,
              fontSize: 14,
              cursor: joinRoundBusy ? "wait" : "pointer",
              background: "linear-gradient(135deg,#F5C842,#D4A017)",
              color: "#0A0A0F",
              opacity: resolvedJoinAmount > myBalance ? 0.45 : 1,
            }}
          >
            JOIN ROUND
          </button>
          {joinRoundError ? (
            <p style={{ marginTop: 8, fontSize: 10, color: "#F87171", textAlign: "center" }}>{joinRoundError}</p>
          ) : null}
        </div>
      );
    }
    if (canStart) {
      return (
        <button
          type="button"
          onClick={onStartRound}
          style={{
            width: "100%",
            maxWidth: 280,
            height: 44,
            borderRadius: 10,
            border: "none",
            fontWeight: 900,
            fontFamily: cinzel.style.fontFamily,
            fontSize: 14,
            cursor: "pointer",
            background: "linear-gradient(135deg,#F5C842,#D4A017)",
            color: "#0A0A0F",
          }}
        >
          🎲 START ROUND
        </button>
      );
    }
    if (myTurn) {
      return (
        <button
          type="button"
          disabled={rollSubmitting}
          onClick={() => void onRoll()}
          style={{
            width: "100%",
            maxWidth: 280,
            height: 44,
            borderRadius: 10,
            border: "none",
            fontWeight: 900,
            fontFamily: cinzel.style.fontFamily,
            fontSize: 14,
            cursor: rollBusy ? "wait" : "pointer",
            background: "linear-gradient(135deg,#F5C842,#D4A017)",
            color: "#0A0A0F",
            opacity: rollBusy ? 0.75 : 1,
            animation: "pulseGold 1.5s ease-in-out infinite",
            boxShadow: rollBusy ? undefined : "0 0 0 0 rgba(245,200,66,0)",
          }}
        >
          🎲 ROLL DICE
        </button>
      );
    }
    const waitingPlayers = !tablePlayers.some((p) => p.entry_sc > 0);
    return (
      <div style={{ textAlign: "center", width: "100%" }}>
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.05)",
            color: "#6B7280",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {waitingPlayers
            ? "Waiting for players…"
            : turnUserId
              ? `${players.find((p) => p.user_id === turnUserId)?.user?.full_name ?? "Player"} rolling…`
              : "Waiting…"}
        </div>
      </div>
    );
  };

  const connLabel =
    connectionStatus === "live" ? "🟢 LIVE" : connectionStatus === "connecting" ? "🟡 CONNECTING" : "🔴 OFFLINE";

  const mobileBottomPadding = compact
    ? `calc(${NAV_STACK} + ${TAB_H}px + ${PANEL_MAX}px + ${ACTION_H}px + 12px)`
    : undefined;

  return (
    <div
      style={{
        position: "relative",
        minHeight: compact ? "100%" : "100%",
        background: "#05010F",
        overflow: "hidden",
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
        paddingBottom: mobileBottomPadding,
      }}
    >
      <style>{`
        @keyframes pulseGold {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,200,66,0); }
          50% { box-shadow: 0 0 16px 4px rgba(245,200,66,0.45); }
        }
        @keyframes pulseLive {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        @keyframes feltVibrate {
          0%, 100% { transform: translateY(0); }
          25% { transform: translateY(-1px); }
          75% { transform: translateY(1px); }
        }
        @keyframes bankerPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,200,66,0.35); }
          50% { box-shadow: 0 0 12px 2px rgba(245,200,66,0.55); }
        }
      `}</style>

      {/* —— Mobile header —— */}
      {compact ? (
        <header
          style={{
            height: 56,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 12px",
            background: "rgba(5,1,15,0.95)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid rgba(124,58,237,0.2)",
            position: "sticky",
            top: 0,
            zIndex: 40,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
            <button
              type="button"
              aria-label="Back to lobby"
              onClick={onBackToLobby}
              style={{
                border: "none",
                background: "transparent",
                color: "#A855F7",
                fontSize: 20,
                cursor: onBackToLobby ? "pointer" : "default",
                padding: 4,
                lineHeight: 1,
              }}
            >
              ←
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#E5E7EB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {truncate(title, 16)}
            </span>
          </div>
          <div
            className={cinzel.className}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#F5C842",
              letterSpacing: "0.08em",
              flexShrink: 0,
              margin: "0 8px",
            }}
          >
            ROUND {roundNumber > 0 ? roundNumber : "—"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: connectionStatus === "live" ? "#10B981" : connectionStatus === "connecting" ? "#EAB308" : "#EF4444",
                animation: connectionStatus === "live" ? "pulseLive 1.4s ease-in-out infinite" : undefined,
              }}
            >
              {connLabel}
            </span>
            <span style={{ fontSize: 9, color: "#6B7280" }}>
              👁 {spectatorCount} watching
            </span>
          </div>
        </header>
      ) : null}

      {/* Bank / prize / status strip */}
      <section
        style={{
          minHeight: 72,
          display: "grid",
          gridTemplateColumns: "1fr 1.2fr 1fr",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "linear-gradient(135deg, rgba(13,5,32,0.9), rgba(30,10,60,0.9))",
          borderBottom: "1px solid rgba(245,200,66,0.15)",
          position: "relative",
          zIndex: 25,
        }}
      >
        {/* Left: banker */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "linear-gradient(145deg,#4c1d95,#7c3aed)",
              border: "2px solid #F5C842",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 800,
              color: "#fff",
            }}
          >
            {(bankerPlayer?.user?.full_name ?? "?")[0]?.toUpperCase() ?? "B"}
          </div>
          <span style={{ fontSize: 11, color: "#D1D5DB", maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {bankerPlayer?.user?.full_name ?? "Banker"}
          </span>
          <span style={{ fontSize: 9, fontWeight: 800, color: "#F5C842", letterSpacing: "0.12em" }}>BANKER</span>
        </div>

        {/* Center: prize pool */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: "#F5C842", letterSpacing: "0.14em" }}>PRIZE POOL</div>
          <div style={{ fontFamily: "Courier New, monospace", fontSize: compact ? 17 : 19, fontWeight: 700, color: "#F5F3FF", marginTop: 2 }}>
            {prizePoolSc.toLocaleString()} GPC
          </div>
          <div style={{ fontSize: 10, color: "#9CA3AF" }}>({gpcToUsd(prizePoolSc)})</div>
          {currentRound?.bank_covered ? (
            <div style={{ marginTop: 4, fontSize: 9, fontWeight: 900, color: "#F5C842" }}>🔒 COVERED</div>
          ) : null}
        </div>

        {/* Right: bank */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: "#F5C842", letterSpacing: "0.14em" }}>BANK</div>
          <div style={{ fontFamily: "Courier New, monospace", fontSize: compact ? 15 : 17, fontWeight: 700, color: "#F5F3FF" }}>
            {room.current_bank_sc.toLocaleString()} GPC
          </div>
          <div style={{ fontSize: 10, color: "#9CA3AF" }}>({gpcToUsd(room.current_bank_sc)})</div>
          {lowerBankWindow && isBanker ? (
            <button
              type="button"
              onClick={() => {
                setLowerAmt(lowerPills[0] ?? room.minimum_entry_sc);
                setLowerSheetOpen(true);
              }}
              style={{
                marginTop: 6,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(245,200,66,0.45)",
                background: "rgba(245,200,66,0.12)",
                color: "#F5C842",
                fontSize: 10,
                fontWeight: 900,
                cursor: "pointer",
                animation: "pulseGold 1.8s ease-in-out infinite",
              }}
            >
              LOWER BANK ↓
            </button>
          ) : null}
        </div>
      </section>

      {/* Main table area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          position: "relative",
          overflow: "auto",
          minHeight: compact ? 280 : 360,
          padding: "12px 12px 24px",
        }}
      >
        {/* Scene */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `
              radial-gradient(ellipse 60% 50% at 50% -10%, rgba(245,200,66,0.12) 0%, transparent 70%),
              linear-gradient(180deg, rgba(20,15,30,0.85) 0%, #05010F 45%)
            `,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "-20%",
            top: "15%",
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: "rgba(124,58,237,0.06)",
            filter: "blur(60px)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "-15%",
            top: "22%",
            width: 150,
            height: 150,
            borderRadius: "50%",
            background: "rgba(245,200,66,0.04)",
            filter: "blur(50px)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "10%",
            bottom: "8%",
            width: "80%",
            height: 120,
            background: "rgba(16,185,129,0.03)",
            filter: "blur(40px)",
            pointerEvents: "none",
          }}
        />

        {/* Neon edges */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 96,
            width: 2,
            background: "#7C3AED",
            boxShadow: "0 0 8px #7C3AED, 0 0 20px #7C3AED, 0 0 40px rgba(124,58,237,0.4)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 96,
            width: 2,
            background: "#F5C842",
            boxShadow: "0 0 8px #F5C842, 0 0 20px #F5C842, 0 0 40px rgba(245,200,66,0.3)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 4,
            background: "#10B981",
            boxShadow: "0 0 12px #10B981, 0 0 24px rgba(16,185,129,0.4)",
            pointerEvents: "none",
          }}
        />

        {/* Banker seat above felt */}
        <div style={{ position: "relative", zIndex: 5, textAlign: "center", marginBottom: 10 }}>
          <div
            style={{
              display: "inline-block",
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.15em",
              color: "#0A0A0F",
              background: "linear-gradient(90deg,#F5C842,#D4A017)",
              marginBottom: 6,
            }}
          >
            BANKER
          </div>
          <div
            style={{
              width: 52,
              height: 52,
              margin: "0 auto",
              borderRadius: "50%",
              border: "3px solid #F5C842",
              background: "linear-gradient(145deg,#4c1d95,#7c3aed)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontWeight: 800,
              color: "#fff",
              boxShadow: "0 0 16px rgba(245,200,66,0.35)",
              animation: turnUserId === room.banker_id && currentRound?.status === "banker_rolling" ? "bankerPulse 1.2s ease-in-out infinite" : undefined,
            }}
          >
            {(bankerPlayer?.user?.full_name ?? "?")[0]?.toUpperCase() ?? "B"}
          </div>
          <div style={{ marginTop: 6, fontFamily: "Courier New, monospace", fontSize: 11, color: "#F5C842" }}>
            BANK: {room.current_bank_sc.toLocaleString()} GPC
          </div>
        </div>

        {/* Felt */}
        <div
          style={{
            position: "relative",
            zIndex: 4,
            width: "min(320px, 90vw)",
            height: compact ? 200 : 260,
            borderRadius: "50%",
            background: "#0D2B0D",
            backgroundImage: `repeating-linear-gradient(
              45deg,
              rgba(255,255,255,0.01) 0px,
              rgba(255,255,255,0.01) 1px,
              transparent 1px,
              transparent 8px
            )`,
            border: "10px solid #5C3A1A",
            boxShadow:
              "0 0 0 2px #8B5E3C, 0 4px 20px rgba(0,0,0,0.6), inset 0 0 30px rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: rolling ? "feltVibrate 0.28s linear infinite" : "none",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: cinzel.style.fontFamily,
              fontSize: 48,
              fontWeight: 700,
              color: "rgba(245,200,66,0.06)",
              userSelect: "none",
              pointerEvents: "none",
            }}
          >
            GP
          </div>
          <div
            style={{
              display: "flex",
              gap: gapDice,
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              zIndex: 6,
              filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.45))",
            }}
          >
            {[0, 1, 2].map((i) => (
              <DiceFace
                key={i}
                value={clampDie(d[i] ?? 1)}
                rolling={rolling}
                diceType={mapDice(myDiceType)}
                size={dieSize}
                delay={i * 133}
              />
            ))}
          </div>
          <RollNameDisplay rollName={rolling ? null : rollName} result={rollResultKind} />
        </div>

        {/* Player seats */}
        <div
          style={{
            position: "relative",
            zIndex: 8,
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 12,
            padding: "12px 16px",
            marginTop: 12,
            maxWidth: 420,
          }}
        >
          {Array.from({ length: room.max_players }).map((_, idx) => {
            const seatNum = idx + 1;
            const p = tablePlayers.find((x) => Number(x.seat_number) === seatNum);
            const active = turnUserId === p?.user_id;
            if (!p) {
              return (
                <div key={seatNum} style={{ width: 56, textAlign: "center" }}>
                  <button
                    type="button"
                    disabled={Boolean(currentRound)}
                    style={{
                      width: 40,
                      height: 40,
                      margin: "0 auto",
                      borderRadius: "50%",
                      border: "2px dashed rgba(124,58,237,0.3)",
                      background: "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#A855F7",
                      fontSize: 18,
                      cursor: currentRound ? "not-allowed" : "pointer",
                      opacity: currentRound ? 0.4 : 1,
                    }}
                  >
                    +
                  </button>
                  <div style={{ fontSize: 10, color: "#6B7280", marginTop: 4 }}>OPEN</div>
                </div>
              );
            }
            const initial = (p.user?.full_name ?? "P")[0]?.toUpperCase() ?? "P";
            const shortName = truncate(p.user_id === currentUserId ? "You" : p.user?.full_name ?? "Player", 6);
            return (
              <div key={p.id} style={{ width: 56, textAlign: "center" }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    margin: "0 auto",
                    borderRadius: "50%",
                    background: "linear-gradient(145deg,#4c1d95,#7c3aed)",
                    border: active ? "2px solid #F5C842" : "2px solid rgba(124,58,237,0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 800,
                    boxShadow: active ? "0 0 8px rgba(245,200,66,0.6)" : "none",
                    animation: active ? "pulseGold 1.4s ease-in-out infinite" : undefined,
                  }}
                >
                  {initial}
                </div>
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>{shortName}</div>
                <div style={{ fontSize: 10, color: "#F5C842", fontFamily: "Courier New, monospace" }}>{p.entry_sc.toLocaleString()} GPC</div>
                <div style={{ fontSize: 9, fontWeight: 800, color: active ? "#F5C842" : "#6B7280" }}>{active ? "ROLLING" : "—"}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lower bank bottom sheet */}
      {lowerBankWindow && isBanker && lowerSheetOpen ? (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 110,
            height: 280,
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            background: "#0D0520",
            borderTop: "2px solid #F5C842",
            borderRadius: "20px 20px 0 0",
            padding: 16,
            boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
          }}
        >
          <h3 className={cinzel.className} style={{ color: "#F5C842", fontSize: 18, marginBottom: 8 }}>
            Lower Your Bank?
          </h3>
          <p style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8 }}>
            Available for: {lowerBankSecondsLeft}s
          </p>
          <div style={{ height: 4, borderRadius: 4, background: "rgba(255,255,255,0.08)", marginBottom: 12, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (lowerBankSecondsLeft / 60) * 100)}%`,
                background: "linear-gradient(90deg,#F5C842,#D4A017)",
                transition: "width 1s linear",
              }}
            />
          </div>
          <p style={{ fontFamily: "Courier New, monospace", fontSize: 13, color: "#E5E7EB", marginBottom: 12 }}>
            Current: {room.current_bank_sc.toLocaleString()} GPC ({gpcToUsd(room.current_bank_sc)})
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {lowerPills.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setLowerAmt(amt)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: lowerAmt === amt ? "2px solid #F5C842" : "1px solid rgba(124,58,237,0.4)",
                  background: lowerAmt === amt ? "rgba(245,200,66,0.15)" : "transparent",
                  color: "#F5F3FF",
                  fontSize: 11,
                  fontFamily: "Courier New, monospace",
                  cursor: "pointer",
                }}
              >
                {amt.toLocaleString()} GPC
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onLowerBank(lowerAmt);
              setLowerSheetOpen(false);
            }}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "none",
              fontWeight: 900,
              background: "linear-gradient(135deg,#F5C842,#D4A017)",
              color: "#0A0A0F",
              cursor: "pointer",
              marginBottom: 8,
            }}
          >
            CONFIRM
          </button>
          <button
            type="button"
            onClick={() => {
              setLowerSheetOpen(false);
              onDismissLowerBank?.();
            }}
            style={{ width: "100%", padding: 10, background: "transparent", border: "none", color: "#6B7280", fontSize: 13 }}
          >
            KEEP SAME
          </button>
        </div>
      ) : null}

      {/* Cover bank confirmation */}
      {coverConfirmOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 110,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={() => setCoverConfirmOpen(false)}
          role="presentation"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              background: "#0D0520",
              borderTop: "2px solid #F5C842",
              borderRadius: "20px 20px 0 0",
              padding: 20,
              marginBottom: compact ? NAV_STACK : 0,
            }}
          >
            <h3 className={cinzel.className} style={{ color: "#F5C842", fontSize: 18, marginBottom: 12 }}>
              Cover the Entire Bank
            </h3>
            <p style={{ fontSize: 13, color: "#D1D5DB", marginBottom: 8 }}>
              You will enter {coverBankAmountGpc.toLocaleString()} GPC ({gpcToUsd(coverBankAmountGpc)}).
            </p>
            <p style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>Other players locked out this round.</p>
            <p style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 16 }}>Side entries still open for spectators.</p>
            <button
              type="button"
              onClick={() => {
                setCoverConfirmOpen(false);
                onCoverBank();
              }}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 12,
                border: "none",
                fontWeight: 900,
                background: "linear-gradient(135deg,#F5C842,#D4A017)",
                color: "#0A0A0F",
                cursor: "pointer",
                marginBottom: 8,
              }}
            >
              CONFIRM COVER
            </button>
            <button
              type="button"
              onClick={() => setCoverConfirmOpen(false)}
              style={{ width: "100%", padding: 10, background: "transparent", border: "none", color: "#6B7280" }}
            >
              CANCEL
            </button>
          </div>
        </div>
      ) : null}

      {/* Action bar */}
      <div
        style={{
          position: compact ? "fixed" : "relative",
          left: 0,
          right: 0,
          bottom: compact ? actionBarBottom : "auto",
          zIndex: 55,
          height: ACTION_H,
          background: "rgba(5,1,15,0.96)",
          backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(124,58,237,0.2)",
          padding: "0 16px",
          display: "grid",
          gridTemplateColumns: "25% 50% 25%",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 9, color: "#6B7280", letterSpacing: "0.06em" }}>BALANCE</div>
          <div style={{ fontFamily: "Courier New, monospace", fontSize: 13, color: "#F5C842", fontWeight: 700 }}>
            {myBalance.toLocaleString()} GPC
          </div>
          <div style={{ fontSize: 10, color: "#6B7280" }}>({gpcToUsd(myBalance)})</div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>{primaryCenter()}</div>
        <div style={{ textAlign: "right" }}>
          <button
            type="button"
            onClick={onOpenDiceShop}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              background: "rgba(124,58,237,0.2)",
              border: "1px solid rgba(124,58,237,0.4)",
              color: "#A855F7",
              fontWeight: 800,
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            🎲 DICE
          </button>
        </div>
      </div>

      {/* Mobile tabs + panel */}
      {compact && onMobileTabChange && mobileTabPanels ? (
        <>
          <div
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: tabBarBottom,
              zIndex: 52,
              height: TAB_H,
              background: "rgba(5,1,15,0.96)",
              backdropFilter: "blur(12px)",
              borderTop: "1px solid rgba(124,58,237,0.15)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              alignItems: "stretch",
            }}
          >
            {(
              [
                ["bets", "🎰 SIDE"],
                ["chat", "💬 CHAT"],
                ["voice", "🎤 VOICE"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => onMobileTabChange(k)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 11,
                  fontWeight: 800,
                  color: mobileTab === k ? "#F5C842" : "#6B7280",
                  borderBottom: mobileTab === k ? "2px solid #F5C842" : "2px solid transparent",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: panelBottom,
              zIndex: 51,
              maxHeight: PANEL_MAX,
              height: PANEL_MAX,
              overflow: "auto",
              background: "rgba(13,5,32,0.98)",
              borderTop: "1px solid rgba(124,58,237,0.1)",
              padding: 12,
            }}
          >
            {mobileTab === "bets" ? mobileTabPanels.bets : mobileTab === "chat" ? mobileTabPanels.chat : mobileTabPanels.voice}
          </div>
        </>
      ) : null}

      {/* Dice shop */}
      {diceShopOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 110,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={onCloseDiceShop}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 360,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#0D0520",
              border: "1px solid rgba(124,58,237,0.3)",
              borderRadius: 20,
              padding: 24,
            }}
          >
            <div className={cinzel.className} style={{ fontSize: 18, fontWeight: 700, color: "#F5C842", marginBottom: 16 }}>
              UPGRADE YOUR DICE
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {(Object.keys(DICE_TYPES) as Array<keyof typeof DICE_TYPES>).map((key) => {
                const cfg = DICE_TYPES[key];
                const isStandard = String(key) === "standard";
                const disabled = isStandard || (String(key) === "gold" && !isBanker);
                const cost = cfg.costCents;
                return (
                  <div
                    key={key}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: shopType === key ? "2px solid #F5C842" : "1px solid rgba(124,58,237,0.25)",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                      <DiceFace value={6} rolling={false} diceType={key} size={48} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#E5E7EB" }}>{cfg.name}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", fontFamily: "Courier New, monospace" }}>
                      {cost === 0 ? "FREE" : `${cost.toLocaleString()} GPC (${gpcToUsd(cost)})`}
                    </div>
                    {key === "gold" && !isBanker ? <div style={{ fontSize: 10, color: "#F87171" }}>Banker only</div> : null}
                    <button
                      type="button"
                      disabled={disabled || isStandard}
                      onClick={() => setShopType(key)}
                      style={{
                        marginTop: 8,
                        width: "100%",
                        padding: 8,
                        borderRadius: 8,
                        border: "none",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: disabled ? "not-allowed" : "pointer",
                        background: shopType === key ? "rgba(245,200,66,0.2)" : "rgba(255,255,255,0.06)",
                        color: "#fff",
                      }}
                    >
                      SELECT
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#94A3B8" }}>Quantity</span>
              {(
                [
                  [1, "1 DIE"],
                  [2, "2 DICE"],
                  [3, "3 DICE"],
                ] as const
              ).map(([q, label]) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setShopQty(q)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: shopQty === q ? "2px solid #F5C842" : "1px solid rgba(124,58,237,0.35)",
                    background: "transparent",
                    color: "#F5F3FF",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: "#A7F3D0", fontFamily: "Courier New, monospace" }}>
              Total: {((DICE_TYPES[shopType]?.costCents ?? 0) * shopQty).toLocaleString()} GPC (
              {gpcToUsd((DICE_TYPES[shopType]?.costCents ?? 0) * shopQty)})
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#9CA3AF" }}>
              Balance: {myBalance.toLocaleString()} GPC
            </div>
            <button
              type="button"
              onClick={() => onPurchaseDice(shopType, shopQty)}
              style={{
                marginTop: 16,
                width: "100%",
                padding: 12,
                borderRadius: 12,
                border: "none",
                fontWeight: 900,
                background: "linear-gradient(135deg,#F5C842,#D4A017)",
                color: "#0A0A0F",
                cursor: "pointer",
              }}
            >
              PURCHASE
            </button>
            <button
              type="button"
              onClick={onCloseDiceShop}
              style={{ marginTop: 8, width: "100%", padding: 8, background: "transparent", border: "none", color: "#6B7280" }}
            >
              CANCEL
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
