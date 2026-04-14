"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Cinzel_Decorative } from "next/font/google";
import { logout } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";

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

const SECTIONS: { heading: string | null; items: NavItem[] }[] = [
  {
    heading: null,
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: "🏠",
        isActive: (p) => p === "/dashboard",
      },
    ],
  },
  {
    heading: "GAMES",
    items: [
      {
        href: "/games/celo",
        label: "C-Lo",
        icon: "🎲",
        isActive: (p) => p.startsWith("/games/celo"),
      },
      {
        href: "/dashboard/coinflip",
        label: "Coin Flip",
        icon: "🪙",
        isActive: (p) =>
          p.startsWith("/dashboard/coinflip") || p.startsWith("/dashboard/coin-flip"),
      },
      {
        href: "/dashboard/arena",
        label: "Arena",
        icon: "⚔️",
        soon: true,
        isActive: (p) => p.startsWith("/dashboard/arena"),
      },
    ],
  },
  {
    heading: "EARN",
    items: [
      {
        href: "/dashboard/earn/ads",
        label: "Watch Ads",
        icon: "📺",
        isActive: (p) =>
          p === "/dashboard/earn" ||
          p.startsWith("/dashboard/earn/ads") ||
          (p.startsWith("/dashboard/earn") &&
            !p.startsWith("/dashboard/earn/social") &&
            !p.startsWith("/dashboard/earn/calculator")),
      },
      {
        href: "/dashboard/earn/social",
        label: "Social Tasks",
        icon: "✅",
        isActive: (p) => p.startsWith("/dashboard/earn/social"),
      },
      {
        href: "/dashboard/referral",
        label: "Refer Friends",
        icon: "👥",
        isActive: (p) =>
          p.startsWith("/dashboard/referral") || p.startsWith("/dashboard/referrals"),
      },
    ],
  },
  {
    heading: "COINS",
    items: [
      {
        href: "/dashboard/coins/buy",
        label: "Buy GC",
        icon: "🛒",
        isActive: (p) =>
          p.startsWith("/dashboard/coins/buy") || p.startsWith("/dashboard/buy-coins"),
      },
      {
        href: "/dashboard/convert",
        label: "Convert GC → $GPAY",
        icon: "⚡",
        isActive: (p) => p.startsWith("/dashboard/convert"),
      },
    ],
  },
  {
    heading: "ACCOUNT",
    items: [
      {
        href: "/dashboard/profile",
        label: "Profile",
        icon: "👤",
        isActive: (p) =>
          p.startsWith("/dashboard/profile") || p.startsWith("/dashboard/settings"),
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
        href="/dashboard"
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
