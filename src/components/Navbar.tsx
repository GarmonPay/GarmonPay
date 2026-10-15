"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
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
  return <header className="glass-bar gp-public-header">
    {(pathname === "/" || pathname?.startsWith("/solana/") || isPublicGameRoute(pathname||'')) && <a href="#main-content" className="gp-skip-link">Skip to content</a>}
    <div className="gp-public-header-inner">
      <GarmonPayWordmark href="/" />
      <nav className="gp-public-desktop-nav" aria-label="Main">{links}</nav>
      <div className="gp-public-nav-actions">
        <Link href="/solana/create" className="gp-button gp-button-gold gp-create-coin">Create Coin</Link>
        <WalletMenu />
        <button ref={toggle} type="button" className="gp-public-menu-toggle" aria-controls="gp-mobile-menu"
          aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
    </div>
    {open && <nav id="gp-mobile-menu" className="gp-public-mobile-nav" aria-label="Mobile">{links}
      <Link href="/solana/create" className="gp-public-nav-link" onClick={() => setOpen(false)}>Create Coin</Link>
      <Link href="/login" className="gp-public-nav-link" onClick={() => setOpen(false)}>Legacy account history</Link>
    </nav>}
  </header>;
}
