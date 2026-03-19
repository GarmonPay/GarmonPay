"use client";

import { useState, useRef, useEffect } from "react";
import { GameStationPlay } from "@/components/games/GameStationPlay";

const roundMs = 30000;

function TapGame({ onGameEnd }: { onGameEnd: (score: number) => void }) {
  const [count, setCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(roundMs / 1000);
  const [running, setRunning] = useState(true);
  const countRef = useRef(0);
  countRef.current = count;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setRunning(false);
          onGameEnd(countRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running, count, onGameEnd]);

  return (
    <div className="rounded-2xl border-2 border-[#00ff88]/50 bg-black/40 p-8 text-center" style={{ boxShadow: "0 0 40px rgba(0,255,136,0.15)" }}>
      <p className="text-[#00ff88] text-2xl font-mono mb-2">{timeLeft}s</p>
      <p className="text-white/70 text-sm mb-6">Tap as fast as you can!</p>
      <button
        type="button"
        onClick={() => running && setCount((c) => c + 1)}
        className="w-full max-w-md mx-auto py-16 rounded-2xl bg-[#00ff88]/20 border-2 border-[#00ff88] text-5xl font-black text-[#00ff88] touch-manipulation select-none active:scale-95 transition-transform"
        style={{ boxShadow: "0 0 30px rgba(0,255,136,0.3)" }}
      >
        {count}
      </button>
      <p className="text-white/60 mt-4 text-sm">Taps = score</p>
    </div>
  );
}

export default function TapPage() {
  return (
    <GameStationPlay gameSlug="tap" gameName="Speed Tap Challenge" costCents={5}>
      {({ onGameEnd }) => <TapGame onGameEnd={onGameEnd} />}
    </GameStationPlay>
  );
}
