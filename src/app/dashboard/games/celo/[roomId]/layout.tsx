import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function CeloRoomLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[30] flex min-h-0 min-w-0 flex-col overflow-x-hidden bg-[#0e0118] pt-[var(--dashboard-top-stack-height,4rem)] pb-[calc(5rem+env(safe-area-inset-bottom,0px))] tablet:pb-0">
      {children}
    </div>
  );
}
