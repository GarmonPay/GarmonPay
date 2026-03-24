"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/dashboard/earn", label: "Earn" },
  { href: "/referral", label: "Refer" },
  { href: "/advertise", label: "Advertise" },
  { href: "/wallet", label: "Wallet" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? "border-amber-300/20 bg-[#0e0118]/88 backdrop-blur-xl"
          : "border-transparent bg-[#0e0118]/55"
      }`}
    >
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 md:px-6">
        <Link href="/" className="font-cinzel text-2xl font-bold tracking-wide gp-gradient-text">
          GarmonPay
        </Link>

        <div className="hide-mobile items-center gap-2 md:flex">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                  active ? "text-[#f5c842]" : "text-[#efe7ff]/85 hover:text-[#f5c842]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="hide-mobile items-center gap-2 md:flex">
          <Link href="/login" className="gp-btn-outline text-sm">
            Login
          </Link>
          <Link href="/register" className="gp-btn-gold text-sm">
            Join Free
          </Link>
        </div>

        <button
          type="button"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation menu"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="hide-desktop flex h-10 w-10 items-center justify-center rounded-lg border border-[#f5c842]/40 bg-[#19052b]/80 md:hidden"
        >
          <span className="relative block h-4 w-5">
            <span
              className={`absolute left-0 top-0 h-0.5 w-5 bg-[#f5c842] transition-all duration-300 ${
                menuOpen ? "translate-y-[7px] rotate-45" : ""
              }`}
            />
            <span
              className={`absolute left-0 top-[7px] h-0.5 w-5 bg-[#f5c842] transition-all duration-300 ${
                menuOpen ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute left-0 top-[14px] h-0.5 w-5 bg-[#f5c842] transition-all duration-300 ${
                menuOpen ? "-translate-y-[7px] -rotate-45" : ""
              }`}
            />
          </span>
        </button>
      </nav>

      <div
        className={`hide-desktop overflow-hidden border-t border-[#f5c842]/15 bg-[#120320]/95 backdrop-blur-xl transition-all duration-300 md:hidden ${
          menuOpen ? "max-h-[420px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 py-4">
          <div className="grid gap-2">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    active ? "bg-[#f5c842]/20 text-[#f5c842]" : "text-[#efe7ff] hover:bg-white/5"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-4 grid gap-2">
            <Link href="/login" className="gp-btn-outline w-full text-sm">
              Login
            </Link>
            <Link href="/register" className="gp-btn-gold w-full text-sm">
              Join Free
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
