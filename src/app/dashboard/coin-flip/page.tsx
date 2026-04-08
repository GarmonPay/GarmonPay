'use client'

import dynamic from "next/dynamic";

const CoinFlipPanel = dynamic(() => import("@/components/games/CoinFlipPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[500px] text-fintech-muted animate-pulse">Loading...</div>
  ),
});

export default function CoinFlipPage() {
  return <CoinFlipPanel />;
}
