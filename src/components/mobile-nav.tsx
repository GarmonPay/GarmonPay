"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/dashboard", label: "Dashboard", icon: "◉" },
  { href: "/dashboard/games", label: "Games", icon: "🎮" },
  { href: "/dashboard/earnings", label: "Earn", icon: "¢" },
  { href: "/dashboard/settings", label: "Profile", icon: "☷" },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.06] bg-fintech-bg-card/95 backdrop-blur-sm tablet:hidden"
      style={{
        minHeight: "56px",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)",
        paddingTop: "8px",
      }}
      aria-label="Bottom navigation"
    >
      <div className="mx-auto flex w-full max-w-[430px] items-center justify-around">
      {tabs.map(({ href, label, icon }) => {
        const active =
          pathname === href ||
          (href !== "/dashboard" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={`flex min-h-touch flex-col items-center justify-center gap-0.5 px-2 py-2 text-xs font-medium transition-all min-w-[52px] rounded-xl ${
              active ? "text-fintech-accent" : "text-fintech-muted"
            } hover:text-white active:scale-95`}
            style={{ minHeight: "48px" }}
          >
            <span className="text-lg leading-none" aria-hidden>
              {icon}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
      </div>
    </nav>
  );
}
