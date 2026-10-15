import Link from "next/link";
import { ChevronRight, LockKeyhole } from "lucide-react";
import type { GAME_LOBBY } from "@/config/game-lobby";
type Game = (typeof GAME_LOBBY)[number];
/** Decorative game artwork, never a playable or randomly generated result. */
export function GameArtwork({ kind }: { kind: string; instance?: string }) {
  const supported = ["garmondrop", "coinflip", "boxing", "spin", "scratch", "pinball", "mystery"];
  return <img className={`gp-game-art gp-art-${kind}`} src={`/images/garmon-master/${supported.includes(kind) ? kind : "mystery"}.webp`} alt="" loading="lazy" decoding="async" width={640} height={426}/>;
}
export function GameCard({ game }: { game: Game }) {
  return <Link className={`gp-game-card ${game.available ? "" : "gp-game-soon"}`} href={game.href}>
    <div className="gp-game-cover"><GameArtwork kind={game.id}/></div>
    <div className="gp-game-body"><h3>{game.name}</h3><p>{game.tag.split(" · ")[0]}</p><span className={`gp-game-cta ${game.available ? "gp-play-now" : "gp-coming-label"}`}>{game.available ? "Explore Game" : "Coming Soon"}{!game.available && <LockKeyhole size={12}/>}</span></div>
    <ChevronRight className="gp-game-chevron" size={18} aria-hidden/>
  </Link>;
}
