"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import {
  GARMON_AD_RATES,
  GARMON_AD_EARN_MULT_CAP,
  MAX_USER_EARNINGS_PER_DAY,
  capAdEarnMultiplier,
} from "@/lib/garmon-ad-rates";

const LEVEL_OPTIONS = [
  { id: "bronze", label: "Bronze", mult: 1.0, hint: "$0–$9.99 lifetime" },
  { id: "silver", label: "Silver", mult: 1.05, hint: "$10–$49.99" },
  { id: "gold", label: "Gold", mult: 1.1, hint: "$50–$199.99" },
  { id: "platinum", label: "Platinum", mult: 1.15, hint: "$200–$499.99" },
  { id: "diamond", label: "Diamond", mult: 1.2, hint: "$500+" },
] as const;

const STREAK_OPTIONS = [
  { id: "none", label: "No streak", mult: 1 },
  { id: "week", label: "7+ day streak", mult: 2 },
  { id: "month", label: "30+ day streak", mult: 3 },
] as const;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export default function IncomeCalculatorPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [v15, setV15] = useState(2);
  const [v30, setV30] = useState(3);
  const [v60, setV60] = useState(1);
  const [clicks, setClicks] = useState(2);
  const [follows, setFollows] = useState(1);
  const [shares, setShares] = useState(1);
  const [banners, setBanners] = useState(5);
  const [levelId, setLevelId] = useState<(typeof LEVEL_OPTIONS)[number]["id"]>("silver");
  const [streakId, setStreakId] = useState<(typeof STREAK_OPTIONS)[number]["id"]>("none");

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/earn/calculator");
        return;
      }
      setReady(true);
    });
  }, [router]);

  const levelMult = LEVEL_OPTIONS.find((l) => l.id === levelId)?.mult ?? 1;
  const streakMult = STREAK_OPTIONS.find((s) => s.id === streakId)?.mult ?? 1;

  const adEarnMult = useMemo(
    () => capAdEarnMultiplier(levelMult, streakMult),
    [levelMult, streakMult]
  );

  const { rawDaily, cappedDaily, monthly } = useMemo(() => {
    const base =
      v15 * GARMON_AD_RATES.view_15.userEarns +
      v30 * GARMON_AD_RATES.view_30.userEarns +
      v60 * GARMON_AD_RATES.view_60.userEarns +
      clicks * GARMON_AD_RATES.click.userEarns +
      follows * GARMON_AD_RATES.follow.userEarns +
      shares * GARMON_AD_RATES.share.userEarns +
      banners * GARMON_AD_RATES.banner_view.userEarns;
    const raw = base * adEarnMult;
    const capped = Math.min(raw, MAX_USER_EARNINGS_PER_DAY);
    return {
      rawDaily: raw,
      cappedDaily: capped,
      monthly: capped * 30,
    };
  }, [v15, v30, v60, clicks, follows, shares, banners, adEarnMult]);

  if (!ready) {
    return (
      <div className="card-lux p-6 text-fintech-muted">Loading…</div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-8">
      <div className="animate-slide-up card-lux p-5 tablet:p-6">
        <Link href="/dashboard/earn" className="text-sm text-fintech-accent hover:underline">
          ← Back to Earn
        </Link>
        <h1 className="mt-3 text-xl font-bold text-white">Income calculator</h1>
        <p className="mt-1 text-sm text-fintech-muted">
          Estimates use current GarmonPay ad rates. Level × streak is capped at{" "}
          <span className="text-white/90">{GARMON_AD_EARN_MULT_CAP}×</span> for ad payouts (matches live{" "}
          <code className="text-violet-300/90">/api/ads/engage</code>
          ). Daily earnings are capped at ${MAX_USER_EARNINGS_PER_DAY.toFixed(2)} per user.
        </p>
      </div>

      <div className="animate-slide-up card-lux space-y-4 p-5">
        <h2 className="text-sm font-semibold text-white">Engagements per day</h2>
        {(
          [
            ["15s video views", v15, setV15],
            ["30s video views", v30, setV30],
            ["60s video views", v60, setV60],
            ["Clicks", clicks, setClicks],
            ["Follows", follows, setFollows],
            ["Shares", shares, setShares],
            ["Banner views (30s)", banners, setBanners],
          ] as const
        ).map(([label, val, set]) => (
          <label key={label} className="block">
            <div className="mb-1 flex justify-between text-xs text-fintech-muted">
              <span>{label}</span>
              <span className="text-white">{val}</span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              value={val}
              onChange={(e) => set(clamp(Number(e.target.value), 0, 20))}
              className="w-full accent-fintech-accent"
            />
          </label>
        ))}
      </div>

      <div className="animate-slide-up card-lux space-y-3 p-5">
        <h2 className="text-sm font-semibold text-white">Level &amp; streak (capped for ads)</h2>
        <p className="text-xs text-fintech-muted">
          Effective multiplier applied: <span className="text-white font-medium">{adEarnMult}×</span>
          {GARMON_AD_EARN_MULT_CAP <= 1 ? " — streak/level do not increase ad payout right now." : ""}
        </p>
        <div>
          <p className="mb-2 text-xs text-fintech-muted">Level (from lifetime ad earnings)</p>
          <div className="flex flex-wrap gap-2">
            {LEVEL_OPTIONS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLevelId(l.id)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  levelId === l.id
                    ? "border-fintech-accent bg-fintech-accent/20 text-white"
                    : "border-white/10 text-fintech-muted hover:border-white/20"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-fintech-muted">
            {LEVEL_OPTIONS.find((l) => l.id === levelId)?.hint}
          </p>
        </div>
        <div>
          <p className="mb-2 text-xs text-fintech-muted">Streak multiplier</p>
          <div className="flex flex-wrap gap-2">
            {STREAK_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStreakId(s.id)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  streakId === s.id
                    ? "border-fintech-accent bg-fintech-accent/20 text-white"
                    : "border-white/10 text-fintech-muted hover:border-white/20"
                }`}
              >
                {s.label} ({s.mult}×)
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="animate-slide-up rounded-xl border border-fintech-accent/40 p-6"
        style={{
          background: "linear-gradient(135deg, #1a1200, #2a1800)",
        }}
      >
        <p className="text-xs font-medium uppercase tracking-wider text-fintech-muted">Estimated per day</p>
        <p className="mt-1 text-3xl font-black text-fintech-money">${cappedDaily.toFixed(2)}</p>
        {rawDaily > MAX_USER_EARNINGS_PER_DAY && (
          <p className="mt-2 text-xs text-amber-400">
            Uncapped estimate would be ${rawDaily.toFixed(2)} — daily cap applies (${MAX_USER_EARNINGS_PER_DAY.toFixed(2)} max).
          </p>
        )}
        <p className="mt-4 text-xs text-fintech-muted">Projected 30 days (at cap)</p>
        <p className="text-xl font-bold text-white">${monthly.toFixed(2)}</p>
      </div>
    </div>
  );
}
