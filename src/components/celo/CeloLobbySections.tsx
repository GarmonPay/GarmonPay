"use client";

type LiveStripVariant = "live" | "empty" | "reconnect";

export function CeloLiveStatusStrip({
  variant,
  roomCount,
  playerCount,
  className = "",
}: {
  variant: LiveStripVariant;
  roomCount: number;
  playerCount: number;
  className?: string;
}) {
  const base =
    "flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:justify-between sm:text-left";

  if (variant === "reconnect") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`${base} border-amber-500/35 bg-gradient-to-r from-amber-950/90 via-[#1a0f08] to-amber-950/80 ${className}`}
      >
        <span className="text-lg" aria-hidden>
          ⚠️
        </span>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-[13px] font-semibold tracking-tight text-amber-100">Rooms temporarily unavailable</p>
          <p className="font-mono text-[11px] text-amber-200/80">We&apos;re reconnecting now…</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-amber-400/25 border-t-amber-300"
            aria-hidden
          />
          <span className="hidden font-mono text-[10px] uppercase tracking-wider text-slate-500 sm:inline">
            Auto-retry
          </span>
        </div>
      </div>
    );
  }

  if (variant === "live") {
    return (
      <div
        className={`${base} border-emerald-500/30 bg-gradient-to-r from-emerald-950/50 via-[#0a1620] to-emerald-950/40 shadow-[0_0_40px_rgba(16,185,129,0.08)] ${className}`}
      >
        <span className="shrink-0 text-base leading-none" aria-hidden>
          🟢
        </span>
        <span className="relative hidden h-2 w-2 shrink-0 sm:inline-flex">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <p className="font-mono text-[12px] font-semibold tracking-wide text-emerald-100/95 sm:flex-1">
          <span className="text-emerald-300">LIVE</span>
          <span className="text-emerald-100/85">
            {" "}
            · {roomCount} room{roomCount === 1 ? "" : "s"} active · {playerCount} player
            {playerCount === 1 ? "" : "s"} in lobby
          </span>
        </p>
      </div>
    );
  }

  return (
    <div
      className={`${base} border-amber-400/25 bg-gradient-to-r from-amber-950/40 via-[#141008] to-violet-950/30 ${className}`}
    >
      <span className="text-base" aria-hidden>
        🟡
      </span>
      <p className="font-mono text-[12px] font-semibold leading-snug text-amber-100/90 sm:flex-1">
        No active rooms yet — start the first table
      </p>
    </div>
  );
}

export function CeloReadinessPanel({
  goldCoins,
  gpayCoins,
  minEntrySc,
  formatGPC,
  className = "",
}: {
  goldCoins: number;
  gpayCoins: number;
  minEntrySc: number;
  formatGPC: (n: number) => string;
  className?: string;
}) {
  const ready = gpayCoins >= minEntrySc;
  return (
    <div
      className={`rounded-xl border border-violet-500/25 bg-black/45 px-3 py-3 shadow-[0_0_0_1px_rgba(245,200,66,0.06),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm ${className}`}
    >
      <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
        Your balances · table readiness
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2 font-mono text-[11px]">
        <div className="rounded-lg border border-amber-500/15 bg-black/35 px-2 py-1.5">
          <span className="block text-[9px] font-bold uppercase tracking-wider text-amber-200/60">Gold Coins</span>
          <span className="tabular-nums text-amber-100/95">{goldCoins.toLocaleString()} GC</span>
        </div>
        <div className="rounded-lg border border-violet-500/20 bg-black/35 px-2 py-1.5">
          <span className="block text-[9px] font-bold uppercase tracking-wider text-violet-300/70">GPay Coins</span>
          <span className="tabular-nums text-violet-100/95">{formatGPC(gpayCoins)}</span>
        </div>
      </div>
      {ready ? (
        <p className="border-t border-white/5 pt-2 text-[13px] font-medium leading-snug text-slate-200">
          <span className="text-emerald-300/95">Ready to play</span>
          <span className="text-slate-500"> — bank from your GPC when you open a table.</span>
        </p>
      ) : (
        <p className="border-t border-white/5 pt-2 text-[13px] font-medium leading-snug text-slate-200">
          <span className="text-amber-200/95">Add GPC to take a seat</span>
          <span className="text-slate-500"> — min. entry </span>
          <span className="font-mono text-violet-200/90">${(minEntrySc / 100).toFixed(2)}</span>
        </p>
      )}
    </div>
  );
}

/** Shown in the rooms list area while the lobby cannot load rooms (auto-retry continues). */
export function CeloRoomsReconnectCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-950/50 via-[#120a08] to-violet-950/30 p-8 text-center shadow-[0_20px_50px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)] ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-2xl">
        🎲
      </div>
      <h3 className="mb-1 text-[15px] font-semibold tracking-tight text-amber-100">Rooms temporarily unavailable</h3>
      <p className="mb-4 text-[13px] leading-relaxed text-amber-200/75">We&apos;re reconnecting now — your session stays safe.</p>
      <div className="flex items-center justify-center gap-2 text-[11px] font-mono uppercase tracking-wider text-slate-500">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400/25 border-t-amber-300"
          aria-hidden
        />
        Auto-retry active
      </div>
    </div>
  );
}

export function CeloEmptyRoomsCard({
  onStart,
  cinzelClassName,
}: {
  onStart: () => void;
  cinzelClassName: string;
}) {
  return (
    <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-b from-[#12081f]/95 to-[#06020d] p-8 text-center shadow-[0_24px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/5 text-3xl shadow-[0_0_32px_rgba(245,200,66,0.12)]">
        🎲
      </div>
      <h3 className={`${cinzelClassName} mb-2 text-lg font-bold tracking-tight text-slate-100`}>No live rooms right now</h3>
      <p className="mb-6 text-[14px] leading-relaxed text-slate-400">Start the first table and set the tone.</p>
      <button
        type="button"
        onClick={onStart}
        className="celo-btn-primary inline-flex min-h-[52px] w-full max-w-xs items-center justify-center rounded-xl border border-amber-200/40 bg-gradient-to-b from-amber-100 via-amber-400 to-amber-700 px-6 text-[15px] font-bold tracking-wide text-[#0a0610] shadow-[0_4px_0_rgba(120,80,10,0.5),0_12px_36px_rgba(245,200,66,0.25)] transition hover:brightness-105 active:translate-y-px sm:w-auto"
      >
        🎲 Start a Game
      </button>
    </div>
  );
}
