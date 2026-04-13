"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { GameStationPlay } from "@/components/games/GameStationPlay";

const emojiList = ["🎮", "🌟", "💎", "🔥", "⚡", "🎯", "👾", "🃏"];
const gridSize = 4; // 4x4 = 8 pairs

function shuffle<T>(a: T[]): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function MemoryGame({ onGameEnd }: { onGameEnd: (score: number) => void }) {
  const [cards] = useState(() => {
    const pairs = [...emojiList.slice(0, (gridSize * gridSize) / 2), ...emojiList.slice(0, (gridSize * gridSize) / 2)];
    return shuffle(pairs).map((emoji, id) => ({ id, emoji }));
  });
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matchedIndices, setMatchedIndices] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [lock, setLock] = useState(false);
  const doneRef = useRef(false);

  const handleCard = useCallback(
    (index: number) => {
      if (lock || matchedIndices.has(index) || flipped.includes(index) || flipped.length >= 2) return;
      const next = [...flipped, index];
      setFlipped(next);
      const newMoves = moves + 1;
      setMoves(newMoves);
      if (next.length === 2) {
        setLock(true);
        const [a, b] = next;
        if (cards[a].emoji === cards[b].emoji) {
          setMatchedIndices((prev) => {
            const nextSet = new Set(Array.from(prev).concat([a, b]));
            if (nextSet.size === cards.length && !doneRef.current) {
              doneRef.current = true;
              onGameEnd(Math.max(100, 1000 - newMoves * 15));
            }
            return nextSet;
          });
          setFlipped([]);
          setLock(false);
        } else {
          setTimeout(() => { setFlipped([]); setLock(false); }, 600);
        }
      }
    },
    [cards, flipped, lock, matchedIndices, moves, onGameEnd]
  );

  const displayCards = useMemo(() => cards.map((c, i) => ({ ...c, index: i })), [cards]);
  const isVisible = (i: number) => matchedIndices.has(i) || flipped.includes(i);

  return (
    <div className="rounded-2xl border-2 border-[#00d4ff]/50 bg-black/40 p-6" style={{ boxShadow: "0 0 40px rgba(0,212,255,0.15)" }}>
      <p className="text-[#00d4ff] text-center mb-4">Moves: {moves}</p>
      <div className="grid grid-cols-4 gap-2 max-w-xs mx-auto">
        {displayCards.map((card, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleCard(card.index)}
            disabled={lock || matchedIndices.has(card.index)}
            className="aspect-square rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all touch-manipulation"
            style={{
              backgroundColor: isVisible(i) ? "rgba(0,212,255,0.3)" : "rgba(0,0,0,0.5)",
              borderColor: "#00d4ff",
            }}
          >
            {isVisible(i) ? card.emoji : "?"}
          </button>
        ))}
      </div>
      <p className="text-white/60 text-center mt-4 text-sm">Match all pairs. Score = 1000 − (moves × 15)</p>
    </div>
  );
}

export default function MemoryPage() {
  return (
    <GameStationPlay gameSlug="memory" gameName="Memory Match" costSc={5}>
      {({ onGameEnd }) => <MemoryGame onGameEnd={onGameEnd} />}
    </GameStationPlay>
  );
}
