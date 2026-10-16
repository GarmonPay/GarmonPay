import { formatLamports } from "@/lib/member-platform/economics";
import { periodStart, rankVerifiedLive } from "@/lib/member-platform/leaderboard";
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
  const start = url.searchParams.get("start");
  let archiveStart: string | undefined;
  if (start) {
    const at = /^\d{4}-\d{2}-\d{2}$/.test(start) ? Date.parse(start + "T00:00:00.000Z") : NaN;
    if (!Number.isFinite(at) || periodStart(at, windowName) !== at || new Date(at).toISOString().slice(0, 10) !== start) {
      return Response.json({ error: "Choose the UTC period start: a day, Monday, or the first of a month." }, { status: 400 });
    }
    archiveStart = new Date(at).toISOString();
  }
  const rankings = await loadPaperRankings(windowName, archiveStart);
  const rows = rankings.rows.map((row) => ({
    ...row,
    unrealizedSol: row.unrealizedLamports ? formatLamports(row.unrealizedLamports) : null,
    realizedSol: formatLamports(row.realizedLamports),
    virtual: true as const,
  }));
  return Response.json({
    book: "paper",
    available: rankings.persistence === "ready",
    period: windowName,
    archiveStart: archiveStart ?? null,
    rows,
    note: archiveStart ? "Closed-period archive. Only finalized immutable snapshots are shown; an unavailable archive is not estimated." : rankings.persistence === "ready"
      ? "Paper rankings use net liquidation equity, including realized and unrealized returns after modeled costs. Entries need prospective eligibility and fresh marks at both period boundaries; UTC windows. No resets."
      : "Paper rankings stay empty until verified paper fills are stored. Nothing is estimated.",
  }, { headers: { "Cache-Control": "no-store" } });
}
