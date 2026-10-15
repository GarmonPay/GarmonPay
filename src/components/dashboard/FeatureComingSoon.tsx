import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { GameArtwork } from "@/components/ui/GameCard";
import { StatusBadge } from "@/components/ui/garmon-ui";
type Props={emoji:string;title:string;description:string};
export function FeatureComingSoon({emoji,title,description}:Props){const kind=title.toLowerCase().includes("pinball")?"pinball":title.toLowerCase().includes("spin")?"spin":title.toLowerCase().includes("arena")?"boxing":"mystery";return <section className="gp-surface gp-coming-soon"><GameArtwork kind={kind}/><StatusBadge tone="gold"><LockKeyhole size={12}/>COMING SOON</StatusBadge><h1>{title}</h1><p>{description}</p><div className="flex flex-wrap justify-center gap-3"><Link href="/dashboard/games" className="gp-button gp-button-violet">Explore available games</Link><Link href="/dashboard" className="gp-button gp-button-ghost">Back to dashboard</Link></div><span className="sr-only">{emoji}</span></section>;}
