import Link from "next/link";

const navLinks = [
  { href: "/pricing", label: "Pricing" },
  { href: "/advertise", label: "Advertise" },
  { href: "/referral", label: "Referrals" },
  { href: "/games", label: "Games" },
  { href: "/login", label: "Login" },
  { href: "/register", label: "Sign up" },
];

export default function Navbar() {
  return (
    <header className="glass-bar border-b border-white/[0.06] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/"
          className="text-xl font-bold bg-gradient-to-r from-[#eab308] to-[#fbbf24] bg-clip-text text-transparent no-underline"
        >
          GarmonPay
        </Link>
        <nav
          className="flex flex-wrap items-center gap-1 sm:gap-2"
          aria-label="Main"
        >
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-2 rounded-lg text-sm font-medium text-fintech-muted hover:text-white hover:bg-white/5 no-underline"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
