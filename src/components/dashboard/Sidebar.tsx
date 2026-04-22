"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Cinzel_Decorative } from "next/font/google";
import { logout } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";
import { APP_SHELL_LINKS } from "@/config/app-shell-nav";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

type NavItem = {
  href: string;
  label: string;
  icon: string;
  soon?: boolean;
  isActive: (pathname: string) => boolean;
};

const L = APP_SHELL_LINKS;

const SECTIONS: { heading: string | null; items: NavItem[] }[] = [
  {
    heading: null,
    items: [
      {
        href: L.home,
        label: "Dashboard",
        icon: "🏠",
        isActive: (p) => p === L.home,
      },
    ],
  },
  {
    heading: "GAMES",
    items: [
      {
        href: L.gamesHub,
        label: "Game center",
        icon: "🎮",
        isActive: (p) => p === L.gamesHub || p.startsWith(`${L.gamesHub}/`),
      },
      {
        href: L.coinFlip,
        label: "Coin Flip",
        icon: "🪙",
        isActive: (p) =>
          p.startsWith(L.coinFlip) || p.startsWith("/dashboard/coin-flip"),
      },
      {
        href: L.arena,
        label: "Arena",
        icon: "⚔️",
        soon: true,
        isActive: (p) => p.startsWith(L.arena),
      },
    ],
  },
  {
    heading: "EARN",
    items: [
      {
        href: L.earnAds,
        label: "Watch Ads",
        icon: "📺",
        isActive: (p) =>
          p === L.earnRoot ||
          p.startsWith(L.earnAds) ||
          (p.startsWith("/dashboard/earn") &&
            !p.startsWith(L.earnSocial) &&
            !p.startsWith("/dashboard/earn/calculator")),
      },
      {
        href: L.earnSocial,
        label: "Social Tasks",
        icon: "✅",
        isActive: (p) => p.startsWith(L.earnSocial),
      },
      {
        href: L.referral,
        label: "Refer Friends",
        icon: "👥",
        isActive: (p) =>
          p.startsWith(L.referral) || p.startsWith(L.referrals),
      },
    ],
  },
  {
    heading: "COINS",
    items: [
      {
        href: L.buyGc,
        label: "Buy GC",
        icon: "🛒",
        isActive: (p) =>
          p.startsWith(L.buyGc) || p.startsWith("/dashboard/buy-coins"),
      },
      {
        href: L.convert,
        label: "Convert GC → GPC",
        icon: "⚡",
        isActive: (p) => p.startsWith(L.convert),
      },
    ],
  },
  {
    heading: "ACCOUNT",
    items: [
      {
        href: L.profile,
        label: "Profile",
        icon: "👤",
        isActive: (p) =>
          p.startsWith(L.profile) || p.startsWith(L.settings),
      },
    ],
  },
];

function navItemClass(active: boolean): string {
  const base =
    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-4 py-2.5 text-sm transition-colors";
  if (active) {
    return `${base} bg-[rgba(124,58,237,0.3)] text-[#F5C842]`;
  }
  return `${base} text-white/70 hover:bg-[rgba(124,58,237,0.2)] hover:text-white`;
}

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    } else {
      try {
        await logout();
      } finally {
        clearSession();
      }
    }
    onNavigate?.();
    router.push("/");
  }

  return (
    <aside className="flex h-full min-h-0 w-[220px] shrink-0 flex-col border-r border-[rgba(124,58,237,0.3)] bg-[#0a0118]">
      <Link
        href={L.home}
        onClick={onNavigate}
        className={`block border-b border-[rgba(124,58,237,0.3)] px-4 py-5 text-xl font-bold text-[#F5C842] ${cinzel.className}`}
      >
        GarmonPay
      </Link>

      <nav className="flex flex-1 flex-col overflow-y-auto pb-4">
        {SECTIONS.map((section, sectionIdx) => (
          <div key={section.heading ?? `nav-section-${sectionIdx}`}>
            {section.heading ? (
              <p
                className="px-4 pb-1 pt-4 text-[10px] uppercase tracking-[2px] text-white/30"
                style={{ padding: "16px 16px 4px" }}
              >
                {section.heading}
              </p>
            ) : null}
            <ul className="space-y-0.5 px-2">
              {section.items.map((item) => {
                const active = item.isActive(pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={navItemClass(active)}
                    >
                      <span className="shrink-0 text-base leading-none" aria-hidden>
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.soon ? (
                        <span
                          className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                          style={{
                            background: "rgba(124, 58, 237, 0.3)",
                            color: "#7C3AED",
                          }}
                        >
                          Soon
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {section.heading === "ACCOUNT" ? (
              <div className="px-2 pb-2">
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className={`${navItemClass(false)} w-full text-left`}
                >
                  <span className="text-base" aria-hidden>
                    🚪
                  </span>
                  Log Out
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </nav>
    </aside>
  );
}
