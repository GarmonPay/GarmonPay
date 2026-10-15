import { formatLamports } from "@/lib/member-platform/economics";
import { rankVerifiedLive } from "@/lib/member-platform/leaderboard";
import { loadPaperRankings } from "@/lib/member-platform/wallet-account";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const book = url.searchParams.get("book") === "live" ? "live" : "paper";
  const period = url.searchParams.get("period");
  const windowName = period === "weekly" || period === "monthly" ? period : "daily";
  if (book === "live") {
    const live = rankVerifiedLive();
    return Response.json({ ...live, period: windowName }, { headers: { "Cache-Control": "no-store" } });
  }
  const rankings = await loadPaperRankings(windowName);
  const rows = rankings.rows.map((row) => ({
    ...row,
    realizedSol: formatLamports(row.realizedLamports),
    virtual: true as const,
  }));
  return Response.json({
    book: "paper",
    available: rankings.persistence === "ready",
    period: windowName,
    rows,
    note: rankings.persistence === "ready"
      ? "Paper rankings use realized virtual results. They are not live trades and cannot be reset from this page."
      : "Paper rankings stay empty until verified paper fills are stored. Nothing is estimated.",
  }, { headers: { "Cache-Control": "no-store" } });
}
