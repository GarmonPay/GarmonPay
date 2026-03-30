"use client";

import type { ReactNode } from "react";

type FighterShowcasePanelProps = {
  minHeight: number;
  children: ReactNode;
  /** Label above the figure (optional). */
  label?: string;
};

export default function FighterShowcasePanel({ minHeight, children, label }: FighterShowcasePanelProps) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      style={{ minHeight }}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0f121c] via-[#080a10] to-[#05060a]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-[58%] h-[min(85%,420px)] w-[min(92%,420px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(240,165,0,0.2)_0%,rgba(120,80,200,0.08)_45%,transparent_70%)] blur-2xl"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_80%_at_50%_100%,rgba(20,24,40,0.5),transparent_55%)]" aria-hidden />
      <div className="relative z-10 flex h-full w-full min-h-0 flex-col items-center px-3 pb-3 pt-4">
        {label ? (
          <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400/90">
            {label}
          </p>
        ) : null}
        <div className="flex w-full flex-1 items-end justify-center">{children}</div>
      </div>
    </div>
  );
}
