"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Cinzel_Decorative } from "next/font/google";
import { createBrowserClient } from "@/lib/supabase";

type PlatformKey = "youtube" | "tiktok" | "instagram" | "facebook" | "garmonpay" | "business";
type FilterOption =
  | "All"
  | "YouTube"
  | "TikTok"
  | "Instagram"
  | "Facebook"
  | "Business"
  | "Real Estate"
  | "Jobs"
  | "Products"
  | "Entertainment"
  | "Health";

type CampaignItem = {
  id: string;
  title: string;
  advertiser: string;
  platform: PlatformKey;
  category: string;
  goal: string;
  reward: string;
  progress: number;
  spentBudget: number;
  totalBudget: number;
  description: string;
};

type CreatorPackage = {
  name: string;
  price: string;
  deliverables: string;
  deliveryTime: string;
  bestFor: string;
  featured?: "popular" | "gold";
};

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const TICKER_MESSAGES = [
  "New campaign started — YouTube Channel reached 500 subscribers",
  "TikTok creator gained 1200 views today",
  "Instagram reel boosted to 800 real views",
  "Facebook page gained 340 new followers",
  "Business ad reached 2000 GarmonPay members",
] as const;

const FILTER_OPTIONS: FilterOption[] = [
  "All",
  "YouTube",
  "TikTok",
  "Instagram",
  "Facebook",
  "Business",
  "Real Estate",
  "Jobs",
  "Products",
  "Entertainment",
  "Health",
];

const PLATFORM_STYLE: Record<
  PlatformKey,
  {
    label: string;
    emoji: string;
    badgeClass: string;
    borderClass: string;
    accentClass: string;
  }
> = {
  youtube: {
    label: "YouTube",
    emoji: "🔴",
    badgeClass: "bg-red-500/90 text-white",
    borderClass: "border-l-[#eab308]",
    accentClass: "from-red-500/30 to-red-900/20",
  },
  tiktok: {
    label: "TikTok",
    emoji: "⚫⚪",
    badgeClass: "bg-black text-white",
    borderClass: "border-l-[#6b46c1]",
    accentClass: "from-zinc-800/70 to-zinc-950/40",
  },
  instagram: {
    label: "Instagram",
    emoji: "🩷",
    badgeClass:
      "bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-500 text-white",
    borderClass: "border-l-pink-400",
    accentClass: "from-pink-500/30 to-purple-600/20",
  },
  facebook: {
    label: "Facebook",
    emoji: "🔵",
    badgeClass: "bg-blue-600 text-white",
    borderClass: "border-l-blue-400",
    accentClass: "from-blue-500/30 to-blue-950/20",
  },
  garmonpay: {
    label: "GarmonPay",
    emoji: "🟨",
    badgeClass: "bg-[#eab308] text-[#12081f]",
    borderClass: "border-l-[#eab308]",
    accentClass: "from-amber-500/30 to-yellow-900/20",
  },
  business: {
    label: "Business",
    emoji: "🟩",
    badgeClass: "bg-emerald-600 text-white",
    borderClass: "border-l-emerald-500",
    accentClass: "from-emerald-500/30 to-emerald-900/20",
  },
};

const FEATURED_PLACEHOLDERS: CampaignItem[] = [
  {
    id: "feat-1",
    title: "YouTube Music Channel",
    advertiser: "Luna Beats Studio",
    platform: "youtube",
    category: "Entertainment",
    goal: "Get 500 YouTube subscribers",
    reward: "Earn $0.05 per view",
    progress: 42,
    spentBudget: 84,
    totalBudget: 199,
    description: "New music drops and weekly live sessions.",
  },
  {
    id: "feat-2",
    title: "TikTok Comedy Creator",
    advertiser: "LaughLoop Creator",
    platform: "tiktok",
    category: "Entertainment",
    goal: "Boost TikTok video to 1000 views",
    reward: "Earn $0.06 per view",
    progress: 58,
    spentBudget: 116,
    totalBudget: 199,
    description: "Short-form comedy skits with daily uploads.",
  },
  {
    id: "feat-3",
    title: "Instagram Fashion Brand",
    advertiser: "Velvet Avenue",
    platform: "instagram",
    category: "Products",
    goal: "Grow Instagram by 1200 followers",
    reward: "Earn $0.10 per follow",
    progress: 37,
    spentBudget: 74,
    totalBudget: 199,
    description: "Streetwear collection and influencer collabs.",
  },
  {
    id: "feat-4",
    title: "Facebook Local Business",
    advertiser: "CitySide Cafe",
    platform: "facebook",
    category: "Business",
    goal: "Get 700 Facebook page followers",
    reward: "Earn $0.08 per follow",
    progress: 66,
    spentBudget: 132,
    totalBudget: 199,
    description: "Daily offers and grand opening promotion.",
  },
  {
    id: "feat-5",
    title: "YouTube Tech Review",
    advertiser: "TechScope Reviews",
    platform: "youtube",
    category: "Products",
    goal: "Reach 3000 authentic views",
    reward: "Earn $0.05 per view",
    progress: 24,
    spentBudget: 48,
    totalBudget: 199,
    description: "Hands-on gadgets and honest product breakdowns.",
  },
  {
    id: "feat-6",
    title: "GarmonPay Featured Advertiser",
    advertiser: "GarmonPay Spotlight",
    platform: "garmonpay",
    category: "Business",
    goal: "Reach 2000 active members",
    reward: "Earn $0.07 per interaction",
    progress: 72,
    spentBudget: 143,
    totalBudget: 199,
    description: "Premium highlighted campaign slot.",
  },
];

const CLASSIFIED_PLACEHOLDERS: CampaignItem[] = [
  ...FEATURED_PLACEHOLDERS,
  {
    id: "class-7",
    title: "Now Hiring — Remote Support Team",
    advertiser: "NovaDesk Careers",
    platform: "business",
    category: "Jobs",
    goal: "Get 200 qualified job applications",
    reward: "Earn $0.09 per completed application",
    progress: 31,
    spentBudget: 62,
    totalBudget: 199,
    description: "Flexible remote roles with weekly payouts.",
  },
  {
    id: "class-8",
    title: "Urban Living Apartment Listings",
    advertiser: "PrimeEstate Group",
    platform: "business",
    category: "Real Estate",
    goal: "Generate 300 verified property inquiries",
    reward: "Earn $0.12 per inquiry",
    progress: 47,
    spentBudget: 94,
    totalBudget: 199,
    description: "Downtown rentals and luxury living options.",
  },
];

const CREATOR_PACKAGES: CreatorPackage[] = [
  {
    name: "Starter Boost",
    price: "$19.99",
    deliverables: "500 real views or 200 followers",
    deliveryTime: "3 to 5 days",
    bestFor: "New creators",
  },
  {
    name: "Standard Boost",
    price: "$49.99",
    deliverables: "1500 real views or 600 followers",
    deliveryTime: "5 to 7 days",
    bestFor: "Growing channels",
  },
  {
    name: "Growth Boost",
    price: "$99.99",
    deliverables: "3500 real views or 1400 followers",
    deliveryTime: "7 to 10 days",
    bestFor: "Scaling content",
  },
  {
    name: "Pro Boost",
    price: "$199.99",
    deliverables: "8000 real views or 3200 followers",
    deliveryTime: "10 to 14 days",
    bestFor: "Serious creators",
    featured: "popular",
  },
  {
    name: "Elite Boost",
    price: "$399.99",
    deliverables: "18000 real views or 7200 followers",
    deliveryTime: "14 to 21 days",
    bestFor: "Viral campaigns",
    featured: "gold",
  },
  {
    name: "Premium Brand",
    price: "$799.99",
    deliverables: "40000 real views or 16000 followers",
    deliveryTime: "21 to 30 days",
    bestFor: "Brands and agencies",
    featured: "gold",
  },
];

const CAMPAIGN_TYPE_OPTIONS = [
  "YouTube Video Views",
  "YouTube Subscribers",
  "TikTok Video Views",
  "TikTok Followers",
  "TikTok Likes",
  "Instagram Reel Views",
  "Instagram Followers",
  "Instagram Likes",
  "Facebook Video Views",
  "Facebook Page Likes",
  "Facebook Followers",
  "GarmonPay General Ad",
] as const;

type SubmissionForm = {
  campaign_type: string;
  content_url: string;
  campaign_goal: string;
  target_audience: string;
  package_selected: string;
  contact_email: string;
};

const DEFAULT_FORM: SubmissionForm = {
  campaign_type: CAMPAIGN_TYPE_OPTIONS[0],
  content_url: "",
  campaign_goal: "",
  target_audience: "",
  package_selected: CREATOR_PACKAGES[0].name,
  contact_email: "",
};

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function getText(obj: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const raw = obj[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return fallback;
}

function getNumber(obj: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const raw = obj[key];
    const value = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function normalizePlatform(value: string): PlatformKey {
  const v = value.toLowerCase();
  if (v.includes("youtube")) return "youtube";
  if (v.includes("tiktok")) return "tiktok";
  if (v.includes("instagram")) return "instagram";
  if (v.includes("facebook")) return "facebook";
  if (v.includes("business")) return "business";
  if (v.includes("garmon")) return "garmonpay";
  return "business";
}

export default function AdvertiseLandingPage() {
  const [selectedFilter, setSelectedFilter] = useState<FilterOption>("All");
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [formData, setFormData] = useState<SubmissionForm>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createBrowserClient();
      if (!supabase) return;

      const { data } = await supabase
        .from("garmon_ads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(24);

      if (cancelled || !Array.isArray(data) || data.length === 0) return;

      const mapped = data
        .map((row, index) => {
          const r = toRecord(row);
          const title = getText(r, ["title", "ad_title", "name"], `Live Campaign ${index + 1}`);
          const advertiser = getText(
            r,
            ["advertiser_name", "business_name", "brand_name", "company_name"],
            "Verified Advertiser"
          );
          const category = getText(r, ["category", "campaign_category", "vertical"], "Business");
          const source = getText(r, ["platform", "campaign_type", "type", "ad_type"], title);
          const platform = normalizePlatform(source);
          const goal = getText(r, ["goal", "campaign_goal"], "Drive real engagement");
          const rewardUsd = getNumber(r, ["member_reward_usd", "reward_usd"], 0);
          const reward =
            rewardUsd > 0
              ? `Earn $${rewardUsd.toFixed(2)} per action`
              : "Earn rewards for verified engagement";
          const totalBudget = getNumber(r, ["total_budget", "budget", "amount"], 0);
          const remainingBudget = getNumber(r, ["remaining_budget"], 0);
          const spentBudget =
            totalBudget > 0
              ? Math.max(0, totalBudget - remainingBudget)
              : getNumber(r, ["spent_budget", "budget_spent"], 0);
          const progress =
            totalBudget > 0 ? Math.min(100, Math.round((spentBudget / totalBudget) * 100)) : 0;

          return {
            id: getText(r, ["id"], `ad-${index}`),
            title,
            advertiser,
            platform,
            category,
            goal,
            reward,
            progress,
            spentBudget,
            totalBudget,
            description: getText(
              r,
              ["description", "ad_copy", "headline"],
              "Campaign live now with real member engagement."
            ),
          } as CampaignItem;
        })
        .filter((campaign) => campaign.title.length > 0);

      if (!cancelled && mapped.length > 0) {
        setCampaigns(mapped);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const featuredCampaigns = campaigns.length > 0 ? campaigns.slice(0, 6) : FEATURED_PLACEHOLDERS;
  const classifiedSource =
    campaigns.length > 0 ? campaigns.slice(0, Math.max(8, campaigns.length)) : CLASSIFIED_PLACEHOLDERS;

  const filteredClassified = useMemo(() => {
    const base = classifiedSource.slice(0, 8);
    if (selectedFilter === "All") return base;

    return base.filter((campaign) => {
      const platformLabel = PLATFORM_STYLE[campaign.platform].label.toLowerCase();
      const category = campaign.category.toLowerCase();
      const filter = selectedFilter.toLowerCase();

      if (
        ["youtube", "tiktok", "instagram", "facebook", "business"].includes(filter) &&
        platformLabel.includes(filter)
      ) {
        return true;
      }

      return category.includes(filter);
    });
  }, [classifiedSource, selectedFilter]);

  const updateField = (field: keyof SubmissionForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const supabase = createBrowserClient();
      if (!supabase) {
        throw new Error("Could not connect to submission service. Please try again.");
      }

      const payload = {
        campaign_type: formData.campaign_type,
        content_url: formData.content_url,
        campaign_goal: formData.campaign_goal,
        target_audience: formData.target_audience,
        package_selected: formData.package_selected,
        contact_email: formData.contact_email,
        status: "pending",
      };

      const { error } = await supabase.from("ad_campaign_submissions").insert(payload);
      if (error) {
        throw new Error(error.message);
      }

      setSubmitSuccess(
        "Campaign submitted successfully. Our team will review and activate your campaign within 24 hours. You will receive a confirmation email shortly."
      );
      setFormData(DEFAULT_FORM);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit campaign.";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <style jsx global>{`
        @keyframes gp-ticker-right {
          0% {
            transform: translateX(-50%);
          }
          100% {
            transform: translateX(0%);
          }
        }
        @keyframes gp-shimmer {
          0%,
          100% {
            background-color: rgba(45, 27, 73, 0.6);
          }
          50% {
            background-color: rgba(70, 45, 106, 0.85);
          }
        }
        @keyframes gp-play-pulse {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.45);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 18px rgba(234, 179, 8, 0);
            transform: scale(1.08);
          }
        }
        @keyframes gp-progress {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .gp-ticker-track {
          width: max-content;
          animation: gp-ticker-right 24s linear infinite;
        }
        .gp-video-shimmer {
          animation: gp-shimmer 2.2s ease-in-out infinite;
        }
        .gp-play-pulse {
          animation: gp-play-pulse 2.2s ease-in-out infinite;
        }
        .gp-progress-run {
          animation: gp-progress 4.8s linear infinite;
        }
      `}</style>

      <main className="min-h-screen bg-[#05020a] text-white">
        {/* Hero */}
        <section className="border-y border-[#eab308]/70 bg-gradient-to-br from-[#1b0d2e] via-[#130a23] to-[#090410] px-4 py-10 md:py-14">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <h1
                className={`${cinzel.className} bg-gradient-to-r from-[#fde047] via-[#facc15] to-[#d97706] bg-clip-text text-3xl font-bold leading-tight text-transparent md:text-5xl`}
              >
                Get Your Content Seen By Real People
              </h1>
              <p className="mt-5 max-w-2xl text-base text-violet-200/90 md:text-lg">
                GarmonPay members get rewarded for watching your videos, following your pages, and
                engaging with your content. Real people. Real engagement. Real growth.
              </p>
            </div>

            <div className="rounded-2xl border border-violet-400/30 bg-[#0f071a]/80 p-6">
              <div className="flex flex-wrap gap-3">
                <span className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white">
                  🔴 YouTube
                </span>
                <span className="rounded-full bg-gradient-to-r from-zinc-100 via-zinc-800 to-zinc-100 px-4 py-2 text-sm font-semibold text-black">
                  ⚫⚪ TikTok
                </span>
                <span className="rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white">
                  🩷 Instagram
                </span>
                <span className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                  🔵 Facebook
                </span>
              </div>

              <div className="mt-5 space-y-2 text-sm text-violet-200/95">
                <p>10,000 plus Active Members Ready To Engage</p>
                <p>Real Human Engagement Only — Anti-Bot Protected</p>
                <p>Campaigns Start Within 24 Hours</p>
              </div>
            </div>
          </div>
        </section>

        {/* Ticker */}
        <section className="overflow-hidden border-b border-[#eab308]/50 bg-[#0a0514] py-3">
          <div className="gp-ticker-track flex items-center gap-10 px-4 text-sm font-semibold text-[#facc15]">
            {[...TICKER_MESSAGES, ...TICKER_MESSAGES].map((msg, idx) => (
              <span key={`${msg}-${idx}`} className="whitespace-nowrap">
                {msg}
              </span>
            ))}
          </div>
        </section>

        {/* Featured Campaigns */}
        <section className="mx-auto max-w-7xl px-4 py-12 md:py-16">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <span className="inline-block rounded-full border border-[#eab308]/70 bg-[#eab308]/20 px-3 py-1 text-xs font-bold tracking-[0.18em] text-[#fde047]">
                LIVE
              </span>
              <h2 className={`${cinzel.className} mt-3 text-2xl font-bold text-[#fde047] md:text-3xl`}>
                Featured Campaigns
              </h2>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredCampaigns.map((campaign, index) => {
              const platform = PLATFORM_STYLE[campaign.platform];
              return (
                <article
                  key={campaign.id}
                  className="rounded-2xl border border-violet-400/30 bg-[#11091d] p-4 shadow-[0_0_40px_-18px_rgba(139,92,246,0.55)]"
                >
                  <div className="relative overflow-hidden rounded-xl border border-violet-400/30">
                    <div className="gp-video-shimmer relative flex h-52 items-center justify-center bg-gradient-to-br from-[#160d28] to-[#24123d]">
                      <span className="gp-play-pulse inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#eab308] text-xl font-bold text-[#1a102b]">
                        ▶
                      </span>
                    </div>
                    <div className="absolute left-3 top-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${platform.badgeClass}`}>
                        {platform.emoji} {platform.label}
                      </span>
                    </div>
                    <div className="absolute right-3 top-3">
                      <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-violet-100">
                        {campaign.category}
                      </span>
                    </div>
                    <div className="absolute bottom-0 left-0 h-1.5 w-full overflow-hidden bg-black/45">
                      <span
                        className="gp-progress-run block h-full w-2/5 bg-gradient-to-r from-[#facc15] to-[#eab308]"
                        style={{ animationDelay: `${index * 0.35}s` }}
                      />
                    </div>
                  </div>

                  <h3 className="mt-4 text-lg font-semibold text-[#fde047]">{campaign.title}</h3>
                  <p className="mt-1 text-sm text-violet-300/90">{campaign.description}</p>
                  <Link
                    href="/dashboard"
                    className="mt-4 inline-flex rounded-lg bg-[#eab308] px-4 py-2 text-sm font-semibold text-[#12081f] transition hover:bg-[#fde047]"
                  >
                    Watch and Earn
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        {/* Filter bar */}
        <section className="border-y border-white/10 bg-[#0a0613]">
          <div className="mx-auto max-w-7xl overflow-x-auto px-4 py-4">
            <div className="flex min-w-max gap-2">
              {FILTER_OPTIONS.map((option) => {
                const active = selectedFilter === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSelectedFilter(option)}
                    className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm transition ${
                      active
                        ? "border-[#eab308] bg-[#eab308]/20 text-[#fde047]"
                        : "border-white/15 bg-white/5 text-violet-300 hover:border-violet-400/50"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Classified listings */}
        <section className="mx-auto max-w-7xl px-4 py-12 md:py-16">
          <h2 className={`${cinzel.className} text-2xl font-bold text-[#fde047] md:text-3xl`}>
            All Active Campaigns
          </h2>
          <p className="mt-2 text-sm text-violet-300/85">
            Browse active creator and business campaigns in a live classified marketplace layout.
          </p>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {filteredClassified.map((campaign) => {
              const platform = PLATFORM_STYLE[campaign.platform];
              return (
                <article
                  key={campaign.id}
                  className={`rounded-xl border border-white/10 border-l-4 bg-gradient-to-r ${platform.accentClass} ${platform.borderClass} p-5`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${platform.badgeClass}`}>
                      {platform.emoji} {platform.label}
                    </span>
                    <span className="text-xs text-violet-300">{campaign.category}</span>
                  </div>

                  <h3 className="mt-4 text-lg font-semibold text-white">{campaign.title}</h3>
                  <p className="mt-1 text-sm text-violet-300">By {campaign.advertiser}</p>
                  <p className="mt-3 text-sm text-violet-100/95">{campaign.goal}</p>
                  <p className="mt-2 text-sm font-medium text-[#fde047]">{campaign.reward}</p>

                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-violet-300">
                      <span>Campaign progress</span>
                      <span>{campaign.progress}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-black/35">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#eab308] to-[#facc15]"
                        style={{ width: `${Math.max(5, campaign.progress)}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-violet-300/90">
                    Budget: ${campaign.spentBudget.toFixed(2)} spent / ${campaign.totalBudget.toFixed(2)} total
                  </div>

                  <Link
                    href="/dashboard"
                    className="mt-4 inline-flex rounded-lg border border-[#eab308] px-4 py-2 text-sm font-semibold text-[#fde047] transition hover:bg-[#eab308]/15"
                  >
                    Start Earning
                  </Link>
                </article>
              );
            })}
          </div>

          {filteredClassified.length === 0 && (
            <p className="mt-8 rounded-xl border border-violet-500/30 bg-violet-950/25 p-4 text-sm text-violet-200">
              No campaigns in this category yet. Try another filter.
            </p>
          )}
        </section>

        {/* Packages */}
        <section className="border-y border-white/10 bg-[#090412] px-4 py-14 md:py-18">
          <div className="mx-auto max-w-7xl">
            <h2 className={`${cinzel.className} text-2xl font-bold text-[#fde047] md:text-3xl`}>
              Advertise Your Content — Packages For Every Creator
            </h2>
            <p className="mt-3 max-w-4xl text-sm text-violet-200/90 md:text-base">
              Choose a package, submit your YouTube, TikTok, Instagram, or Facebook link, and we
              send real GarmonPay members to engage with your content.
            </p>

            <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {CREATOR_PACKAGES.map((pkg) => {
                const goldCard = pkg.featured === "gold";
                return (
                  <article
                    key={pkg.name}
                    className={`relative rounded-2xl border bg-[#11091d] p-6 ${
                      goldCard ? "border-[#eab308]/70" : "border-white/12"
                    }`}
                  >
                    {pkg.featured === "popular" && (
                      <span className="absolute -top-3 left-5 rounded-full bg-[#eab308] px-3 py-1 text-xs font-bold text-[#12081f]">
                        MOST POPULAR
                      </span>
                    )}

                    <h3 className="text-xl font-semibold text-white">{pkg.name}</h3>
                    <p className="mt-2 text-3xl font-bold text-[#fde047]">{pkg.price}</p>
                    <p className="mt-3 text-sm text-violet-200">{pkg.deliverables}</p>
                    <p className="mt-1 text-sm text-violet-300">Estimated delivery: {pkg.deliveryTime}</p>
                    <p className="mt-1 text-sm text-violet-300">Best for: {pkg.bestFor}</p>

                    <ul className="mt-5 space-y-2 text-sm text-violet-100">
                      <li>✓ Real human engagement</li>
                      <li>✓ Anti-bot protected</li>
                      <li>✓ Campaign dashboard access</li>
                      <li>✓ 24/7 support</li>
                    </ul>

                    <Link
                      href="/register"
                      className="mt-6 inline-flex rounded-lg bg-[#eab308] px-4 py-2 text-sm font-semibold text-[#12081f] transition hover:bg-[#fde047]"
                    >
                      Get Started
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Submission form */}
        <section className="mx-auto max-w-4xl px-4 py-14 md:py-16">
          <h2 className={`${cinzel.className} text-2xl font-bold text-[#fde047] md:text-3xl`}>
            Submit Your Campaign
          </h2>
          <p className="mt-3 text-sm text-violet-200/90 md:text-base">
            Already purchased a package? Submit your content link here and our team will start your
            campaign within 24 hours.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-7 rounded-2xl border border-[#eab308]/60 bg-gradient-to-br from-[#140a24] to-[#090412] p-5 md:p-8"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-2 block text-violet-200">Campaign Type</span>
                <select
                  value={formData.campaign_type}
                  onChange={(e) => updateField("campaign_type", e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0e0818] px-4 py-3 text-white outline-none focus:border-[#eab308]"
                >
                  {CAMPAIGN_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm md:col-span-2">
                <span className="mb-2 block text-violet-200">Content URL</span>
                <input
                  type="url"
                  required
                  placeholder="Enter your YouTube TikTok Instagram or Facebook link"
                  value={formData.content_url}
                  onChange={(e) => updateField("content_url", e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0e0818] px-4 py-3 text-white placeholder:text-violet-400 outline-none focus:border-[#eab308]"
                />
              </label>

              <label className="text-sm">
                <span className="mb-2 block text-violet-200">Campaign Goal</span>
                <input
                  type="text"
                  required
                  placeholder="Example: Get 500 new subscribers"
                  value={formData.campaign_goal}
                  onChange={(e) => updateField("campaign_goal", e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0e0818] px-4 py-3 text-white placeholder:text-violet-400 outline-none focus:border-[#eab308]"
                />
              </label>

              <label className="text-sm">
                <span className="mb-2 block text-violet-200">Target Audience</span>
                <input
                  type="text"
                  required
                  placeholder="Example: Age 18 to 35 interested in music"
                  value={formData.target_audience}
                  onChange={(e) => updateField("target_audience", e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0e0818] px-4 py-3 text-white placeholder:text-violet-400 outline-none focus:border-[#eab308]"
                />
              </label>

              <label className="text-sm">
                <span className="mb-2 block text-violet-200">Package Selected</span>
                <select
                  value={formData.package_selected}
                  onChange={(e) => updateField("package_selected", e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0e0818] px-4 py-3 text-white outline-none focus:border-[#eab308]"
                >
                  {CREATOR_PACKAGES.map((pkg) => (
                    <option key={pkg.name} value={pkg.name}>
                      {pkg.name} ({pkg.price})
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-2 block text-violet-200">Contact Email</span>
                <input
                  type="email"
                  required
                  value={formData.contact_email}
                  onChange={(e) => updateField("contact_email", e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0e0818] px-4 py-3 text-white placeholder:text-violet-400 outline-none focus:border-[#eab308]"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#eab308] px-6 py-3 text-base font-semibold text-[#12081f] transition hover:bg-[#fde047] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit Campaign"}
            </button>

            {submitSuccess && (
              <p className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/15 p-3 text-sm text-emerald-200">
                {submitSuccess}
              </p>
            )}

            {submitError && (
              <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/15 p-3 text-sm text-red-200">
                {submitError}
              </p>
            )}

            <p className="mt-5 text-xs leading-relaxed text-violet-300/90">
              After submitting our team reviews your campaign within 24 hours and activates it for
              GarmonPay members to engage with. All engagement is real human activity from verified
              members.
            </p>
          </form>
        </section>

        {/* Why section */}
        <section className="border-t border-white/10 bg-[#08040f] px-4 py-14 md:py-16">
          <div className="mx-auto max-w-7xl">
            <h2 className={`${cinzel.className} text-2xl font-bold text-[#fde047] md:text-3xl`}>
              Why GarmonPay
            </h2>

            <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
              {[
                {
                  title: "Real Human Engagement",
                  body: "Our members are real verified people who are rewarded for genuine engagement, not bots or fake accounts.",
                },
                {
                  title: "Content Creator Friendly",
                  body: "Whether you have 100 subscribers or 100000 we have a package for your budget and growth goals.",
                },
                {
                  title: "Anti-Fraud Protection",
                  body: "Every engagement action is validated by our anti-cheat system so you only pay for real verified interactions.",
                },
                {
                  title: "Transparent Reporting",
                  body: "Track your campaign progress in real time through your advertiser dashboard.",
                },
                {
                  title: "Affordable Packages",
                  body: "Campaigns start at just $19.99 making professional promotion accessible to every creator.",
                },
              ].map((card) => (
                <article
                  key={card.title}
                  className="rounded-xl border border-white/10 bg-gradient-to-br from-[#120a1f] to-[#0b0614] p-5"
                >
                  <h3 className="text-lg font-semibold text-[#fde047]">{card.title}</h3>
                  <p className="mt-2 text-sm text-violet-200/90">{card.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
