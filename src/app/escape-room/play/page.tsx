import { Suspense } from "react";
import { EscapeRoomPlayClient } from "@/components/escape-room/EscapeRoomPlayClient";

export default function EscapeRoomPlayPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-6xl px-4 py-6">
          <div className="rounded-xl border border-white/10 bg-fintech-bg-card/70 p-6 text-fintech-muted">
            Loading vault...
          </div>
        </main>
      }
    >
      <EscapeRoomPlayClient />
    </Suspense>
  );
}

