"use client";

import Link from "next/link";
import { useState } from "react";
import { Cinzel_Decorative } from "next/font/google";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/dashboard/earn", label: "Earn" },
  { href: "/referral", label: "Refer" },
  { href: "/advertise", label: "Advertise" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="glass-bar border-b border-white/[0.06] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/"
          className={`${cinzel.className} text-xl font-bold bg-gradient-to-r from-[#eab308] to-[#fbbf24] bg-clip-text text-transparent no-underline`}
        >
          GarmonPay
        </Link>

        <div className="flex items-center gap-2">
          <nav
            className="hidden lg:flex flex-wrap items-center gap-1 sm:gap-2"
            aria-label="Main"
          >
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-2 rounded-lg text-sm font-medium text-fintech-muted hover:text-white hover:bg-white/5 no-underline"
              >
                {label}
              </Link>
            ))}
            <Link
              href="/login"
              className="px-3 py-2 rounded-lg text-sm font-medium text-fintech-muted hover:text-white hover:bg-white/5 no-underline"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="ml-1 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-3 py-2 text-center text-xs font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-violet-400 sm:px-4 sm:text-sm"
            >
              <span className="hidden xl:inline">Start Earning Free — No Credit Card Needed</span>
              <span className="xl:hidden">Start Earning Free</span>
            </Link>
          </nav>

          <button
            type="button"
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white hover:bg-white/5"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-white/[0.06] bg-[#0a0514]/98 backdrop-blur-md">
          <nav className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1" aria-label="Mobile">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg px-3 py-3 text-sm font-medium text-violet-100 hover:bg-white/5 no-underline"
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            ))}
            <Link
              href="/login"
              className="rounded-lg px-3 py-3 text-sm font-medium text-violet-100 hover:bg-white/5 no-underline"
              onClick={() => setOpen(false)}
            >
              Login
            </Link>
            <Link
              href="/register"
              className="mt-2 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-3 py-3 text-center text-sm font-semibold text-white"
              onClick={() => setOpen(false)}
            >
              Start Earning Free — No Credit Card Needed
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
