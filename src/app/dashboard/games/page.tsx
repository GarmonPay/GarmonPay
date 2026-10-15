"use client";
import { GameCatalog } from "@/components/ui/GameCatalog";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getGamesBudget, gamesDailyBonus } from "@/lib/api";
import { scToUsdDisplay } from "@/lib/coins";
import { GameCard } from "@/components/ui/GameCard";
import { GAME_LOBBY } from "@/config/game-lobby";
import { PageHeading } from "@/components/ui/garmon-ui";
import { localeInt } from "@/lib/format-number";

export default function DashboardGamesPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [budget, setBudget] = useState<{ remaining: number; noRewardsRemaining: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ game: string; amountSc: number } | null>(null);

  const [claimingDaily, setClaimingDaily] = useState(false);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/games");
        return;
      }
      const tokenOrId = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      setSession({ tokenOrId, isToken });
      getGamesBudget(tokenOrId, isToken)
        .then((b) => setBudget({ remaining: b.remaining, noRewardsRemaining: b.noRewardsRemaining }))
        .catch(() => setBudget({ remaining: 0, noRewardsRemaining: true }))
        .finally(() => setLoading(false));
    });
  }, [router]);

  const refreshBudget = () => {
    if (!session) return;
    getGamesBudget(session.tokenOrId, session.isToken)
      .then((b) => setBudget({ remaining: b.remaining, noRewardsRemaining: b.noRewardsRemaining }))
      .catch(() => {});
  };

  const handleDailyBonus = () => {
    if (!session || claimingDaily) return;
    setError(null);
    setResult(null);
    setClaimingDaily(true);
    gamesDailyBonus(session.tokenOrId, session.isToken)
      .then((r) => {
        setResult({ game: "Daily Bonus", amountSc: r.amountSc });
        refreshBudget();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Claim failed"))
      .finally(() => setClaimingDaily(false));
  };

  if (loading || !session) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 flex items-center justify-center min-h-[280px]">
        <p className="text-fintech-muted">Loading games…</p>
      </div>
    );
  }

  const noRewards = budget?.noRewardsRemaining ?? false;
  return <div className="gp-lobby-page space-y-4 pb-8"><PageHeading title="Games" description="Choose your next game."/>
    {noRewards && <div className="gp-notice" role="status">No rewards remaining today. The daily budget has been reached. Try again tomorrow.</div>}
    {error && <div className="gp-notice gp-error" role="alert"><p className="flex-1">{error}</p><button onClick={()=>setError(null)} type="button" className="gp-button gp-button-ghost">Dismiss</button></div>}
    {result && <div className="gp-notice gp-success" role="status">{result.game}: You won {localeInt(result.amountSc)} GPay Coins ({scToUsdDisplay(result.amountSc)})!</div>}
    <GameCatalog/>
    <div className="gp-two-column"><section className="gp-surface"><p className="gp-eyebrow">A LITTLE EVERY DAY</p><h2 className="text-xl font-bold">Daily Bonus</h2><p className="gp-description">Claim once every 24 hours, subject to the existing reward budget.</p><button type="button" onClick={handleDailyBonus} disabled={noRewards||claimingDaily} className="gp-button gp-button-gold mt-5">{claimingDaily?"Claiming…":"Claim Daily Bonus"}</button></section><section className="gp-surface"><p className="gp-eyebrow">YOUR COMMUNITY</p><h2 className="text-xl font-bold">The leaderboard</h2><p className="gp-description">See how you rank by referrals and activity.</p><Link href="/dashboard/leaderboard" className="gp-button gp-button-ghost mt-5">View leaderboard →</Link></section></div>
    <p className="text-xs leading-relaxed text-fintech-muted">Rewards remain subject to the platform’s existing daily budget. Games marked Coming Soon are not available for play.</p>
  </div>;
}
