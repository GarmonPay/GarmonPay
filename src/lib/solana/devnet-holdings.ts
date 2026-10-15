import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { DEVNET_RPC } from "./launchlab-flow";
import { listConsumedMints } from "./mint-inventory";
import { readDevnetMarket } from "./devnet-market";

export async function readDevnetHoldings(wallet: string) {
  const rows = await listConsumedMints(24);
  const owner = new PublicKey(wallet);
  const rpc = new Connection(DEVNET_RPC, { commitment: "confirmed", disableRetryOnRateLimit: true });
  const holdings = [];
  for (const row of rows) {
    const mint = new PublicKey(row.mint);
    const account = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
    const balance = await rpc.getTokenAccountBalance(account, "confirmed").catch(() => null);
    if (!balance || BigInt(balance.value.amount) <= BigInt(0)) continue;
    const market = await readDevnetMarket(row.mint).catch(() => null);
    const supply = market?.supply ? BigInt(market.supply) : BigInt(0);
    const value = market?.curveValueLamports && supply > BigInt(0) ? ((BigInt(market.curveValueLamports) * BigInt(balance.value.amount)) / supply).toString() : null;
    holdings.push({
      mint: row.mint,
      name: row.name,
      symbol: row.symbol,
      imageUrl: row.image_url?.startsWith("https://") ? row.image_url : null,
      amount: balance.value.amount,
      decimals: balance.value.decimals,
      launchedAt: row.created_at,
      valueLamports: value,
      curveValueLamports: market?.curveValueLamports ?? null,
    });
    if (holdings.length >= 8) break;
  }
  return { signedIn: true as const, holdings };
}
