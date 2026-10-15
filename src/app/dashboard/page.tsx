"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Cinzel_Decorative, DM_Sans } from "next/font/google";
import { createBrowserClient } from "@/lib/supabase";
import { getSessionAsync } from "@/lib/session";
import { ArrowUpRight, Gamepad2, Play, Wallet, Crown, Users, Megaphone } from "lucide-react";
import { WalletCard, QuickLink, Surface, StatusBadge } from "@/components/ui/garmon-ui";
import { GameCard } from "@/components/ui/GameCard";
import { CinematicHero } from "@/components/ui/CinematicHero";
import { GAME_LOBBY } from "@/config/game-lobby";
import { localeInt, safeFiniteInt } from "@/lib/format-number";

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

type UserRow = {
  gold_coins: number | null;
  gpay_coins: number | null;
  gpay_tokens: number | null;
  membership_tier: string | null;
  total_referrals: number | null;
  referral_code: string | null;
  full_name: string | null;
};

function tierIcon(tierRaw: string): string {
  const t = tierRaw.toLowerCase();
  if (t.includes("elite")) return "👑";
  if (t.includes("pro")) return "🥇";
  if (t.includes("growth")) return "🥈";
  if (t.includes("starter")) return "🥉";
  return "⭐";
}

function formatTierLabel(tierRaw: string): string {
  if (!tierRaw.trim()) return "Free";
  return tierRaw.charAt(0).toUpperCase() + tierRaw.slice(1).toLowerCase();
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadUser = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const session = await getSessionAsync();
    if (!session) {
      router.replace("/login?next=/dashboard");
      setLoading(false);
      return;
    }
    const supabase = createBrowserClient();
    if (!supabase) {
      setLoadError("Unable to connect");
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("users")
      .select(
        `
      gold_coins,
      gpay_coins,
      gpay_tokens,
      membership_tier,
      total_referrals,
      referral_code,
      full_name
    `
      )
      .eq("id", session.userId)
      .single();

    if (error) {
      setLoadError(error.message);
      setUser(null);
    } else {
      setUser(data as UserRow);
      setLoadError(null);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  useEffect(() => {
    const supabase = createBrowserClient();
    if (!supabase) return;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      const session = await getSessionAsync();
      if (!session?.userId || cancelled) return;
      ch = supabase
        .channel(`dashboard-users-${session.userId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "users",
            filter: `id=eq.${session.userId}`,
          },
          (payload) => {
            const n = payload.new as Partial<UserRow>;
            setUser((prev) => (prev ? { ...prev, ...n } : prev));
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (ch && supabase) void supabase.removeChannel(ch);
    };
  }, []);

  async function copyReferralCode() {
    const code = user?.referral_code?.trim() ?? "";
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div
        className={`flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-[#0e0118] px-4 py-16 text-violet-300/80 ${dmSans.className}`}
      >
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500/20 border-t-violet-400" />
        <p className="text-sm font-medium">Loading your dashboard…</p>
      </div>
    );
  }

  if (loadError && !user) {
    return (
      <div className={`mx-auto max-w-md bg-[#0e0118] px-4 py-12 text-center ${dmSans.className}`}>
        <p className="text-red-400">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadUser();
          }}
          className="mt-4 rounded-xl bg-[#F5C842] px-5 py-2.5 text-sm font-semibold text-black"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className={`flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-[#0e0118] px-4 py-16 text-violet-300/80 ${dmSans.className}`}
      >
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500/20 border-t-amber-400" />
        <p className="text-sm font-medium">Preparing your balances…</p>
      </div>
    );
  }

  const firstName = user.full_name?.split(" ")[0] ?? "Member";
  const goldCoins = safeFiniteInt(user.gold_coins);
  const gpayCoins = safeFiniteInt(user.gpay_coins);
  const gpayTokens = safeFiniteInt(user.gpay_tokens);
  const tierRaw = user.membership_tier?.trim() ?? "";
  const tier = tierRaw ? formatTierLabel(tierRaw) : "Free";
  const referrals = safeFiniteInt(user.total_referrals);
  const referralCode = user.referral_code?.trim() ?? "";

  return (
    <div className="gp-dashboard space-y-6">
      <div className="gp-dashboard-lead"><CinematicHero/><aside className="gp-account-summary gp-surface"><h2><Crown size={17}/>Your account</h2><dl><div><dt>Welcome</dt><dd>{firstName}</dd></div><div><dt>Membership</dt><dd>{tier}</dd></div><div><dt>Referrals</dt><dd>{localeInt(referrals)}</dd></div></dl><Link href="/dashboard/referrals">View referral activity →</Link></aside></div>
      <div><div className="gp-section-title"><h2 className="gp-wallet-section-label">Your wallet</h2><Link href="/dashboard/wallet">Wallet details <ArrowUpRight size={15}/></Link></div><div className="gp-wallet-grid"><WalletCard kind="gc" value={goldCoins} action={<Link href="/dashboard/wallet" className="gp-button gp-button-gold">BUY GC</Link>}/><WalletCard kind="gpc" value={gpayCoins} action={<Link href="/dashboard/wallet#convert" className="gp-button gp-button-violet">CONVERT</Link>}/><WalletCard kind="gpay" value={gpayTokens} action={<Link href="/dashboard/redeem" className="gp-button gp-button-ghost">Redeem · Soon</Link>}/></div></div>
      <div><div className="gp-section-title"><h2 className="gp-action-section-label">Quick actions</h2></div><div className="gp-quick-grid"><QuickLink href="/dashboard/games" title="Play Games" description="Find your next match" icon={<Gamepad2 size={20}/>}/><QuickLink href="/dashboard/earn" title="Watch & Earn" description="Discover creator videos" icon={<Play size={20}/>}/><QuickLink href="/dashboard/membership" title="Membership" description="Explore your plan" icon={<Crown size={20}/>}/><QuickLink href="/dashboard/referrals" title="Refer & Earn" description="Bring your friends" icon={<Users size={20}/>}/><QuickLink href="/dashboard/advertise" title="Advertise" description="Reach your audience" icon={<Megaphone size={20}/>}/><QuickLink href="/dashboard/coins/buy" title="Store" description="Gold Coins" icon={<Wallet size={20}/>}/></div></div>
      <div><div className="gp-section-title"><h2>Featured Games</h2><Link href="/dashboard/games">All games <ArrowUpRight size={15}/></Link></div><div className="gp-game-grid gp-featured-grid">{GAME_LOBBY.slice(0,6).map(game=><GameCard key={game.id} game={game}/>)}</div></div>
      <div className="gp-two-column"><Surface><StatusBadge tone="gold">YOUR MEMBERSHIP</StatusBadge><h2 className="mt-5 text-2xl font-bold">{tier} looks good on you.</h2><p className="gp-description">Explore your benefits and find the plan that fits you.</p><Link href="/dashboard/membership" className="gp-button gp-button-ghost mt-6">Explore membership <ArrowUpRight size={16}/></Link></Surface><Surface><StatusBadge>REFER & EARN</StatusBadge><h2 className="mt-5 text-2xl font-bold">Better with friends.</h2><p className="gp-description">You have {localeInt(referrals)} {referrals===1?"referral":"referrals"}.</p><div className="mt-5 flex flex-wrap items-center gap-3"><code className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-violet-200">{referralCode||"No code available"}</code><button type="button" disabled={!referralCode} onClick={()=>void copyReferralCode()} className="gp-button gp-button-violet">{copied?"Copied!":"Copy code"}</button></div><Link href="/dashboard/referrals" className="mt-4 inline-flex text-xs text-violet-200">View referral activity →</Link></Surface></div>
    </div>
  );
}
