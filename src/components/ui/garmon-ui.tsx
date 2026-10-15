import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, Coins, Gem, Hexagon, Sparkles, Crown } from "lucide-react";
import { localeInt } from "@/lib/format-number";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="gp-page-heading"><div>{eyebrow && <p className="gp-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="gp-description">{description}</p>}</div>{action}</header>;
}
export function Surface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`gp-surface ${className}`}>{children}</section>;
}
export function StatusBadge({ children, tone = "violet" }: { children: ReactNode; tone?: "gold" | "violet" | "success" | "muted" }) {
  return <span className={`gp-badge gp-badge-${tone}`}>{children}</span>;
}
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <div className="gp-state" role="status"><span className="gp-loader" aria-hidden /><p>{label}</p></div>;
}
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="gp-state"><Sparkles size={32} aria-hidden /><h2>{title}</h2>{description && <p>{description}</p>}{action}</div>;
}
export function WalletCard({ kind, value, loading, action }: { kind: "gc" | "gpc" | "gpay"; value: number; loading?: boolean; action?: ReactNode }) {
  const details = {gc:{title:"Gold Coins (GC)",ticker:"GC",description:"Buy GC. Convert to GPC when you’re ready to play.",icon:Crown},gpc:{title:"GPC Coins",ticker:"GPC",description:"Your balance for games and on-platform rewards.",icon:Gem},gpay:{title:"$GPAY Tokens",ticker:"$GPAY",description:"Token redemption is coming soon.",icon:Hexagon}}[kind];
  const Icon=details.icon;
  return <section className={`gp-wallet-card gp-wallet-${kind}`}><div className="gp-wallet-top"><span className="gp-icon-tile"><Icon size={22} aria-hidden /></span><span className="gp-eyebrow">{details.ticker}</span></div><p className="gp-wallet-label">{details.title}</p><p className="gp-wallet-value" aria-live="polite">{loading ? "—" : localeInt(value)}<span>{details.ticker}</span></p><p className="gp-wallet-description">{details.description}</p>{action && <div className="gp-wallet-actions">{action}</div>}</section>;
}
export function QuickLink({ href, title, description, icon }: { href: string; title: string; description?: string; icon: ReactNode }) {
 return <Link href={href} className="gp-quick-link"><span className="gp-icon-tile">{icon}</span><span><strong>{title}</strong>{description && <small>{description}</small>}</span><ArrowUpRight size={18} aria-hidden /></Link>;
}
