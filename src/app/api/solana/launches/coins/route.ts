import { Connection } from "@solana/web3.js";
import { json } from "@/lib/solana/http";
import { DEVNET_RPC } from "@/lib/solana/launchlab-flow";
import { listConsumedMints } from "@/lib/solana/mint-inventory";
import { devnetLaunchTime } from "@/lib/solana/devnet-token-view";
import { readDevnetMarket } from "@/lib/solana/devnet-market";
import { getSolanaSession } from "@/lib/solana/session";
import { rateLimitOr429 } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = rateLimitOr429(request, "solana-devnet-coins", 60);
  if (limited) return limited;
  const mine = new URL(request.url).searchParams.get("mine") === "1";
  const session = mine ? await getSolanaSession() : null;
  if (mine && !session) return json({ cluster: "devnet", coins: [], signedIn: false });
  const coins = await listConsumedMints(12, session?.wallet);
  const connection = new Connection(DEVNET_RPC, { commitment: "finalized", disableRetryOnRateLimit: true });
  const listed = await Promise.all(coins.map(async coin => {
    const market = await readDevnetMarket(coin.mint).catch(() => null);
    return {
      mint: coin.mint,
      name: coin.name,
      symbol: coin.symbol,
      imageUrl: coin.image_url || null,
      creator: coin.reserved_wallet,
      signature: coin.consumed_signature,
      launchedAt: await devnetLaunchTime(connection, coin.consumed_signature),
      status: market?.status ?? null,
      tradingOpen: market?.tradingOpen ?? false,
      venue: market?.venue ?? null,
      progress: market?.progress ?? null,
      curveValueLamports: market?.curveValueLamports ?? null,
      volumeLamports: market?.volumeLamports ?? null,
      creatorFeeLamports: market?.creatorFeeLamports ?? null,
      tradeCount: market?.tradeCount ?? 0,
      fees: market?.fees ?? null,
      explorerMint: `https://explorer.solana.com/address/${coin.mint}?cluster=devnet`,
      explorerTransaction: coin.consumed_signature ? `https://explorer.solana.com/tx/${coin.consumed_signature}?cluster=devnet` : null,
    };
  }));
  return json({ cluster: "devnet", signedIn: mine ? true : undefined, coins: listed });
}
