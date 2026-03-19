"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { GameStationPlay } from "@/components/games/GameStationPlay";

const laneCount = 3;
const fallSpeed = 4;
const spawnIntervalMs = 1200;

function DodgeGame({ onGameEnd }: { onGameEnd: (score: number) => void }) {
  const [playerX, setPlayerX] = useState(1);
  const [obstacles, setObstacles] = useState<{ id: number; lane: number; y: number }[]>([]);
  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(true);
  const idRef = useRef(0);
  const spawnRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameLoopRef = useRef<number | null>(null);
  const startTime = useRef(Date.now());

  useEffect(() => {
    if (!running) return;
    spawnRef.current = setInterval(() => {
      setObstacles((o) => [...o, { id: ++idRef.current, lane: Math.floor(Math.random() * laneCount), y: 0 }]);
    }, spawnIntervalMs);
    return () => {
      if (spawnRef.current) clearInterval(spawnRef.current);
    };
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const loop = () => {
      setObstacles((prev) => {
        const next = prev
          .map((o) => ({ ...o, y: o.y + fallSpeed }))
          .filter((o) => o.y < 320);
        const hit = next.some((o) => o.lane === playerX && o.y >= 240 && o.y <= 280);
        if (hit) {
          setRunning(false);
          const elapsed = (Date.now() - startTime.current) / 1000;
          onGameEnd(Math.floor(elapsed * 10));
          return [];
        }
        return next;
      });
      setScore((s) => s + 1);
      gameLoopRef.current = requestAnimationFrame(loop);
    };
    gameLoopRef.current = requestAnimationFrame(loop);
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [running, playerX, onGameEnd]);

  if (!running && score === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-[#ff00ff]/50 bg-black/40 p-6" style={{ boxShadow: "0 0 40px rgba(255,0,255,0.15)" }}>
      <p className="text-[#ff00ff] text-center mb-2">Score: {score} — Survive!</p>
      <div className="relative w-full h-72 bg-black/60 rounded-xl overflow-hidden">
        {obstacles.map((o) => (
          <div
            key={o.id}
            className="absolute w-1/3 h-10 bg-red-500/80 rounded"
            style={{ left: `${(o.lane / laneCount) * 100}%`, top: o.y }}
          />
        ))}
        <div
          className="absolute bottom-4 left-0 w-1/3 h-12 bg-[#00f0ff] rounded flex items-center justify-center transition-all duration-100"
          style={{ left: `${(playerX / laneCount) * 100}%`, boxShadow: "0 0 20px rgba(0,240,255,0.6)" }}
        >
          ▲
        </div>
      </div>
      <div className="flex justify-center gap-4 mt-4">
        {[0, 1, 2].map((lane) => (
          <button
            key={lane}
            type="button"
            onClick={() => setPlayerX(lane)}
            className="flex-1 max-w-[100px] py-3 rounded-xl bg-[#ff00ff]/20 border-2 border-[#ff00ff] text-[#ff00ff] font-bold"
          >
            {lane === 0 ? "←" : lane === 1 ? "◎" : "→"}
          </button>
        ))}
      </div>
      <p className="text-white/60 text-center mt-2 text-sm">Move to avoid red blocks. Score = time × 10.</p>
    </div>
  );
}

export default function DodgePage() {
  return (
    <GameStationPlay gameSlug="dodge" gameName="Dodge Arena" costCents={5}>
      {({ onGameEnd }) => <DodgeGame onGameEnd={onGameEnd} />}
    </GameStationPlay>
  );
}
