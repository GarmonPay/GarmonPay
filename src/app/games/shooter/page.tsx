"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { GameStationPlay } from "@/components/games/GameStationPlay";

const DURATION_MS = 20000;
const TARGET_SIZE = 60;

function ShooterGame({ onGameEnd }: { onGameEnd: (score: number) => void }) {
  const [targets, setTargets] = useState<{ id: number; x: number; y: number }[]>([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DURATION_MS / 1000);
  const [running, setRunning] = useState(true);
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addTarget = useCallback(() => {
    setTargets((t) => [...t, { id: ++idRef.current, x: Math.random() * (100 - 20) + 10, y: Math.random() * (80 - 15) + 10 }]);
  }, []);

  useEffect(() => {
    if (!running) return;
    addTarget();
    spawnRef.current = setInterval(addTarget, 1500);
    return () => {
      if (spawnRef.current) clearInterval(spawnRef.current);
    };
  }, [running, addTarget]);

  useEffect(() => {
    if (!running) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setRunning(false);
          onGameEnd(score);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running, score, onGameEnd]);

  const hit = (id: number) => {
    if (!running) return;
    setTargets((t) => t.filter((x) => x.id !== id));
    const mult = Math.min(combo + 1, 5);
    setCombo((c) => c + 1);
    setScore((s) => s + 10 * mult);
    setTimeout(() => setCombo((c) => Math.max(0, c - 1)), 1500);
  };

  return (
    <div className="rounded-2xl border-2 border-[#ffaa00]/50 bg-black/40 p-6" style={{ boxShadow: "0 0 40px rgba(255,170,0,0.15)" }}>
      <p className="text-[#ffaa00] text-center mb-2">Time: {timeLeft}s · Score: {score} · Combo: x{combo + 1}</p>
      <div
        className="relative w-full h-80 rounded-xl overflow-hidden bg-black/60 cursor-crosshair"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          targets.forEach((t) => {
            if (Math.abs(t.x - x) < 8 && Math.abs(t.y - y) < 8) hit(t.id);
          });
        }}
      >
        {targets.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); hit(t.id); }}
            className="absolute rounded-full bg-[#ffaa00] border-2 border-yellow-300 flex items-center justify-center text-white font-bold text-lg"
            style={{
              width: TARGET_SIZE,
              height: TARGET_SIZE,
              left: `${t.x}%`,
              top: `${t.y}%`,
              transform: "translate(-50%, -50%)",
              boxShadow: "0 0 20px rgba(255,170,0,0.5)",
            }}
          >
            $
          </button>
        ))}
      </div>
      <p className="text-white/60 text-center mt-2 text-sm">Click tokens. Combo multiplies points (max 5×).</p>
    </div>
  );
}

export default function ShooterPage() {
  return (
    <GameStationPlay gameSlug="shooter" gameName="Token Shooter" costCents={5}>
      {({ onGameEnd }) => <ShooterGame onGameEnd={onGameEnd} />}
    </GameStationPlay>
  );
}
