"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CoinMark } from "./CoinMark";
import { rawToDecimal } from "@/lib/solana/trade-form";

type Holding = {
  mint: string;
  name: string | null;
  symbol: string | null;
  imageUrl: string | null;
  amount: string;
  decimals: number;
  valueLamports: string | null;
};

function sol(lamports: string | null) {
  if (lamports === "0") return "Below 1 lamport at the curve price";
  if (!lamports) return "Value unavailable";
  const value = Number(lamports) / 1_000_000_000;
  if (!Number.isFinite(value)) return "Value unavailable";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 6 })} SOL at the curve price`;
}

export function DevnetHoldings() {
  const [state, setState] = useState<{ signedIn: boolean; holdings: Holding[] } | null>(null);
  useEffect(() => {
    const load = () => {
      void fetch("/api/solana/devnet/holdings", { cache: "no-store", credentials: "same-origin" }).then(response => response.json()).then(body => {
        setState({ signedIn: body.signedIn === true, holdings: Array.isArray(body.holdings) ? body.holdings : [] });
      }).catch(() => setState({ signedIn: false, holdings: [] }));
    };
    load();
    window.addEventListener("garmonpay-session-change", load);
    return () => window.removeEventListener("garmonpay-session-change", load);
  }, []);
  if (!state) return <p role="status">Checking token balances…</p>;
  if (!state.signedIn) return <p>Sign in with your wallet to see GarmonPay coins this wallet holds. Created coins stay in My Coins.</p>;
  if (!state.holdings.length) return <p>This wallet has no balance in a GarmonPay coin. Coins you created still appear in My Coins.</p>;
  return <ul className="gp-holding-list">{state.holdings.map(holding => <li key={holding.mint}>
    <CoinMark symbol={holding.symbol || "GP"} imageUrl={holding.imageUrl} size={48} />
    <div>
      <Link href={`/solana/token/${holding.mint}`}>{holding.name || "Devnet coin"}{holding.symbol ? ` (${holding.symbol})` : ""}</Link>
      <p>{rawToDecimal(holding.amount, holding.decimals)} {holding.symbol || "tokens"}</p>
      <p>{sol(holding.valueLamports)}</p>
    </div>
  </li>)}</ul>;
}
