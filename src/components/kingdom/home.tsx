"use client";
import { useMember } from "@/components/member/useMember";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, Rocket, Trophy, UserPlus } from "lucide-react";
import { readWalletSession } from "@/lib/solana/session-client";

const cards = [
  { href: "/solana/earn", title: "Watch & Earn", text: "Verified views when a campaign is funded. Nothing is paid now.", action: "Open Watch & Earn", image: "/images/kingdom/cards/watch-earn.webp", alt: "Glowing cyan holographic play portal with gold light trails." },
  { href: "/games", title: "Play Games", text: "Free play is open. Paid entry and prize payouts stay off.", action: "Open games", image: "/images/kingdom/cards/play-games.webp", alt: "Futuristic game controller with cyan circuitry and gold controls." },
  { href: "/solana/launchpad", title: "Launch your coin", text: "Prepare a coin on LaunchLab. Mainnet launch stays paused.", action: "Open Launchpad", image: "/images/kingdom/cards/launch-coin.webp", alt: "Gold rocket rising through electric-blue energy." },
  { href: "/solana/trade", title: "Trade & Follow", text: "Discover Devnet coins and follow traders. Mainnet trading is paused.", action: "Open trading", image: "/images/kingdom/cards/trade-follow.webp", alt: "Holographic cyan and gold candlesticks on a dark market panel." },
  { href: "/solana/advertise", title: "Advertise", text: "Plan a campaign. Checkout is paused and views are not counted here.", action: "Plan a campaign", image: "/images/kingdom/cards/advertise.webp", alt: "Metallic gold megaphone sending blue energy toward a holographic display." },
] as const;

const activityIcons = [Eye, Trophy, UserPlus, Rocket] as const;

type Coin = { mint: string; name: string; symbol: string; tradingOpen?: boolean; volumeLamports?: number | null };

function volumeLabel(lamports: number | null | undefined) {
  if (typeof lamports !== "number" || !Number.isFinite(lamports) || lamports < 0) return "No verified price";
  const sol = lamports / 1_000_000_000;
  return `${sol.toLocaleString("en-US", { maximumFractionDigits: 4 })} SOL Devnet volume`;
}

function shortWallet(wallet: string) {
  return wallet.length > 10 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;
}

export function KingdomHome() {
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
        <div className="gp-lock-scene">
          <img src="/images/kingdom/locked-hero.jpg" alt="Crowned golden lion with blue eyes and a gold G coin, in a futuristic midnight city. GARMONPAY. Get seen. Get known. Get paid." width={1030} height={497} />
          <div className="gp-energy" aria-hidden="true">
            <span className="gp-energy-city" />
            <span className="gp-energy-lights" />
            <span className="gp-energy-billboard gp-energy-billboard-left" />
            <span className="gp-energy-billboard gp-energy-billboard-right" />
            <span className="gp-energy-particles" />
            <span className="gp-energy-emblem" />
          </div>
        </div>
        <div className="gp-lock-mobile-actions">
          <button type="button" onClick={() => window.dispatchEvent(new Event("garmonpay:open-wallet"))}>{wallet ? "Wallet connected" : "Connect Wallet"}</button>
          <Link href="/solana/spotlight">Explore Coins</Link>
        </div>
        <section className="gp-lock-cards" aria-label="Platform">
          {cards.map((card) => (
            <Link key={card.href} href={card.href}>
              <img className="gp-lock-card-art" src={card.image} alt={card.alt} width={960} height={540} />
              <h2>{card.title}</h2>
              <p>{card.text}</p>
              <span className="gp-lock-card-action">{card.action}</span>
            </Link>
          ))}
        </section>
      </section>
      <section className="gp-lock-panels" aria-label="Your account">
        <article>
          <h2>Your wallet</h2>
          <p className="gp-lock-status">{wallet ? "Connected" : "Not connected"}</p>
          <p className="gp-lock-address">{wallet ? shortWallet(wallet) : "Connect Wallet to sign in with Phantom, Solflare, or Backpack."}</p>
          <p className="gp-lock-note">{wallet && paperSol ? `${paperSol} virtual SOL. This is paper only and cannot be withdrawn.` : wallet ? "No virtual SOL is recorded for this wallet yet. An eligible new account receives 10 virtual SOL. It cannot be withdrawn." : "Paper trading starts with 10 virtual SOL after you sign in. Nothing is issued until then."}</p>
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
          <h2>Top coins</h2>
          <p className="gp-lock-note">Verified Devnet listings only. A price is shown only when the market record includes volume.</p>
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
