"use client";

import { useMemo, useState } from "react";
import type { CeloSideBet } from "@/types/celo";

const BET_OPTIONS: { label: string; value: string; odds: number }[] = [
  { label: "Next roll is C-Lo", value: "celo", odds: 8 },
  { label: "Next roll is Shit", value: "shit", odds: 8 },
  { label: "Next roll is Hand Crack", value: "hand_crack", odds: 4.5 },
  { label: "Next roll is Trips", value: "trips", odds: 8 },
  { label: "Banker earns this round", value: "banker_wins", odds: 1.8 },
  { label: "Players earn this round", value: "player_wins", odds: 1.8 },
  { label: "Specific point (pick)", value: "specific_point", odds: 6 },
];

type Props = {
  roomId: string;
  roundId: string | null;
  sideBets: CeloSideBet[];
  myUserId: string;
  myBalance: number;
  roundStatus: string;
  accessToken: string | null;
  onRefresh: () => void;
};

export default function SideBetPanel({
  roomId,
  roundId,
  sideBets,
  myUserId,
  myBalance,
  roundStatus,
  accessToken,
  onRefresh,
}: Props) {
  const [betType, setBetType] = useState("celo");
  const [specificPoint, setSpecificPoint] = useState<2 | 3 | 4 | 5>(2);
  const [amount, setAmount] = useState(100);
  const [posting, setPosting] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const openBets = useMemo(
    () => sideBets.filter((b) => b.status === "open" && b.creator_id !== myUserId),
    [sideBets, myUserId],
  );
  const mine = useMemo(() => sideBets.filter((b) => b.creator_id === myUserId || b.acceptor_id === myUserId), [sideBets, myUserId]);

  const odds = BET_OPTIONS.find((o) => o.value === betType)?.odds ?? 8;
  const potential = Math.floor(amount * odds);

  async function postBet() {
    setErr(null);
    if (!accessToken || !roundId) {
      setErr("Sign in and wait for an active round.");
      return;
    }
    if (amount < 100 || amount % 100 !== 0) {
      setErr("Entry must be at least 100 SC and a multiple of 100.");
      return;
    }
    if (amount > myBalance) {
      setErr("Not enough Sweeps Coins.");
      return;
    }
    setPosting(true);
    try {
      const body: Record<string, unknown> = {
        room_id: roomId,
        round_id: roundId,
        bet_type: betType,
        amount_cents: amount,
      };
      if (betType === "specific_point") body.specific_point = specificPoint;
      const res = await fetch("/api/celo/sidebet/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(data.error ?? "Could not post side entry");
        return;
      }
      onRefresh();
    } finally {
      setPosting(false);
    }
  }

  async function takeBet(betId: string) {
    if (!accessToken) return;
    setAccepting(betId);
    setErr(null);
    try {
      const res = await fetch("/api/celo/sidebet/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ bet_id: betId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(data.error ?? "Could not take entry");
        return;
      }
      onRefresh();
    } finally {
      setAccepting(null);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: "linear-gradient(180deg, rgba(12,10,24,0.98), rgba(6,4,14,0.99))",
        border: "1px solid rgba(245,200,66,0.12)",
        borderRadius: 12,
        padding: 12,
        minHeight: 200,
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "#fde68a", fontWeight: 800 }}>SIDE ENTRIES 🎰</div>
      {err && (
        <div style={{ color: "#fca5a5", fontSize: 12, padding: 8, background: "rgba(239,68,68,0.1)", borderRadius: 8 }}>{err}</div>
      )}

      <div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>OPEN ENTRIES</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 160, overflowY: "auto" }}>
          {openBets.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.5 }}>
              No open side entries yet.
              <br />
              Be the first to post one!
            </div>
          ) : (
            openBets.map((b) => {
              const exp = Date.parse(b.expires_at);
              const left = Number.isFinite(exp) ? Math.max(0, Math.floor((exp - Date.now()) / 1000)) : 0;
              const creator = b.creator?.full_name ?? "Player";
              return (
                <div
                  key={b.id}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(124,58,237,0.2)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600 }}>{creator}</div>
                  <div style={{ fontSize: 11, color: "#a78bfa", marginTop: 4 }}>{b.bet_type.replace(/_/g, " ")}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                    {b.amount_sc} SC → up to {Math.floor(b.amount_sc * b.odds_multiplier)} SC · {left}s
                  </div>
                  <button
                    type="button"
                    disabled={!accessToken || accepting === b.id}
                    onClick={() => void takeBet(b.id)}
                    style={{
                      marginTop: 8,
                      width: "100%",
                      padding: "6px 0",
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: 11,
                      background: "linear-gradient(90deg,#f5c842,#d97706)",
                      color: "#0a0a0f",
                    }}
                  >
                    {accepting === b.id ? "…" : "TAKE IT"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>POST A SIDE ENTRY</div>
        <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 4 }}>Outcome</label>
        <select
          value={betType}
          onChange={(e) => setBetType(e.target.value)}
          style={{
            width: "100%",
            padding: 8,
            borderRadius: 8,
            background: "rgba(0,0,0,0.4)",
            color: "#e2e8f0",
            border: "1px solid rgba(124,58,237,0.3)",
            marginBottom: 8,
            fontSize: 12,
          }}
        >
          {BET_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} — {o.odds}x
            </option>
          ))}
        </select>
        {betType === "specific_point" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {([2, 3, 4, 5] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setSpecificPoint(p)}
                style={{
                  flex: 1,
                  padding: 6,
                  borderRadius: 8,
                  border: specificPoint === p ? "2px solid #f5c842" : "1px solid rgba(255,255,255,0.12)",
                  background: specificPoint === p ? "rgba(245,200,66,0.15)" : "transparent",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 4 }}>Amount (SC, multiple of 100)</label>
        <input
          type="number"
          min={100}
          step={100}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          style={{
            width: "100%",
            padding: 8,
            borderRadius: 8,
            background: "rgba(0,0,0,0.4)",
            color: "#e2e8f0",
            border: "1px solid rgba(124,58,237,0.3)",
            marginBottom: 8,
          }}
        />
        <div style={{ fontSize: 11, color: "#86efac", marginBottom: 8 }}>If you earn: +{potential} SC (prize estimate)</div>
        <button
          type="button"
          disabled={posting || !roundId || roundStatus === "completed"}
          onClick={() => void postBet()}
          style={{
            width: "100%",
            padding: "10px 0",
            borderRadius: 10,
            border: "none",
            fontWeight: 800,
            fontSize: 12,
            cursor: posting ? "wait" : "pointer",
            background: "linear-gradient(135deg,#6d28d9,#4c1d95)",
            color: "#fff",
          }}
        >
          {posting ? "POSTING…" : "POST SIDE ENTRY"}
        </button>
      </div>

      <div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>MY ACTIVE ENTRIES</div>
        {mine.length === 0 ? (
          <div style={{ color: "#475569", fontSize: 11 }}>None yet.</div>
        ) : (
          mine.map((b) => (
            <div key={b.id} style={{ fontSize: 11, color: "#cbd5e1", marginBottom: 4 }}>
              {b.bet_type} · {b.amount_sc} SC · {b.status}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
