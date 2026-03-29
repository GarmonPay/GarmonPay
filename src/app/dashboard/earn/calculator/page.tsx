"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getAdEarnings } from "@/lib/api";
import {
  GARMON_AD_RATES,
  GARMON_AD_EARN_MULT_CAP,
  MAX_USER_EARNINGS_PER_DAY,
  capAdEarnMultiplier,
} from "@/lib/garmon-ad-rates";

const LEVEL_OPTIONS = [
  { id: "bronze", label: "Bronze", mult: 1.0, hint: "$0–$9.99 lifetime ad earnings" },
  { id: "silver", label: "Silver", mult: 1.05, hint: "$10–$49.99 lifetime ad earnings" },
  { id: "gold", label: "Gold", mult: 1.1, hint: "$50–$199.99 lifetime ad earnings" },
  { id: "platinum", label: "Platinum", mult: 1.15, hint: "$200–$499.99 lifetime ad earnings" },
  { id: "diamond", label: "Diamond", mult: 1.2, hint: "$500+ lifetime ad earnings" },
] as const;

const STREAK_OPTIONS = [
  { id: "none", label: "No streak", mult: 1 },
  { id: "week", label: "7+ day streak", mult: 2 },
  { id: "month", label: "30+ day streak", mult: 3 },
] as const;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function roundMoney2(n: number) {
  return Math.round(n * 100) / 100;
}

function levelIdFromLifetimeAdEarnings(totalUsd: number): (typeof LEVEL_OPTIONS)[number]["id"] {
  if (!Number.isFinite(totalUsd) || totalUsd < 0) return "bronze";
  if (totalUsd >= 500) return "diamond";
  if (totalUsd >= 200) return "platinum";
  if (totalUsd >= 50) return "gold";
  if (totalUsd >= 10) return "silver";
  return "bronze";
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
  const [levelId, setLevelId] = useState<(typeof LEVEL_OPTIONS)[number]["id"]>("bronze");
  const [streakId, setStreakId] = useState<(typeof STREAK_OPTIONS)[number]["id"]>("none");
  const [lifetimeAdUsd, setLifetimeAdUsd] = useState<number | null>(null);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/earn/calculator");
        return;
      }
      setReady(true);
    });
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const s = await getSessionAsync();
      if (!s || cancelled) return;
      const tokenOrId = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      try {
        const e = await getAdEarnings(tokenOrId, isToken);
        if (cancelled) return;
        const total = Number(e.totalDollars ?? 0);
        setLifetimeAdUsd(Number.isFinite(total) ? total : 0);
        setLevelId(levelIdFromLifetimeAdEarnings(Number.isFinite(total) ? total : 0));
      } catch {
        if (!cancelled) setLifetimeAdUsd(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const levelMult = LEVEL_OPTIONS.find((l) => l.id === levelId)?.mult ?? 1;
  const streakMult = STREAK_OPTIONS.find((s) => s.id === streakId)?.mult ?? 1;

  const adEarnMult = useMemo(
    () => capAdEarnMultiplier(levelMult, streakMult),
    [levelMult, streakMult]
  );

  const baseDailyBeforeMult = useMemo(() => {
    return (
      v15 * GARMON_AD_RATES.view_15.userEarns +
      v30 * GARMON_AD_RATES.view_30.userEarns +
      v60 * GARMON_AD_RATES.view_60.userEarns +
      clicks * GARMON_AD_RATES.click.userEarns +
      follows * GARMON_AD_RATES.follow.userEarns +
      shares * GARMON_AD_RATES.share.userEarns +
      banners * GARMON_AD_RATES.banner_view.userEarns
    );
  }, [v15, v30, v60, clicks, follows, shares, banners]);

  const { rawDaily, cappedDaily, dailyShown, monthlyShown } = useMemo(() => {
    const raw = baseDailyBeforeMult * adEarnMult;
    const capped = Math.min(raw, MAX_USER_EARNINGS_PER_DAY);
    const dailyR = roundMoney2(capped);
    return {
      rawDaily: raw,
      cappedDaily: capped,
      dailyShown: dailyR,
      monthlyShown: roundMoney2(dailyR * 30),
    };
  }, [baseDailyBeforeMult, adEarnMult]);

  if (!ready) {
    return (
      <div className="card-lux p-6 text-fintech-muted">Loading…</div>
    );
  }

  const multCapped =
    GARMON_AD_EARN_MULT_CAP > 0 && levelMult * streakMult > GARMON_AD_EARN_MULT_CAP + 1e-9;

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-8 scroll-mt-4">
      <div className="animate-slide-up card-lux relative z-10 p-5 tablet:p-6">
        <Link href="/dashboard/earn" className="text-sm text-fintech-accent hover:underline">
          ← Back to Earn
        </Link>
        <h1 className="mt-4 text-xl font-bold text-white">Income calculator</h1>
        <p className="mt-2 text-sm text-fintech-muted leading-relaxed">
          Estimates use current GarmonPay ad rates. Level × streak is capped at{" "}
          <span className="text-white/90">{GARMON_AD_EARN_MULT_CAP}×</span> for ad payouts (same rules as{" "}
          <code className="rounded bg-black/30 px-1 text-violet-300/90">/api/ads/engage</code>
          ). Daily ad earnings are capped at{" "}
          <span className="text-white/90">${MAX_USER_EARNINGS_PER_DAY.toFixed(2)}</span> per user.
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
            ["Banner views (30s equal)", banners, setBanners],
          ] as const
        ).map(([label, val, set]) => (
          <label key={label} className="block">
            <div className="mb-1 flex justify-between text-xs text-fintech-muted">
              <span>{label}</span>
              <span className="tabular-nums text-white">{val}</span>
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
        <h2 className="text-sm font-semibold text-white">Level &amp; streak</h2>

        {GARMON_AD_EARN_MULT_CAP <= 1 ? (
          <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/95">
            Ad payouts use a <strong className="text-amber-100">1× multiplier</strong> only — level and streak do not increase
            ad income right now. Use the controls below to preview what would apply if the cap is raised later.
          </div>
        ) : null}

        <p className="text-xs text-fintech-muted">
          Effective multiplier for this estimate:{" "}
          <span className="font-semibold text-white">{adEarnMult}×</span>
          {multCapped ? (
            <span className="text-fintech-muted"> (capped from {roundMoney2(levelMult * streakMult)}×)</span>
          ) : null}
        </p>

        <div>
          <p className="mb-2 text-xs text-fintech-muted">Ad level (from lifetime ad earnings)</p>
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
          <p className="mt-2 text-xs text-fintech-muted">{LEVEL_OPTIONS.find((l) => l.id === levelId)?.hint}</p>
          {lifetimeAdUsd != null ? (
            <p className="mt-1 text-xs text-violet-300/85">
              Your lifetime ad earnings (from GarmonPay):{" "}
              <span className="font-medium text-white">${roundMoney2(lifetimeAdUsd).toFixed(2)}</span>
              <span className="text-fintech-muted"> — level auto-set; tap another tier to compare.</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-fintech-muted">Sign in and watch ads to sync your level from earnings.</p>
          )}
        </div>

        <div className={GARMON_AD_EARN_MULT_CAP <= 1 ? "rounded-lg border border-white/5 bg-white/[0.02] p-3" : ""}>
          <p className="mb-2 text-xs text-fintech-muted">
            Streak multiplier {GARMON_AD_EARN_MULT_CAP <= 1 ? <span className="text-fintech-muted/80">(preview only for ads)</span> : null}
          </p>
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
        <p className="mt-1 text-3xl font-black tabular-nums text-fintech-money">${dailyShown.toFixed(2)}</p>
        <p className="mt-2 text-xs text-fintech-muted">
          Base before level/streak:{" "}
          <span className="text-white/90">${roundMoney2(baseDailyBeforeMult).toFixed(2)}</span>
          <span className="text-fintech-muted"> × {adEarnMult}×</span>
          {rawDaily > MAX_USER_EARNINGS_PER_DAY ? (
            <span className="text-amber-400/90">
              {" "}
              — uncapped would be ${roundMoney2(rawDaily).toFixed(2)}; daily cap applies.
            </span>
          ) : null}
        </p>
        <p className="mt-4 text-xs text-fintech-muted">Projected 30 days</p>
        <p className="text-xl font-bold tabular-nums text-white">${monthlyShown.toFixed(2)}</p>
        <p className="mt-1 text-[11px] leading-snug text-fintech-muted/90">
          30 × ${dailyShown.toFixed(2)} (same rounded daily shown above — no mismatch).
        </p>
      </div>
    </div>
  );
}
