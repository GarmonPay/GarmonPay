"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";

export default function FightArenaPage() {
  const router = useRouter();
  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) router.replace("/login?next=/dashboard/fight-arena");
    });
  }, [router]);

  return (
    <div className="arena-bg min-h-[60vh] rounded-2xl p-6 tablet:p-8">
      <div className="mx-auto max-w-xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white tablet:text-4xl">Fight Arena</h1>
        <p className="mt-2 text-fintech-muted">
          Create or join fights. Entry fee from your wallet. Winner takes the pot.
        </p>
        <div className="mt-8">
          <Link
            href="/dashboard/fight-arena/lobby"
            className="min-h-touch inline-flex items-center justify-center rounded-xl bg-amber-500/90 px-6 py-3 font-semibold text-black hover:bg-amber-400 arena-glow"
          >
            Enter Lobby
          </Link>
        </div>
        <div className="arena-border mt-10 rounded-xl border p-4 text-left">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400/90">How it works</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-fintech-muted">
            <li>Create a fight and set the entry fee (min $1).</li>
            <li>Your entry is held in escrow until someone joins.</li>
            <li>When a second player joins, the match is active.</li>
            <li>Winner receives the pot minus a small platform fee.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
