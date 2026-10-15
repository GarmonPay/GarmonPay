import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
/** Artwork is decorative. All actions use existing application routes. */
export function CinematicHero({ publicView = false }: { publicView?: boolean }) {
  return <section className="gp-cinematic-hero" aria-label="GarmonPay games and rewards">
    <div className="gp-cinematic-copy">
      <h1>PLAY. EARN.<br/><span>BE REWARDED.</span></h1>
      <p>Games. Videos. Rewards. Your community.</p>
      <div className="gp-hero-actions">
        <Link href={publicView ? "/games" : "/dashboard/games"} className="gp-button gp-button-gold">Play Games <ArrowRight size={16}/></Link>
        <Link href="/dashboard/earn" className="gp-button gp-button-ghost"><Play size={15}/>Watch &amp; Earn</Link>
      </div>
    </div>
  </section>;
}
