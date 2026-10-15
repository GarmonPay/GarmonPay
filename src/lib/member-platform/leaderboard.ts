export type RankRow = {
  rank: number;
  handle: string;
  displayName: string;
  realizedLamports: string;
  fills: number;
};

export function periodStart(nowMs: number, period: "daily" | "weekly" | "monthly"): number {
  const now = new Date(nowMs);
  if (period === "daily") return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (period === "monthly") return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const day = now.getUTCDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset);
}

/** Paper rankings use realized virtual results only. There is no reset. */
export function rankPaperTraders(input: {
  nowMs: number;
  period: "daily" | "weekly" | "monthly";
  members: { id: string; handle: string; displayName: string }[];
  fills: { memberId: string; realizedLamports: string; at: string }[];
}): RankRow[] {
  const start = periodStart(input.nowMs, input.period);
  const totals = new Map<string, { realized: bigint; fills: number }>();
  for (const fill of input.fills) {
    const at = Date.parse(fill.at);
    if (!Number.isFinite(at) || at < start || at > input.nowMs) continue;
    const current = totals.get(fill.memberId) ?? { realized: BigInt("0"), fills: 0 };
    current.realized += BigInt(fill.realizedLamports);
    current.fills += 1;
    totals.set(fill.memberId, current);
  }
  return Array.from(totals.entries())
    .map(([id, total]) => {
      const member = input.members.find((item) => item.id === id);
      if (!member || total.fills === 0) return null;
      return { handle: member.handle, displayName: member.displayName, realizedLamports: total.realized.toString(), fills: total.fills };
    })
    .filter((row): row is Omit<RankRow, "rank"> => row !== null)
    .sort((a, b) => {
      const delta = BigInt(b.realizedLamports) - BigInt(a.realizedLamports);
      if (delta > BigInt("0")) return 1;
      if (delta < BigInt("0")) return -1;
      return a.handle.localeCompare(b.handle);
    })
    .slice(0, 100)
    .map((row, index) => ({ rank: index + 1, ...row }));
}

/** Verified live rankings stay empty while Mainnet trading is paused. Paper fills are ignored. */
export function rankVerifiedLive(): { book: "verified-live"; available: false; rows: RankRow[]; reason: string } {
  return {
    book: "verified-live",
    available: false,
    rows: [],
    reason: "Mainnet trading is paused. No verified live results are published.",
  };
}
