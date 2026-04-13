"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { GameStationPlay } from "@/components/games/GameStationPlay";

const gridRows = 4;
const gridCols = 6;
const runnerHeight = 80;

function RunnerGame({ onGameEnd }: { onGameEnd: (score: number) => void }) {
  const [playerY, setPlayerY] = useState(0);
  const [obstacles, setObstacles] = useState<{ id: number; x: number; row: number }[]>([]);
  const [coins, setCoins] = useState<{ id: number; x: number; row: number }[]>([]);
  const [distance, setDistance] = useState(0);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const idRef = useRef(0);
  const animRef = useRef<number>(0);
  const speedRef = useRef(8);

  useEffect(() => {
    if (gameOver) return;
    const spawn = () => {
      if (Math.random() < 0.5) {
        setObstacles((o) => [...o, { id: ++idRef.current, x: 400, row: Math.floor(Math.random() * gridRows) }]);
      } else {
        setCoins((c) => [...c, { id: ++idRef.current, x: 400, row: Math.floor(Math.random() * gridRows) }]);
      }
    };
    const spawnId = setInterval(spawn, 900);
    return () => clearInterval(spawnId);
  }, [gameOver]);

  useEffect(() => {
    if (gameOver) return;
    const loop = () => {
      setDistance((d) => d + 1);
      speedRef.current = 8 + Math.floor(distance / 50) * 2;
      setObstacles((prev) => {
        const next = prev.map((o) => ({ ...o, x: o.x - speedRef.current })).filter((o) => o.x > -40);
        const hit = next.some((o) => o.x < 60 && o.x > 20 && o.row === playerY);
        if (hit) {
          setGameOver(true);
          onGameEnd(score + distance);
          return [];
        }
        return next;
      });
      setCoins((prev) => {
        const next = prev.map((o) => ({ ...o, x: o.x - speedRef.current })).filter((o) => o.x > -20);
        next.forEach((o) => {
          if (o.x < 70 && o.x > 30 && o.row === playerY) setScore((s) => s + 10);
        });
        return next.filter((o) => !(o.x < 70 && o.x > 30 && o.row === playerY));
      });
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [gameOver, playerY, score, distance, onGameEnd]);

  return (
    <div className="rounded-2xl border-2 border-[#39ff14]/50 bg-black/40 p-6" style={{ boxShadow: "0 0 40px rgba(57,255,20,0.15)" }}>
      <p className="text-[#39ff14] text-center mb-2">Distance: {distance} · Coins: {score}</p>
      <div className="relative w-full h-48 bg-black/60 rounded-xl overflow-hidden">
        {obstacles.map((o) => (
          <div key={o.id} className="absolute w-8 h-12 bg-red-500 rounded" style={{ left: o.x, top: o.row * (120 / gridRows) + 10 }} />
        ))}
        {coins.map((c) => (
          <div key={c.id} className="absolute w-6 h-6 rounded-full bg-yellow-400" style={{ left: c.x, top: c.row * (120 / gridRows) + 15 }} />
        ))}
        <div
          className="absolute left-8 w-10 h-10 bg-[#00f0ff] rounded-full flex items-center justify-center"
          style={{ top: playerY * (120 / gridRows) + 15, boxShadow: "0 0 15px rgba(0,240,255,0.6)" }}
        >
          ▶
        </div>
      </div>
      <div className="flex justify-center gap-2 mt-4">
        {[0, 1, 2, 3].map((row) => (
          <button key={row} type="button" onClick={() => setPlayerY(row)} className="flex-1 max-w-[80px] py-3 rounded-lg bg-[#39ff14]/20 border border-[#39ff14] text-[#39ff14] font-bold">
            Lane {row + 1}
          </button>
        ))}
      </div>
      <p className="text-white/60 text-center mt-2 text-sm">Collect coins, avoid obstacles. Score = distance + coins×10.</p>
    </div>
  );
}

export default function RunnerPage() {
  return (
    <GameStationPlay gameSlug="runner" gameName="Crypto Runner" costSc={5}>
      {({ onGameEnd }) => <RunnerGame onGameEnd={onGameEnd} />}
    </GameStationPlay>
  );
}
