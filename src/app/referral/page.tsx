"use client";

import { useMemo, useState } from "react";

type BannerTheme = "gold" | "purple" | "dark";

const tiers = [
  { name: "Bronze", range: "1 to 9 refs", join: "$2.00", upgrade: "Basic $5 / Pro $15 / Elite $25" },
  { name: "Silver", range: "10 to 24", join: "$2.50", upgrade: "Basic $6 / Pro $16 / Elite $26" },
  { name: "Gold", range: "25 to 49", join: "$3.00", upgrade: "Basic $7 / Pro $17 / Elite $27" },
  { name: "Diamond", range: "50 plus", join: "$4.00", upgrade: "Basic $8 / Pro $18 / Elite $28" },
];

const steps = [
  "Get Your Unique Link",
  "Share It Anywhere",
  "Friend Joins Free",
  "Earn When They Upgrade",
  "Earn From Their Ad Views",
  "Cash Out Anytime",
];

export default function ReferralPage() {
  const referralCode = "GARM-A7X9";
  const referralUrl = `https://garmonpay.com/r/${referralCode}`;
  const [copied, setCopied] = useState(false);
  const [bannerTheme, setBannerTheme] = useState<BannerTheme>("gold");

  const socialLinks = useMemo(() => {
    const text = encodeURIComponent(`Join me on GarmonPay and start earning with my referral link: ${referralUrl}`);
    const encodedUrl = encodeURIComponent(referralUrl);

    return {
      twitter: `https://twitter.com/intent/tweet?text=${text}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      whatsapp: `https://wa.me/?text=${text}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${text}`,
    };
  }, [referralUrl]);

  const bannerClass = {
    gold: "from-[#3f2700] via-[#5f3f00] to-[#2a1700] border-[#f5c842]/65",
    purple: "from-[#2a0a45] via-[#4b1d79] to-[#1b0730] border-[#a78bfa]/65",
    dark: "from-[#170622] via-[#12031f] to-[#0b0214] border-white/30",
  }[bannerTheme];

  async function handleCopy() {
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-10 px-4 pb-20 pt-10 md:px-6">
      <header className="animate-fadeUp text-center">
        <span className="gp-badge-gold">Referral Center</span>
        <h1 className="font-cinzel gp-gradient-text mt-3 text-4xl md:text-5xl">Grow Faster With Referrals</h1>
      </header>

      <section className="gp-card p-6 md:p-8">
        <h2 className="font-cinzel text-2xl text-[#f5df9e]">Your Referral Code</h2>
        <div className="mt-4 rounded-2xl border border-[#f5c842]/40 bg-[#120420]/80 p-5">
          <p className="text-sm text-[#d2c1e9]">Share your link and earn recurring commissions.</p>
          <p className="font-cinzel mt-3 text-4xl text-[#f5c842]">{referralCode}</p>
          <button type="button" onClick={handleCopy} className="gp-btn-gold mt-5">
            {copied ? "Copied" : "Copy Link"}
          </button>
          <p className="mt-3 break-all text-sm text-[#cebfe2]">{referralUrl}</p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <a className="gp-btn-outline" href={socialLinks.twitter} target="_blank" rel="noreferrer">Twitter</a>
          <a className="gp-btn-outline" href={socialLinks.facebook} target="_blank" rel="noreferrer">Facebook</a>
          <a className="gp-btn-outline" href={socialLinks.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>
          <a className="gp-btn-outline" href={socialLinks.telegram} target="_blank" rel="noreferrer">Telegram</a>
        </div>
      </section>

      <section className="gp-card p-6 md:p-8">
        <h2 className="font-cinzel text-2xl text-[#f5df9e]">Banner Generator</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setBannerTheme("gold")} className={`gp-btn-outline ${bannerTheme === "gold" ? "ring-2 ring-[#f5c842]/55" : ""}`}>Gold</button>
          <button type="button" onClick={() => setBannerTheme("purple")} className={`gp-btn-outline ${bannerTheme === "purple" ? "ring-2 ring-[#f5c842]/55" : ""}`}>Purple</button>
          <button type="button" onClick={() => setBannerTheme("dark")} className={`gp-btn-outline ${bannerTheme === "dark" ? "ring-2 ring-[#f5c842]/55" : ""}`}>Dark</button>
        </div>

        <div className={`relative mt-5 overflow-hidden rounded-2xl border bg-gradient-to-r p-6 ${bannerClass}`}>
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.25) 0 8px, transparent 8px 18px)" }}
          />
          <div className="relative z-10">
            <p className="font-cinzel text-2xl text-[#f8e7ad]">GarmonPay</p>
            <p className="mt-1 text-[#e6d8fb]">Get Seen. Get Known. Get Paid.</p>
            <div className="mt-4 inline-block rounded-xl border border-[#f5c842]/60 bg-black/30 px-4 py-2">
              <span className="font-cinzel text-[#f5c842]">{referralCode}</span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm text-[#cdbce6]">Tip: right click the banner preview and save image.</p>
      </section>

      <section className="gp-card p-6 md:p-8">
        <h2 className="font-cinzel text-2xl text-[#f5df9e]">Referral Tiers</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {tiers.map((tier) => (
            <div key={tier.name} className="rounded-xl border border-[#f5c842]/30 bg-[#140524]/85 p-4">
              <h3 className="font-cinzel text-xl text-[#f5c842]">{tier.name}</h3>
              <p className="mt-1 text-sm text-[#d7c6ef]">{tier.range}</p>
              <p className="mt-3 text-sm text-[#ebdbff]">Join bonus: {tier.join}</p>
              <p className="mt-1 text-sm text-[#ebdbff]">Upgrade commission: {tier.upgrade}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="gp-card p-6 md:p-8">
        <h2 className="font-cinzel text-2xl text-[#f5df9e]">How It Works</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {steps.map((step, index) => (
            <div key={step} className="flex items-start gap-3 rounded-xl border border-[#f5c842]/20 bg-[#12041f]/80 p-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5c842] font-bold text-[#23162e]">
                {index + 1}
              </span>
              <div>
                <p className="font-semibold text-[#f0e4ff]">{step}</p>
                <p className="text-sm text-[#c8b7df]">Follow this step to move your referrals toward real payouts and commissions.</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
