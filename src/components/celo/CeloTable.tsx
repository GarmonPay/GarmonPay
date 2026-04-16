"use client";

import { useMemo, useState } from "react";
import Dice3D, { type Dice3DType } from "@/components/celo/Dice3D";
import RollNameDisplay, { type RollResultKind } from "@/components/celo/RollNameDisplay";
import type { CeloPlayer, CeloRoom, CeloRound } from "@/types/celo";
import { DICE_TYPES } from "@/lib/celo-engine";

function scToUsd(sc: number): string {
  return (Math.max(0, sc) / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function mapDice(t: string | undefined): Dice3DType {
  const x = String(t ?? "standard").toLowerCase();
  if (x in DICE_TYPES) return x as Dice3DType;
  return "standard";
}

export type CeloTableProps = {
  room: CeloRoom;
  currentRound: CeloRound | null;
  players: CeloPlayer[];
  currentUserId: string;
  onRoll: () => void | Promise<void>;
  onStartRound: () => void;
  rolling: boolean;
  dice: [number, number, number] | null;
  rollName: string | null;
  rollResult: string | null;
  myBalance: number;
  myEntry: number;
  prizePoolSc: number;
  canLowerBank: boolean;
  lowerBankSecondsLeft: number;
  onLowerBank: (amountSc: number) => void;
  showCoverBank: boolean;
  coverBankAmountSc: number;
  onCoverBank: () => void;
  onOpenDiceShop: () => void;
  diceShopOpen: boolean;
  onCloseDiceShop: () => void;
  onPurchaseDice: (diceType: Dice3DType, quantity: number) => void;
  myDiceType: Dice3DType;
  isBanker: boolean;
  compact?: boolean;
};

export default function CeloTable({
  room,
  currentRound,
  players,
  currentUserId,
  onRoll,
  onStartRound,
  rolling,
  dice,
  rollName,
  rollResult,
  myBalance,
  myEntry,
  prizePoolSc,
  canLowerBank,
  lowerBankSecondsLeft,
  onLowerBank,
  showCoverBank,
  coverBankAmountSc,
  onCoverBank,
  onOpenDiceShop,
  diceShopOpen,
  onCloseDiceShop,
  onPurchaseDice,
  myDiceType,
  isBanker,
  compact = false,
}: CeloTableProps) {
  const [lowerAmt, setLowerAmt] = useState(room.minimum_entry_sc);
  const [shopQty, setShopQty] = useState(1);
  const [shopType, setShopType] = useState<Dice3DType>("street");

  const d = dice ?? [1, 1, 1];
  const bankerPlayer = players.find((p) => p.role === "banker");
  const tablePlayers = players.filter((p) => p.role === "player").sort((a, b) => a.seat_number - b.seat_number);
  const myPlayer = players.find((p) => p.user_id === currentUserId);
  const spectator = myPlayer?.role === "spectator";

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

  const rollResultKind: RollResultKind = useMemo(() => {
    const r = rollResult ?? "";
    if (r.includes("win") && r.includes("instant")) return "instant_win";
    if (r.includes("loss") || r === "loss") return "instant_loss";
    if (r === "point") return "point";
    if (r === "no_count" || r === "reroll") return "no_count";
    return null;
  }, [rollResult]);

  const tableSize = compact ? 280 : 400;
  const dieSize = compact ? 56 : 72;

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100%",
        background: "#0A0A0F",
        overflow: "hidden",
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse 80% 45% at 50% 0%, rgba(245,200,100,0.14), transparent 55%),
            linear-gradient(180deg, rgba(10,10,15,0.9), #0A0A0F),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 18px),
            repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0 1px, transparent 1px 14px)
          `,
          pointerEvents: "none",
        }}
      />
      {/* graffiti */}
      <div
        style={{
          position: "absolute",
          top: "6%",
          left: "4%",
          right: "4%",
          height: 90,
          opacity: 0.35,
          background:
            "radial-gradient(ellipse at 20% 50%, rgba(124,58,237,0.5), transparent 50%), radial-gradient(ellipse at 70% 40%, rgba(245,200,66,0.35), transparent 45%), radial-gradient(ellipse at 50% 80%, rgba(16,185,129,0.25), transparent 50%)",
          filter: "blur(2px)",
        }}
      />
      {/* neon tubes */}
      <div
        style={{
          position: "absolute",
          left: 8,
          top: "15%",
          bottom: "25%",
          width: 4,
          borderRadius: 4,
          background: "#7C3AED",
          boxShadow: "0 0 20px #7C3AED, 0 0 40px #7C3AED, 0 0 80px #7C3AED",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 8,
          top: "18%",
          bottom: "28%",
          width: 4,
          borderRadius: 4,
          background: "#F5C842",
          boxShadow: "0 0 20px #F5C842, 0 0 40px #F5C842",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 6,
          background: "#10B981",
          boxShadow: "0 0 15px #10B981",
          opacity: 0.45,
        }}
      />
      {/* smoke */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.05,
          animation: "haze 14s ease-in-out infinite alternate",
          background: "radial-gradient(circle at 30% 40%, rgba(200,200,255,0.3), transparent 55%)",
          pointerEvents: "none",
        }}
      />
      <style>{`
        @keyframes haze { from { opacity: 0.03; } to { opacity: 0.07; } }
        @keyframes feltVibe { 0%,100% { transform: translate(0,0); } 50% { transform: translate(0.5px,-0.5px); } }
        @keyframes pulseBtn { 0%,100% { box-shadow: 0 0 0 0 rgba(245,200,66,0.45); } 50% { box-shadow: 0 0 24px 4px rgba(245,200,66,0.35); } }
      `}</style>

      {/* prize pool */}
      <div style={{ textAlign: "center", paddingTop: compact ? 12 : 20, position: "relative", zIndex: 2 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.25em", color: "#94a3b8" }}>PRIZE POOL</div>
        <div style={{ fontSize: compact ? 26 : 34, fontWeight: 900, color: "#F5C842", textShadow: "0 0 24px rgba(245,200,66,0.35)" }}>
          {prizePoolSc.toLocaleString()} SC
        </div>
        <div style={{ fontSize: 12, color: "#64748b" }}>{scToUsd(prizePoolSc)}</div>
      </div>

      {/* banker */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 12, position: "relative", zIndex: 2 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "#F5C842", letterSpacing: "0.15em", marginBottom: 4 }}>BANKER</div>
          <div
            style={{
              width: 64,
              height: 64,
              margin: "0 auto",
              borderRadius: "50%",
              border: "3px solid #F5C842",
              background: "linear-gradient(145deg,#4c1d95,#7c3aed)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 800,
              color: "#fff",
              boxShadow: "0 0 20px rgba(245,200,66,0.25)",
            }}
          >
            {(bankerPlayer?.user?.full_name ?? "?")[0]?.toUpperCase() ?? "B"}
          </div>
          <div style={{ fontSize: 12, color: "#e2e8f0", marginTop: 6, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
            {bankerPlayer?.user?.full_name ?? "Banker"}
          </div>
          <div style={{ fontSize: 13, color: "#F5C842", fontWeight: 700 }}>
            BANK: {room.current_bank_sc.toLocaleString()} SC
          </div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{scToUsd(room.current_bank_sc)}</div>
        </div>
      </div>

      {/* table + dice */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 16, position: "relative", zIndex: 2 }}>
        <div
          style={{
            width: tableSize,
            maxWidth: "92vw",
            height: Math.round(tableSize * 0.72),
            borderRadius: "50%",
            background: "#1A3A1A",
            border: "12px solid #5C3A1A",
            boxShadow:
              "0 0 0 4px #8B5E3C, inset 0 0 60px rgba(0,0,0,0.45), 0 24px 50px rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            animation: rolling ? "feltVibe 0.25s linear infinite" : "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              opacity: 0.08,
              background: "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.25), transparent 55%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              opacity: 0.08,
              background: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='80' height='80' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E\")",
              mixBlendMode: "overlay",
            }}
          />
          <div
            style={{
              position: "absolute",
              fontSize: 42,
              fontWeight: 900,
              color: "rgba(255,255,255,0.08)",
              userSelect: "none",
              pointerEvents: "none",
            }}
          >
            GP
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", position: "relative", zIndex: 3 }}>
            {[0, 1, 2].map((i) => (
              <Dice3D
                key={i}
                value={d[i] ?? 1}
                rolling={rolling}
                diceType={myDiceType}
                size={dieSize}
                delay={i * 40}
                dieIndex={i as 0 | 1 | 2}
              />
            ))}
          </div>
          <RollNameDisplay rollName={rolling ? null : rollName} result={rollResultKind} />
        </div>
      </div>

      {/* seats arc */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 10,
          padding: "16px 12px 120px",
          position: "relative",
          zIndex: 2,
        }}
      >
        {Array.from({ length: room.max_players }).map((_, idx) => {
          const seatNum = idx + 1;
          const p = tablePlayers.find((x) => Number(x.seat_number) === seatNum);
          const active = turnUserId === p?.user_id;
          if (!p) {
            return (
              <div key={seatNum} style={{ width: 72, textAlign: "center", opacity: 0.55 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    margin: "0 auto",
                    borderRadius: "50%",
                    border: "2px dashed #444",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#555",
                    fontSize: 18,
                  }}
                >
                  +
                </div>
                <div style={{ fontSize: 9, color: "#555", marginTop: 4 }}>OPEN</div>
              </div>
            );
          }
          const initial = (p.user?.full_name ?? "P")[0]?.toUpperCase() ?? "P";
          return (
            <div key={p.id} style={{ width: 76, textAlign: "center" }}>
              {active && (
                <div style={{ fontSize: 9, color: "#F5C842", fontWeight: 800, marginBottom: 2 }}>YOUR TURN</div>
              )}
              <div
                style={{
                  width: 48,
                  height: 48,
                  margin: "0 auto",
                  borderRadius: "50%",
                  background: "linear-gradient(145deg,#4c1d95,#6d28d9)",
                  border: active ? "2px solid #F5C842" : "2px solid rgba(124,58,237,0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontWeight: 800,
                  boxShadow: active ? "0 0 18px rgba(245,200,66,0.45)" : "none",
                }}
              >
                {initial}
              </div>
              <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.user_id === currentUserId ? "YOU" : p.user?.full_name ?? "Player"}
              </div>
              <div style={{ fontSize: 10, color: "#86efac" }}>{p.entry_sc} SC entry</div>
            </div>
          );
        })}
      </div>

      {/* lower bank */}
      {canLowerBank && isBanker && (
        <div
          style={{
            margin: "0 16px 12px",
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(245,200,66,0.35)",
            background: "rgba(245,200,66,0.06)",
          }}
        >
          <div style={{ fontSize: 12, color: "#F5C842", fontWeight: 700 }}>Lower your bank? ({lowerBankSecondsLeft}s)</div>
          <input
            type="range"
            min={room.minimum_entry_sc}
            max={room.current_bank_sc}
            value={lowerAmt}
            onChange={(e) => setLowerAmt(Number(e.target.value))}
            style={{ width: "100%", marginTop: 8 }}
          />
          <button
            type="button"
            onClick={() => onLowerBank(lowerAmt)}
            style={{
              marginTop: 8,
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "none",
              fontWeight: 800,
              cursor: "pointer",
              background: "linear-gradient(90deg,#f5c842,#ca8a04)",
              color: "#0a0a0f",
            }}
          >
            CONFIRM LOWER BANK
          </button>
        </div>
      )}

      {showCoverBank && !isBanker && myPlayer?.role === "player" && (
        <div style={{ padding: "0 16px 12px" }}>
          <button
            type="button"
            onClick={onCoverBank}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "none",
              fontWeight: 800,
              cursor: "pointer",
              background: "linear-gradient(90deg,#f5c842,#ca8a04)",
              color: "#0a0a0f",
            }}
          >
            COVER THE BANK ({coverBankAmountSc.toLocaleString()} SC)
          </button>
        </div>
      )}

      {/* bottom bar */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 30,
          background: "linear-gradient(180deg, rgba(8,6,16,0.92), rgba(5,4,12,0.98))",
          borderTop: "1px solid rgba(124,58,237,0.25)",
          padding: "12px 14px calc(12px + env(safe-area-inset-bottom))",
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: "#64748b" }}>Your balance</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#F5C842" }}>{myBalance.toLocaleString()} SC</div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>Your entry</div>
          <div style={{ fontSize: 12, color: "#e2e8f0" }}>{myEntry.toLocaleString()} SC</div>
        </div>
        <div style={{ textAlign: "center" }}>
          {canStart ? (
            <button
              type="button"
              onClick={onStartRound}
              style={{
                padding: "12px 22px",
                borderRadius: 12,
                border: "none",
                fontWeight: 900,
                fontSize: 13,
                cursor: "pointer",
                background: "linear-gradient(135deg,#f5c842,#d97706)",
                color: "#0a0a0f",
              }}
            >
              START ROUND
            </button>
          ) : myTurn ? (
            <button
              type="button"
              onClick={() => void onRoll()}
              style={{
                padding: "14px 28px",
                borderRadius: 14,
                border: "none",
                fontWeight: 900,
                fontSize: 15,
                cursor: rolling ? "wait" : "pointer",
                background: "linear-gradient(135deg,#f5c842,#d97706)",
                color: "#0a0a0f",
                animation: "pulseBtn 2s ease-in-out infinite",
                opacity: rolling ? 0.7 : 1,
              }}
            >
              🎲 ROLL DICE
            </button>
          ) : (
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
                {turnUserId
                  ? `${players.find((p) => p.user_id === turnUserId)?.user?.full_name ?? "Player"} is rolling…`
                  : "Waiting…"}
              </div>
              <button
                type="button"
                disabled
                style={{
                  padding: "12px 20px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontWeight: 700,
                  fontSize: 12,
                  opacity: 0.4,
                  color: "#94a3b8",
                  background: "transparent",
                }}
              >
                🎲 ROLL DICE
              </button>
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <button
            type="button"
            onClick={onOpenDiceShop}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(245,200,66,0.35)",
              background: "rgba(245,200,66,0.08)",
              color: "#F5C842",
              fontWeight: 700,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            🎲 BUY DICE
          </button>
        </div>
      </div>

      {diceShopOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.72)",
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
              width: "min(480px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#0f0d1a",
              borderRadius: 16,
              border: "1px solid rgba(124,58,237,0.35)",
              padding: 16,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 900, color: "#F5C842", marginBottom: 12 }}>UPGRADE YOUR DICE</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
              {(Object.keys(DICE_TYPES) as Array<keyof typeof DICE_TYPES>).map((key) => {
                const cfg = DICE_TYPES[key];
                const isStandard = String(key) === "standard";
                const disabled = isStandard || (String(key) === "gold" && !isBanker);
                return (
                  <div
                    key={key}
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      border: shopType === key ? "2px solid #F5C842" : "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                      <Dice3D value={3} rolling={false} diceType={key as Dice3DType} size={44} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{cfg.name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{cfg.costCents === 0 ? "FREE" : `${cfg.costCents} SC`}</div>
                    {key === "gold" && !isBanker && <div style={{ fontSize: 10, color: "#f87171" }}>Banker only</div>}
                    <button
                      type="button"
                      disabled={disabled || isStandard}
                      onClick={() => setShopType(key as Dice3DType)}
                      style={{
                        marginTop: 8,
                        width: "100%",
                        padding: 6,
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
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>Quantity</span>
              {[1, 2, 3].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setShopQty(q)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: shopQty === q ? "2px solid #F5C842" : "1px solid #334155",
                    background: "transparent",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: "#86efac" }}>
              Total: {(DICE_TYPES[shopType as keyof typeof DICE_TYPES]?.costCents ?? 0) * shopQty} SC
            </div>
            <button
              type="button"
              onClick={() => onPurchaseDice(shopType, shopQty)}
              style={{
                marginTop: 12,
                width: "100%",
                padding: 12,
                borderRadius: 12,
                border: "none",
                fontWeight: 900,
                background: "linear-gradient(135deg,#f5c842,#ca8a04)",
                color: "#0a0a0f",
                cursor: "pointer",
              }}
            >
              PURCHASE
            </button>
            <button
              type="button"
              onClick={onCloseDiceShop}
              style={{ marginTop: 8, width: "100%", padding: 8, background: "transparent", border: "none", color: "#94a3b8" }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
