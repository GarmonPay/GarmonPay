"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, Menu, Search, X } from "lucide-react";
import { GarmonPayWordmark } from "@/components/GarmonPayWordmark";
import { WalletMenu } from "@/components/solana/WalletMenu";
import { SOLANA_NAVIGATION } from "@/config/solana-navigation";
import {isPublicGameRoute} from '@/config/public-game-routes';

export default function Navbar() {
  const pathname = usePathname();
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
  const links = SOLANA_NAVIGATION.map(({ href, label }) => (
    <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}
      onClick={() => setOpen(false)} className="gp-public-nav-link">{label}</Link>
  ));
  const home = pathname === "/";
  return <header className={`glass-bar gp-public-header${home ? " gp-home-chrome" : ""}`}>
    {(home || pathname?.startsWith("/solana/") || isPublicGameRoute(pathname||'')) && <a href="#main-content" className="gp-skip-link">Skip to content</a>}
    <div className="gp-public-header-inner">
      <div className="gp-public-brand">
        <GarmonPayWordmark href="/" />
        {home ? <p className="gp-public-slogan">GET SEEN. GET KNOWN. GET PAID.</p> : null}
      </div>
      <nav className="gp-public-desktop-nav" aria-label="Main">{SOLANA_NAVIGATION.slice(0,8).map(({href,label})=><Link key={href} href={href} aria-current={pathname===href?"page":undefined} className="gp-public-nav-link">{label}</Link>)}<details className="gp-nav-more"><summary>More</summary><div>{SOLANA_NAVIGATION.slice(8).map(({href,label})=><Link key={href} href={href} className="gp-public-nav-link">{label}</Link>)}<Link href="/solana/learn" className="gp-public-nav-link">Learn</Link><Link href="/solana/referrals" className="gp-public-nav-link">Referrals</Link><Link href="/solana/spotlight" className="gp-public-nav-link">Spotlight</Link><Link href="/dashboard/notifications" className="gp-public-nav-link">Notifications</Link></div></details></nav>
      <div className="gp-public-nav-actions">
        <Link href="/solana/spotlight" className="gp-header-icon" aria-label="Search coins"><Search size={18} aria-hidden="true" /></Link>
        <Link href="/dashboard/notifications" className="gp-header-icon" aria-label="Notifications"><Bell size={18} aria-hidden="true" /></Link>
        <WalletMenu />
        <button ref={toggle} type="button" className="gp-public-menu-toggle" aria-controls="gp-mobile-menu"
          aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
    </div>
    {open && <nav id="gp-mobile-menu" className="gp-public-mobile-nav" aria-label="Mobile">{links}
      <Link href="/solana/spotlight" className="gp-public-nav-link" onClick={() => setOpen(false)}>Search coins</Link>
      <Link href="/dashboard/notifications" className="gp-public-nav-link" onClick={() => setOpen(false)}>Notifications</Link>
      <Link href="/solana/create" className="gp-public-nav-link" onClick={() => setOpen(false)}>Create Coin</Link>
      <Link href="/solana/learn" className="gp-public-nav-link" onClick={() => setOpen(false)}>Learn</Link><Link href="/solana/referrals" className="gp-public-nav-link" onClick={() => setOpen(false)}>Referrals</Link><Link href="/solana/spotlight" className="gp-public-nav-link" onClick={() => setOpen(false)}>Spotlight</Link><Link href="/login" className="gp-public-nav-link" onClick={() => setOpen(false)}>Legacy account history</Link>
    </nav>}
  </header>;
}
