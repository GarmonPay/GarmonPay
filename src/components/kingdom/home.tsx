"use client";
import { useMember } from "@/components/member/useMember";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Eye, Rocket, Trophy, UserPlus, Users } from "lucide-react";
import { readWalletSession } from "@/lib/solana/session-client";

const cards = [
  { href: "/solana/launchpad", title: "Launch", text: "Create and launch on Devnet. Mainnet remains paused.", action: "Open Launchpad", image: "/images/kingdom/cards/launch-coin.webp", alt: "Gold rocket rising through electric-blue energy." },
  { href: "/solana/trade", title: "Trade", text: "Discover verified coins. Mainnet trading remains paused.", action: "Explore markets", image: "/images/kingdom/cards/trade-follow.webp", alt: "Holographic cyan and gold candlesticks." },
  { href: "/solana/earn", title: "Earn", text: "Explore watch, play and learning opportunities. Payouts paused.", action: "Explore earning", image: "/images/kingdom/cards/watch-earn.webp", alt: "Cyan holographic play portal with gold light trails." },
  { href: "/solana/advertise", title: "Advertise", text: "Plan your campaign and grow your brand. Checkout paused.", action: "Plan a campaign", image: "/images/kingdom/cards/advertise.webp", alt: "Gold megaphone with blue energy." },
  { href: "/member/community", title: "Community", text: "Follow, engage and grow together.", action: "Join the community", image: null, alt: "" },
] as const;

const activityIcons = [Eye, Trophy, UserPlus, Rocket] as const;

type Coin = { mint: string; name: string; symbol: string; tradingOpen?: boolean; volumeLamports?: string | number | null };

function volumeLabel(lamports: string | number | null | undefined) {
  const raw = typeof lamports === "number" && Number.isSafeInteger(lamports) ? String(lamports) : lamports;
  if (typeof raw !== "string" || !/^\d{1,30}$/.test(raw)) return "Verified volume unavailable";
  const value = BigInt(raw), scale = BigInt("1000000000");
  if (value > BigInt(0) && value < BigInt("100000")) return "<0.0001 SOL Devnet volume";
  const fraction = ((value % scale) / BigInt("100000")).toString().padStart(4, "0").replace(/0+$/, "");
  return `${(value / scale).toLocaleString("en-US")}${fraction ? `.${fraction}` : ""} SOL Devnet volume`;
}

function shortWallet(wallet: string) {
  return wallet.length > 10 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;
}

export function KingdomHome() {
  const [motionPaused, setMotionPaused] = useState(false);
  const [wallet, setWallet] = useState<string | null>(null);
  const { snapshot: snap } = useMember();
  const [coins, setCoins] = useState<Coin[] | null>(null);
  const [coinError, setCoinError] = useState(false);
  const [mine, setMine] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    let generation = 0;
    const refreshWallet = () => {
      const request = ++generation;
      setWallet(null);
      readWalletSession().then(read => {
        if (active && request === generation) setWallet(read.state === "active" ? read.wallet : null);
      }).catch(() => {});
    };
    refreshWallet();
    window.addEventListener("garmonpay-session-change", refreshWallet);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    fetch("/api/solana/launches/coins", { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(body => { if (active) setCoins(Array.isArray(body?.coins) ? body.coins.slice(0, 5) : []); })
      .catch(() => { if (active) { setCoinError(true); setCoins([]); } })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false; ++generation; controller.abort(); window.clearTimeout(timeout);
      window.removeEventListener("garmonpay-session-change", refreshWallet);
    };
  }, []);

  useEffect(() => {
    if (!wallet) { setMine(null); return; }
    let active = true;
    fetch("/api/solana/launches/coins?mine=1", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((body) => { if (active) setMine(Array.isArray(body?.coins) ? body.coins.length : 0); })
      .catch(() => { if (active) setMine(null); });
    return () => { active = false; };
  }, [wallet]);

  const views = snap?.earnings?.verifiedViews;
  const referrals = snap?.referralTotal;
  const fills = snap?.paper?.fillCount;
  const paperSol = snap?.paper?.cashSol;
  const stats = [
    { label: "Verified views", value: wallet && typeof views === "number" ? String(views) : "—" },
    { label: "Referrals", value: wallet && typeof referrals === "number" ? String(referrals) : "—" },
    { label: "Paper fills", value: wallet && typeof fills === "number" ? String(fills) : "—" },
    { label: "Coins launched", value: wallet && mine !== null ? String(mine) : "—" },
  ];

  return (
    <main id="main-content" className="gp-lock">
      <section className="gp-lock-hero" aria-label="GarmonPay">
        <div className="gp-lock-scene" data-motion-paused={motionPaused}>
          <img src="/images/kingdom/locked-hero.jpg" alt="Crowned golden lion with blue eyes and a gold G coin, in a futuristic midnight city. GARMONPAY. Get seen. Get known. Get paid." width={1030} height={497} fetchPriority="high" decoding="async" />
          <div className="gp-scene-stage" aria-hidden="true">
            <div className="gp-energy">
              <span className="gp-energy-city" />
              <span className="gp-energy-lights" />
              <span className="gp-energy-billboard gp-energy-billboard-left" />
              <span className="gp-energy-billboard gp-energy-billboard-right" />
              <span className="gp-energy-particles" />
              <span className="gp-energy-emblem" />
            </div>
            <span className="gp-board-scan gp-board-scan-left" />
            <span className="gp-board-scan gp-board-scan-right" />
            <span className="gp-sky-glint" />
            <span className="gp-sky-glint" />
            <span className="gp-sky-glint" />
            <span className="gp-sky-glint" />
            <span className="gp-sky-glint" />
            <span className="gp-sky-glint" />
          </div>
          <button type="button" className="gp-city-motion-toggle" aria-pressed={motionPaused} onClick={() => setMotionPaused(!motionPaused)}>{motionPaused ? "Resume visual effects" : "Pause visual effects"}</button>
        </div>
        <div className="gp-lock-mobile-brand"><h1>GARMON<span>PAY</span></h1><p>GET SEEN. GET KNOWN. GET PAID.</p></div>
        <div className="gp-lock-mobile-actions">
          <button type="button" onClick={() => window.dispatchEvent(new Event("garmonpay:open-wallet"))}>{wallet ? "Wallet connected" : "Connect Wallet"}</button>
          <Link href="/solana/spotlight">Explore Coins</Link>
        </div>
        <section className="gp-lock-cards" aria-label="Platform">
          {cards.map((card) => (
            <Link key={card.href} href={card.href}>
              {card.image ? <img className="gp-lock-card-art" src={card.image} alt={card.alt} width={960} height={540} loading="lazy" decoding="async" /> : <div className="gp-lock-community-art" aria-hidden="true"><Users size={72} /></div>}
              <h2>{card.title}</h2>
              <p>{card.text}</p>
              <span className="gp-lock-card-action">{card.action}</span>
              <ChevronRight className="gp-lock-card-chevron" aria-hidden="true" size={18} />
            </Link>
          ))}
        </section>
      </section>
      <section className="gp-lock-panels" aria-label="Your account">
        <article>
          <h2>Your wallet</h2>
          <p className="gp-lock-status">{wallet ? "Connected" : "Not connected"}</p>
          <p className="gp-lock-address">{wallet ? shortWallet(wallet) : "Connect Wallet to sign in with Phantom, Solflare, or Backpack."}</p>
          <p className="gp-lock-note">{wallet && paperSol ? `${paperSol} virtual SOL. This is paper only and cannot be withdrawn.` : wallet ? "No virtual SOL is recorded for this wallet yet. Eligible accounts start with 10 virtual SOL after ledger activation. It cannot be withdrawn." : "Paper trading requires the reviewed ledger. Eligible accounts start with 10 virtual SOL after activation."}</p>
          <div className="gp-lock-paused">
            <button type="button" disabled>Deposit paused</button>
            <button type="button" disabled>Send paused</button>
            <button type="button" disabled>Receive paused</button>
          </div>
          <p className="gp-lock-note">Deposits, sends, and payouts are paused. Eligible withdrawals start at $2 and are not available. Connecting a wallet only signs a message.</p>
          <Link href="/member">Open member dashboard</Link>
        </article>
        <article>
          <h2>Your activity</h2>
          <p className="gp-lock-note">{wallet ? "Counts from your signed wallet. They are not cash balances." : "Sign in to see verified activity. Sample scores are not shown."}</p>
          <ul>
            {stats.map((stat, index) => {
              const Icon = activityIcons[index];
              return <li key={stat.label}><span className="gp-lock-stat"><Icon size={16} aria-hidden="true" />{stat.label}</span><span>{stat.value}</span></li>;
            })}
          </ul>
        </article>
        <article>
          <div className="gp-lock-panel-heading"><h2>Discover coins</h2><Link href="/solana/spotlight">View all →</Link></div>
          <p className="gp-lock-note">Verified Devnet listings only. Volume is shown when it is available. Listings are not a market ranking.</p>
          {coins === null ? <p>Loading coins…</p> : coinError ? <p>Coin discovery is temporarily unavailable. Refresh to retry.</p> : coins.length === 0 ? <p>No verified coins are listed yet.</p> : (
            <ol>
              {coins.map((coin) => (
                <li key={coin.mint}>
                  <Link href={`/solana/token/${coin.mint}`}>{coin.symbol || coin.name}</Link>
                  <span>{coin.tradingOpen ? "Devnet trading open" : "Devnet · trading closed"} · {volumeLabel(coin.volumeLamports)}</span>
                </li>
              ))}
            </ol>
          )}
        </article>
      </section>
    </main>
  );
}
