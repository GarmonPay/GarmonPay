"use client";
import { useState } from "react";
import { GAME_LOBBY } from "@/config/game-lobby";
import { GameCard } from "./GameCard";
const categories = ["All", "Multiplayer", "Arcade", "Coming Soon"] as const;
type Category = (typeof categories)[number];
export function GameCatalog() {
  const [category, setCategory] = useState<Category>("All");
  const games = GAME_LOBBY.filter(game => category === "All" || (category === "Coming Soon" ? !game.available : category === "Multiplayer" ? ["garmondrop", "coinflip"].includes(game.id) : ["spin", "scratch", "pinball", "mystery"].includes(game.id)));
  return <section className="gp-game-catalog" aria-label="Game catalog">
    <div className="gp-game-categories" role="group" aria-label="Game categories">{categories.map(label => <button type="button" key={label} aria-pressed={category === label} onClick={() => setCategory(label)}>{label}</button>)}</div>
    <div className="gp-game-grid gp-lobby-grid">{games.map(game => <GameCard key={game.id} game={game}/>)}</div>
    <p className="gp-catalog-note">Game funding, entry payments and settlement remain paused. You can explore available game pages; upcoming games remain unavailable. Existing game rules and historical records are preserved.</p>
  </section>;
}
