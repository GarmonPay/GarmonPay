import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function CeloRoomLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "#05010F",
      }}
    >
      {children}
    </div>
  );
}
