"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Bell,
  Compass,
  Eye,
  Gamepad2,
  Home,
  Megaphone,
  Trophy,
  Settings,
  Medal,
  Menu,
  MoreHorizontal,
  Rocket,
  ScrollText,
  Search,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GarmonPayWordmark } from "@/components/GarmonPayWordmark";
import { WalletMenu } from "@/components/solana/WalletMenu";
import { KINGDOM_BOTTOM, KINGDOM_MENU, KINGDOM_MORE, KINGDOM_SIDE, kingdomCurrent } from "@/config/kingdom-navigation";
import { SOLANA_NAVIGATION } from "@/config/solana-navigation";
import { isPublicGameRoute } from "@/config/public-game-routes";

const ICONS: Record<string, LucideIcon> = {
  "/": Home,
  "/solana/spotlight": Compass,
  "/solana/launchpad": Rocket,
  "/solana/trade": ArrowLeftRight,
  "/member/paper": ScrollText,
  "/solana/earn": Eye,
  "/solana/advertise": Megaphone,
  "/games": Gamepad2,
  "/member/community": Users,
  "/member/referrals": UserPlus,
  "/member": Wallet,
  "/member/traders": Trophy,
  "/solana/wallet": Wallet,
  "/solana/members": Settings,
  "/dashboard/arena/tournaments": Medal,
};

export default function Navbar() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  const home = pathname === "/";
  const primary = SOLANA_NAVIGATION.slice(0, 8);

  return <>
    <header className={`glass-bar gp-public-header gp-kingdom-header${home ? " gp-home-chrome" : ""}`}>
      {(home || pathname.startsWith("/solana/") || pathname.startsWith("/member") || isPublicGameRoute(pathname)) && <a href="#main-content" className="gp-skip-link">Skip to content</a>}
      <div className="gp-public-header-inner">
          <button ref={toggle} type="button" className="gp-public-menu-toggle" aria-controls="gp-mobile-menu"
            aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        <div className="gp-public-brand">
          <GarmonPayWordmark href="/" />
          <p className="gp-public-slogan">GET SEEN. GET KNOWN. GET PAID.</p>
        </div>
        <nav className="gp-public-desktop-nav" aria-label="Main">
          {primary.map(({ href, label }) => {
            const Icon = ICONS[href];
            return <Link key={href} href={href} aria-current={kingdomCurrent(pathname, href) ? "page" : undefined} className="gp-public-nav-link">{Icon ? <Icon size={15} aria-hidden="true" /> : null}{label}</Link>;
          })}
          <details className="gp-nav-more">
            <summary><MoreHorizontal size={15} aria-hidden="true" />More</summary>
            <div>
              {KINGDOM_MORE.map(({ href, label }) => <Link key={href} href={href} className="gp-public-nav-link">{label}</Link>)}
            </div>
          </details>
        </nav>
        <div className="gp-public-nav-actions">
          <Link href="/solana/spotlight" className="gp-header-icon" aria-label="Search coins"><Search size={18} aria-hidden="true" /></Link>
          <Link href="/dashboard/notifications" className="gp-header-icon" aria-label="Notifications"><Bell size={18} aria-hidden="true" /></Link>
          <WalletMenu />

        </div>
      </div>
      {open && <nav id="gp-mobile-menu" className="gp-public-mobile-nav" aria-label="Mobile">
        {KINGDOM_MENU.map(({ href, label }) => (
          <Link key={href} href={href} aria-current={kingdomCurrent(pathname, href) ? "page" : undefined} onClick={() => setOpen(false)} className="gp-public-nav-link">{label}</Link>
        ))}
      </nav>}
    </header>
    <aside className="gp-kingdom-side" aria-label="Kingdom">
      {KINGDOM_SIDE.map((item) => {
        const Icon = ICONS[item.href] ?? Compass;
        return (
          <Link key={item.label} href={item.href} aria-current={kingdomCurrent(pathname, item.href) ? "page" : undefined}>
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </aside>
    <nav className="gp-kingdom-bottom" aria-label="Kingdom mobile">
      {KINGDOM_BOTTOM.map((item) => {
        const Icon = ICONS[item.href] ?? Compass;
        return (
          <Link key={item.label} href={item.href} aria-current={kingdomCurrent(pathname, item.href) ? "page" : undefined}>
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  </>;
}
