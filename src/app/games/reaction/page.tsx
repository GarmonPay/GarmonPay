"use client";

import { useState, useRef, useCallback } from "react";
import { GameStationPlay } from "@/components/games/GameStationPlay";

function ReactionGame({ onGameEnd }: { onGameEnd: (score: number) => void }) {
  const [phase, setPhase] = useState<"idle" | "wait" | "go">("idle");
  const [result, setResult] = useState<number | null>(null);
  const goAt = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startRound = useCallback(() => {
    setResult(null);
    setPhase("wait");
    const delay = 2000 + Math.random() * 3000;
    timeoutRef.current = setTimeout(() => {
      setPhase("go");
      goAt.current = Date.now();
    }, delay);
  }, []);

  const handleTap = useCallback(() => {
    if (phase === "go") {
      const ms = Date.now() - goAt.current;
      const score = Math.max(1, Math.floor(10000 - ms));
      setResult(ms);
      onGameEnd(score);
      setPhase("idle");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } else if (phase === "wait") {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setPhase("idle");
    }
  }, [phase, onGameEnd]);

  if (phase === "idle" && result === null) {
    return (
      <div className="rounded-2xl border-2 border-[#ff6600]/50 bg-black/40 p-8 text-center">
        <p className="text-[#ff6600] mb-4">Wait for green then tap as fast as you can!</p>
        <button
          type="button"
          onClick={startRound}
          className="px-8 py-4 rounded-xl bg-[#ff6600]/20 border-2 border-[#ff6600] text-[#ff6600] font-bold"
        >
          Start
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 bg-black/40 p-8 text-center" style={{ borderColor: phase === "go" ? "#39ff14" : "rgba(255,102,0,0.5)", boxShadow: phase === "go" ? "0 0 50px rgba(57,255,20,0.4)" : undefined }}>
      <button
        type="button"
        onClick={handleTap}
        className="w-full py-24 rounded-2xl font-bold text-2xl touch-manipulation transition-all"
        style={{
          backgroundColor: phase === "go" ? "rgba(57,255,20,0.3)" : "rgba(100,100,100,0.2)",
          color: phase === "go" ? "#39ff14" : "#fff",
          border: `2px solid ${phase === "go" ? "#39ff14" : "rgba(255,255,255,0.2)"}`,
        }}
      >
        {phase === "go" ? "TAP NOW!" : phase === "wait" ? "Wait for green…" : "Tap to start"}
      </button>
      {result != null && <p className="text-[#00f0ff] mt-4">Reaction: {result}ms → Score: {Math.max(1, 10000 - result)}</p>}
    </div>
  );
}

export default function ReactionPage() {
  return (
    <GameStationPlay gameSlug="reaction" gameName="Reaction Test" costCents={5}>
      {({ onGameEnd }) => <ReactionGame onGameEnd={onGameEnd} />}
    </GameStationPlay>
  );
}
