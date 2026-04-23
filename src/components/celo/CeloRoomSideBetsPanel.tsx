"use client";

export type CeloSideBetRow = {
  id: string;
  bet_type: string;
  amount_cents: number;
  status: string;
  odds_multiplier: number;
  creator_id: string;
  acceptor_id: string | null;
  created_at: string;
};

type Props = {
  bets: CeloSideBetRow[];
  loading?: boolean;
  className?: string;
};

/**
 * Lists open/matched side entries from `celo_side_bets` (read-only; creation stays on API).
 */
export function CeloRoomSideBetsPanel({ bets, loading, className = "" }: Props) {
  return (
    <div className={`flex min-h-[100px] flex-1 flex-col border-b border-purple-500/20 ${className}`}>
      <div className="shrink-0 border-b border-white/5 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-200/80">
        Side entries
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <p className="text-center text-[11px] text-white/30">Loading…</p>
        ) : bets.length === 0 ? (
          <p className="text-center text-[11px] text-white/35">
            No open side entries. Side bets use table GPC; offers appear here when players post
            them.
          </p>
        ) : (
          <ul className="space-y-2 text-[11px]">
            {bets.map((b) => (
              <li
                key={b.id}
                className="rounded-lg border border-yellow-500/10 bg-black/20 px-2 py-1.5 text-[#9CA3AF]"
              >
                <span className="font-mono text-amber-200/90">{b.bet_type.replace(/_/g, " ")}</span>
                <span className="mx-1 text-white/40">·</span>
                {Math.max(0, b.amount_cents).toLocaleString()} GPC
                <span className="mx-1 text-white/40">@</span>
                {String(b.odds_multiplier)}×
                <div className="mt-0.5 text-[10px] uppercase text-white/30">{b.status}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
