"use client";

export function FightHUD({
  nameLeft,
  nameRight,
  healthLeft,
  healthRight,
  staminaLeft,
  staminaRight,
  loading,
}: {
  nameLeft: string;
  nameRight: string;
  healthLeft: number;
  healthRight: number;
  staminaLeft: number;
  staminaRight: number;
  loading?: boolean;
}) {
  const bar = (pct: number, color: string) => (
    <div className="h-2 rounded-full bg-black/50 overflow-hidden border border-white/10">
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-out"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: `linear-gradient(90deg, ${color}cc, ${color})`,
          boxShadow: `0 0 12px ${color}55`,
        }}
      />
    </div>
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-4 pt-3 pb-2 bg-gradient-to-b from-black/75 via-black/35 to-transparent">
      {loading && (
        <div className="text-center text-[10px] tracking-[0.25em] text-amber-400/90 mb-2 font-medium">
          LOADING MESHY ASSETS…
        </div>
      )}
      <div className="flex justify-between gap-6 max-w-4xl mx-auto">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-white text-xs font-bold truncate uppercase tracking-wide">{nameLeft}</span>
            <span className="text-[10px] text-zinc-400 tabular-nums">{Math.round(healthLeft)} HP</span>
          </div>
          {bar(healthLeft, "#3b82f6")}
          <div className="flex items-center justify-between gap-2 mt-2 mb-0.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Stamina</span>
            <span className="text-[10px] text-zinc-500 tabular-nums">{Math.round(staminaLeft)}</span>
          </div>
          {bar(staminaLeft, "#22c55e")}
        </div>
        <div className="flex-1 min-w-0 text-right">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] text-zinc-400 tabular-nums">{Math.round(healthRight)} HP</span>
            <span className="text-white text-xs font-bold truncate uppercase tracking-wide">{nameRight}</span>
          </div>
          {bar(healthRight, "#ef4444")}
          <div className="flex items-center justify-between gap-2 mt-2 mb-0.5">
            <span className="text-[10px] text-zinc-500 tabular-nums">{Math.round(staminaRight)}</span>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Stamina</span>
          </div>
          {bar(staminaRight, "#84cc16")}
        </div>
      </div>
    </div>
  );
}
