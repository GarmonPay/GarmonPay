"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { GameStationPlay } from "@/components/games/GameStationPlay";

const GRID = 12;
const CELL = 24;

function SnakeGame({ onGameEnd }: { onGameEnd: (score: number) => void }) {
  const [snake, setSnake] = useState<{ x: number; y: number }[]>([{ x: 6, y: 6 }]);
  const [dir, setDir] = useState<"U" | "D" | "L" | "R">("R");
  const [food, setFood] = useState({ x: 3, y: 3 });
  const [score, setScore] = useState(0);
  const [dead, setDead] = useState(false);
  const dirRef = useRef(dir);
  dirRef.current = dir;

  const newFood = useCallback(() => ({ x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) }), []);

  useEffect(() => {
    if (dead) return;
    const id = setInterval(() => {
      setSnake((s) => {
        const head = s[0];
        let nx = head.x;
        let ny = head.y;
        const d = dirRef.current;
        if (d === "U") ny--;
        if (d === "D") ny++;
        if (d === "L") nx--;
        if (d === "R") nx++;
        if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) {
          setDead(true);
          onGameEnd(score + s.length);
          return s;
        }
        const body = s.slice(0, -1);
        if (body.some((b) => b.x === nx && b.y === ny)) {
          setDead(true);
          onGameEnd(score + s.length);
          return s;
        }
        const newSnake = [{ x: nx, y: ny }, ...s];
        if (nx === food.x && ny === food.y) {
          setScore((sc) => sc + 20);
          setFood(newFood());
          return newSnake;
        }
        return newSnake.slice(0, -1);
      });
    }, 180);
    return () => clearInterval(id);
  }, [dead, food, newFood, onGameEnd, score]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (dead) return;
      if (e.key === "ArrowUp" && dirRef.current !== "D") setDir("U");
      if (e.key === "ArrowDown" && dirRef.current !== "U") setDir("D");
      if (e.key === "ArrowLeft" && dirRef.current !== "R") setDir("L");
      if (e.key === "ArrowRight" && dirRef.current !== "L") setDir("R");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dead]);

  return (
    <div className="rounded-2xl border-2 border-[#bf00ff]/50 bg-black/40 p-6" style={{ boxShadow: "0 0 40px rgba(191,0,255,0.15)" }}>
      <p className="text-[#bf00ff] text-center mb-2">Score: {score + snake.length * 20}</p>
      <div className="flex justify-center">
        <div
          className="relative rounded-lg overflow-hidden"
          style={{ width: GRID * CELL, height: GRID * CELL, background: "#0a0a12" }}
        >
          {snake.map((s, i) => (
            <div
              key={i}
              className="absolute rounded-sm"
              style={{
                left: s.x * CELL,
                top: s.y * CELL,
                width: CELL - 2,
                height: CELL - 2,
                background: i === 0 ? "#39ff14" : "#bf00ff",
                boxShadow: "0 0 8px currentColor",
              }}
            />
          ))}
          <div
            className="absolute rounded-full bg-[#ffd700]"
            style={{ left: food.x * CELL + 4, top: food.y * CELL + 4, width: CELL - 8, height: CELL - 8 }}
          />
        </div>
      </div>
      <div className="flex justify-center gap-2 mt-4">
        <button type="button" onClick={() => dir !== "D" && setDir("U")} className="px-4 py-2 rounded bg-[#bf00ff]/30 text-white">↑</button>
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => dir !== "R" && setDir("L")} className="px-4 py-1 rounded bg-[#bf00ff]/30 text-white">←</button>
          <button type="button" onClick={() => dir !== "L" && setDir("R")} className="px-4 py-1 rounded bg-[#bf00ff]/30 text-white">→</button>
        </div>
        <button type="button" onClick={() => dir !== "U" && setDir("D")} className="px-4 py-2 rounded bg-[#bf00ff]/30 text-white">↓</button>
      </div>
      <p className="text-white/60 text-center mt-2 text-sm">Eat gold. Avoid walls and yourself. Arrow keys or buttons.</p>
    </div>
  );
}

export default function SnakePage() {
  return (
    <GameStationPlay gameSlug="snake" gameName="Neon Snake" costCents={5}>
      {({ onGameEnd }) => <SnakeGame onGameEnd={onGameEnd} />}
    </GameStationPlay>
  );
}
