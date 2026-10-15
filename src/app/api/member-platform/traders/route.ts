import { periodStart, rankPaperTraders, rankVerifiedLive } from "@/lib/member-platform/leaderboard";
import { readLedger } from "@/lib/member-platform/repository";
import { formatLamports } from "@/lib/member-platform/economics";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const book = url.searchParams.get("book") === "live" ? "live" : "paper";
  const period = url.searchParams.get("period");
  const windowName = period === "weekly" || period === "monthly" ? period : "daily";
  if (book === "live") {
    const live = rankVerifiedLive();
    return Response.json({ ...live, period: windowName }, { headers: { "Cache-Control": "no-store" } });
  }
  const state = readLedger();
  const nowMs = Date.now();
  const rows = rankPaperTraders({ nowMs, period: windowName, members: state.members, fills: state.paperFills }).map((row) => ({
    ...row,
    realizedSol: formatLamports(row.realizedLamports),
    virtual: true,
  }));
  return Response.json({
    book: "paper",
    available: true,
    period: windowName,
    startsAt: new Date(periodStart(nowMs, windowName)).toISOString(),
    rows,
    note: "Paper rankings use realized virtual results. They are not live trades and cannot be reset from this page.",
  }, { headers: { "Cache-Control": "no-store" } });
}
