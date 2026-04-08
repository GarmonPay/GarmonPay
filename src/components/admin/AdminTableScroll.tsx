"use client";

/** Scroll hint + horizontal scroll wrapper; 0.8rem table text on viewports under 640px. */
export function AdminScrollHint() {
  return (
    <p className="mb-2 text-xs text-fintech-muted block min-[640px]:hidden" role="note">
      Scroll to see more →
    </p>
  );
}

export function AdminTableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-1 max-[639px]:[&_td]:text-[0.8rem] max-[639px]:[&_th]:text-[0.8rem]">
      {children}
    </div>
  );
}
