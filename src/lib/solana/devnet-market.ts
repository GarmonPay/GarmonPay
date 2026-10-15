import { Connection, PublicKey } from "@solana/web3.js";
import { CpmmConfigInfoLayout, DEV_LAUNCHPAD_PROGRAM, LaunchpadConfig, LaunchpadPool, PlatformConfig, getPdaCreatorVault, getPdaLaunchpadPoolId } from "@raydium-io/raydium-sdk-v2";
import { DEVNET_CPMM_CONFIG, DEVNET_RPC } from "./launchlab-flow";
import { DEVNET_CPMM_PROGRAM, discoverDevnetCpmmPool } from "./devnet-cpmm";
import { authorizedPlatformWallets, garmonPlatformId } from "./platform-setup";
import { curveCompletionAsk, quoteDevnetTrade, tradeAmount } from "./devnet-trade";
import { tradeVenue } from "./trade-venue";

const WRAPPED_SOL = new PublicKey("So11111111111111111111111111111111111111112");

export function bondingCurvePoints(virtualA: bigint, virtualB: bigint, target: bigint, steps = 8, decimals = 6) {
  if (virtualA <= BigInt(0) || virtualB <= BigInt(0) || target < BigInt(0) || steps < 1) return [];
  const product = virtualA * virtualB;
  const points: { progress: number; price: number }[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const raised = (target * BigInt(step)) / BigInt(steps);
    const quote = virtualB + raised;
    const base = product / quote;
    if (base <= BigInt(0)) continue;
    const scaled = (quote * (BigInt(10) ** BigInt(18))) / base;
    points.push({ progress: step / steps, price: Number(scaled) / 1_000_000_000_000 });
  }
  return points;
}

export function formatTokenPriceSol(quote: bigint, base: bigint, decimals: number) {
  if (base <= BigInt(0) || quote < BigInt(0)) return null;
  const places = 12;
  const scaled = (quote * (BigInt(10) ** BigInt(decimals + places))) / base / BigInt(1_000_000_000);
  const text = scaled.toString().padStart(places + 1, "0");
  const whole = text.slice(0, -places);
  const fraction = text.slice(-places).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function curveMarketValue(virtualA: bigint, virtualB: bigint, realA: bigint, realB: bigint, supply: bigint, decimals = 6) {
  const base = virtualA - realA;
  const quote = virtualB + realB;
  if (base <= BigInt(0) || quote < BigInt(0) || supply < BigInt(0)) return null;
  const lamportsPerToken = (quote * (BigInt(10) ** BigInt(decimals))) / base;
  return {
    lamportsPerToken: lamportsPerToken > BigInt(0) ? lamportsPerToken.toString() : null,
    priceSol: formatTokenPriceSol(quote, base, decimals),
    marketValueLamports: ((quote * supply) / base).toString(),
    liquidityLamports: realB.toString(),
  };
}

export function classifyVaultMove(before: bigint, after: bigint) {
  if (after > before) return { side: "buy" as const, lamports: (after - before).toString() };
  if (before > after) return { side: "sell" as const, lamports: (before - after).toString() };
  return { side: "other" as const, lamports: null };
}

export function cpmmReserveValue(solReserve: bigint, tokenReserve: bigint, supply: bigint, decimals = 6) {
  if (solReserve <= BigInt(0) || tokenReserve <= BigInt(0) || supply < BigInt(0)) return null;
  const lamportsPerToken = (solReserve * (BigInt(10) ** BigInt(decimals))) / tokenReserve;
  return {
    lamportsPerToken: lamportsPerToken > BigInt(0) ? lamportsPerToken.toString() : null,
    priceSol: formatTokenPriceSol(solReserve, tokenReserve, decimals),
    marketValueLamports: ((solReserve * supply) / tokenReserve).toString(),
    liquidityLamports: solReserve.toString(),
  };
}

function signedDelta(before: bigint | null, after: bigint | null) {
  if (before == null || after == null) return null;
  return after - before;
}

function absoluteText(delta: bigint | null) {
  if (delta == null || delta === BigInt(0)) return null;
  return (delta < BigInt(0) ? -delta : delta).toString();
}

/** Migration wins over a vault decrease. A CPMM vault change wins over the closed curve. */
export function classifyPoolActivity(input: {
  logs: readonly string[];
  curveSolBefore: bigint | null;
  curveSolAfter: bigint | null;
  curveTokenBefore: bigint | null;
  curveTokenAfter: bigint | null;
  cpmmSolBefore: bigint | null;
  cpmmSolAfter: bigint | null;
  cpmmTokenBefore: bigint | null;
  cpmmTokenAfter: bigint | null;
}) {
  const logs = input.logs.join("\n");
  const curveSol = signedDelta(input.curveSolBefore, input.curveSolAfter);
  const cpmmSol = signedDelta(input.cpmmSolBefore, input.cpmmSolAfter);
  const curveToken = signedDelta(input.curveTokenBefore, input.curveTokenAfter);
  const cpmmToken = signedDelta(input.cpmmTokenBefore, input.cpmmTokenAfter);
  if (logs.includes("Instruction: MigrateToCpswap")) {
    return {
      side: "migration" as const,
      venue: "migration" as const,
      lamports: absoluteText(curveSol) ?? absoluteText(cpmmSol),
      tokenRaw: absoluteText(curveToken) ?? absoluteText(cpmmToken),
    };
  }
  const usesCpmm = cpmmSol != null && cpmmSol !== BigInt(0);
  const sol = usesCpmm ? cpmmSol : curveSol;
  const token = usesCpmm ? cpmmToken : curveToken;
  const venue = usesCpmm ? "cpmm" as const : "curve" as const;
  if (sol == null || sol === BigInt(0)) return { side: "other" as const, venue, lamports: null, tokenRaw: absoluteText(token) };
  return {
    side: sol > BigInt(0) ? "buy" as const : "sell" as const,
    venue,
    lamports: (sol < BigInt(0) ? -sol : sol).toString(),
    tokenRaw: absoluteText(token),
  };
}

export function tradingVolume(moves: Array<{ side: string; lamports: string | null }>, complete: boolean) {
  if (!complete) return null;
  const trades = moves.filter(move => move.side === "buy" || move.side === "sell");
  if (trades.some(move => move.lamports == null)) return null;
  return trades.reduce((sum, move) => sum + BigInt(move.lamports ?? "0"), BigInt(0)).toString();
}

export function cpmmExecutionPoints(trades: Array<{ side?: string; venue?: string; solLamports?: string | null; tokenRaw?: string | null; blockTime?: string | null; failed?: boolean }>, decimals = 6) {
  const priced = trades.filter(trade => !trade.failed && trade.venue === "cpmm" && (trade.side === "buy" || trade.side === "sell") && trade.solLamports && trade.tokenRaw && trade.blockTime);
  if (priced.length < 2) return [];
  const ordered = [...priced].sort((left, right) => Date.parse(left.blockTime ?? "") - Date.parse(right.blockTime ?? ""));
  return ordered.flatMap((trade, index) => {
    const price = formatTokenPriceSol(BigInt(trade.solLamports ?? "0"), BigInt(trade.tokenRaw ?? "0"), decimals);
    if (price == null) return [];
    const numeric = Number(price);
    if (!Number.isFinite(numeric)) return [];
    return [{ progress: index / (ordered.length - 1), price: numeric }];
  });
}

export function sumVaultVolume(amounts: Array<string | null>, complete: boolean) {
  if (!complete) return null;
  return amounts.reduce((sum, amount) => sum + BigInt(amount ?? "0"), BigInt(0)).toString();
}

export function curveStatus(status: number) {
  if (status === 0) return "Bonding curve";
  if (status === 1) return "Migrating";
  if (status === 2) return "Graduated";
  return "Unknown";
}

function lamports(value: { toString(): string }) {
  return BigInt(value.toString());
}

export async function readDevnetMarket(mint: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return null;
  const connection = new Connection(DEVNET_RPC, { commitment: "confirmed", disableRetryOnRateLimit: true });
  const poolId = getPdaLaunchpadPoolId(DEV_LAUNCHPAD_PROGRAM, new PublicKey(mint), WRAPPED_SOL).publicKey;
  const account = await connection.getAccountInfo(poolId, "confirmed");
  if (!account || !account.owner.equals(DEV_LAUNCHPAD_PROGRAM)) return null;
  const pool = LaunchpadPool.decode(account.data);
  const virtualA = lamports(pool.virtualA);
  const virtualB = lamports(pool.virtualB);
  const realA = lamports(pool.realA);
  const realB = lamports(pool.realB);
  const target = lamports(pool.totalFundRaisingB);
  const progress = target > BigInt(0) ? Number((realB * BigInt(10000)) / target) / 100 : 0;
  const points = bondingCurvePoints(virtualA, virtualB, target, 8, pool.mintDecimalsA);
  const currentIndex = points.reduce((nearest, point, index) => Math.abs(point.progress - progress / 100) < Math.abs(points[nearest].progress - progress / 100) ? index : nearest, 0);
  const platformId = garmonPlatformId(authorizedPlatformWallets().admin, "devnet");
  const creatorVault = getPdaCreatorVault(DEV_LAUNCHPAD_PROGRAM, pool.creator, WRAPPED_SOL).publicKey;
  const [platformAccount, configAccount, creatorFee] = await Promise.all([
    connection.getAccountInfo(pool.platformId, "confirmed"),
    connection.getAccountInfo(pool.configId, "confirmed"),
    connection.getTokenAccountBalance(creatorVault, "confirmed").catch(() => null),
  ]);
  const platform = platformAccount && platformAccount.owner.equals(DEV_LAUNCHPAD_PROGRAM) ? PlatformConfig.decode(platformAccount.data) : null;
  const config = configAccount && configAccount.owner.equals(DEV_LAUNCHPAD_PROGRAM) ? LaunchpadConfig.decode(configAccount.data) : null;
  const supply = lamports(pool.supply);
  const cpmm = pool.status === 2 && platform?.cpConfigId.equals(DEVNET_CPMM_CONFIG)
    ? await discoverDevnetCpmmPool(connection, new PublicKey(mint), platform.cpConfigId).catch(() => null)
    : null;
  const venue = pool.platformId.equals(platformId) ? tradeVenue(pool.status, Boolean(cpmm)) : "unavailable";
  const solVault = cpmm ? (cpmm.pool.mintA.equals(WRAPPED_SOL) ? cpmm.pool.vaultA : cpmm.pool.vaultB) : null;
  const tokenVault = cpmm ? (cpmm.pool.mintA.equals(WRAPPED_SOL) ? cpmm.pool.vaultB : cpmm.pool.vaultA) : null;
  const [reserves, cpmmConfigAccount, activity] = await Promise.all([
    solVault && tokenVault ? Promise.all([
      connection.getTokenAccountBalance(solVault, "confirmed"),
      connection.getTokenAccountBalance(tokenVault, "confirmed"),
    ]).catch(() => null) : Promise.resolve(null),
    cpmm ? connection.getAccountInfo(cpmm.pool.configId, "confirmed").catch(() => null) : Promise.resolve(null),
    recentActivity(connection, [poolId, ...(cpmm ? [cpmm.poolId] : [])]),
  ]);
  const reservePrice = reserves ? cpmmReserveValue(BigInt(reserves[0].value.amount), BigInt(reserves[1].value.amount), supply, pool.mintDecimalsA) : null;
  const priced = reservePrice ?? (pool.status === 2 ? null : curveMarketValue(virtualA, virtualB, realA, realB, supply, pool.mintDecimalsA));
  const cpmmConfig = cpmmConfigAccount && cpmmConfigAccount.owner.equals(DEVNET_CPMM_PROGRAM) ? CpmmConfigInfoLayout.decode(cpmmConfigAccount.data) : null;
  const creatorFeeField = cpmm ? (cpmm.pool.mintA.equals(WRAPPED_SOL) ? cpmm.pool.creatorFeesMintA : cpmm.pool.creatorFeesMintB) : null;
  const decoded = await readPoolActivity(connection, activity.filter(entry => entry.err == null).map(entry => entry.signature), {
    curveSol: pool.vaultB,
    curveToken: pool.vaultA,
    cpmmSol: solVault,
    cpmmToken: tokenVault,
    tokenMint: mint,
  });
  const bySignature = new Map(decoded.moves.map(move => [move.signature, move]));
  const holderRead = await readHolderAccounts(connection, mint);
  let     graduationSpendLamports: string | null = null;
  if (pool.status === 0 && platform && config) {
    try {
      const remaining = target > realB ? target - realB : BigInt(0);
      const ask = curveCompletionAsk(remaining);
      if (ask != null) {
        const quote = quoteDevnetTrade({ side: "buy", amount: tradeAmount("buy", ask.toString()), slippage: 100, pool, config, platform, slot: 0 });
        graduationSpendLamports = quote.graduates ? quote.amountIn : null;
      }
    } catch {
      graduationSpendLamports = null;
    }
  }
  const confirmedTrades = activity.filter(entry => entry.err == null).length;
  const trades = activity.map(entry => {
    const move = bySignature.get(entry.signature);
    return {
      signature: entry.signature,
      blockTime: entry.blockTime ? new Date(entry.blockTime * 1000).toISOString() : null,
      failed: entry.err != null,
      side: move?.side ?? "other",
      venue: move?.venue ?? "curve",
      solLamports: move?.lamports ?? null,
      tokenRaw: move?.tokenRaw ?? null,
    };
  });
  const executionPoints = cpmmExecutionPoints(trades, pool.mintDecimalsA);
  const chartKind = pool.status === 2 ? "cpmm-trades" as const : "curve-quote" as const;
  const chartPoints = chartKind === "cpmm-trades" ? executionPoints : points;
  return {
    pool: poolId.toBase58(),
    cpmmPool: cpmm?.poolId.toBase58() ?? null,
    venue,
    status: curveStatus(pool.status),
    poolStatus: pool.status,
    tradingOpen: venue === "curve" || venue === "cpmm",
    progress: Math.max(0, Math.min(100, progress)),
    raisedLamports: realB.toString(),
    targetLamports: target.toString(),
    remainingTokenRaw: (lamports(pool.totalSellA) - realA).toString(),
    creator: pool.creator.toBase58(),
    platformId: pool.platformId.toBase58(),
    garmonPlatform: pool.platformId.equals(platformId),
    fees: platform && config ? {
      platform: platform.feeRate.toString(),
      creator: platform.creatorFeeRate.toString(),
      protocol: config.tradeFeeRate.toString(),
      denominator: "1000000",
    } : null,
    cpmmFees: cpmmConfig ? {
      trade: cpmmConfig.tradeFeeRate.toString(),
      creator: cpmmConfig.creatorFeeRate.toString(),
      protocolShare: cpmmConfig.protocolFeeRate.toString(),
      fundShare: cpmmConfig.fundFeeRate.toString(),
      denominator: "1000000",
    } : null,
    priceSource: reservePrice ? "cpmm-reserves" as const : "bonding-curve" as const,
    liquidityPlace: reservePrice ? "cpmm" as const : "curve" as const,
    chartKind,
    curveValueLamports: priced?.marketValueLamports ?? null,
    lamportsPerToken: priced?.lamportsPerToken ?? null,
    priceSol: priced?.priceSol ?? null,
    supply: supply.toString(),
    liquidityLamports: priced?.liquidityLamports ?? null,
    volumeLamports: tradingVolume(decoded.moves, decoded.complete),
    volumeLabel: pool.status === 2
      ? "SOL moved by the latest confirmed buys and sells. Liquidity migration is not included."
      : "SOL added to or removed from the curve vault in the latest confirmed transactions",
    holders: holderRead.holders,
    holdersNote: holderRead.note,
    graduationSpendLamports,
    creatorFeeLamports: creatorFee?.value.amount ?? "0",
    cpmmCreatorFeeLamports: creatorFeeField ? creatorFeeField.toString() : null,
    tradeCount: confirmedTrades,
    points: chartPoints,
    currentIndex: chartKind === "cpmm-trades" ? Math.max(0, chartPoints.length - 1) : currentIndex,
    trades,
  };
}

const holderCache = new Map<string, { at: number; value: { count: number; exact: boolean } }>();

async function readHolderAccounts(connection: Connection, mint: string) {
  const cached = holderCache.get(mint);
  if (cached && Date.now() - cached.at < 45_000) return { holders: cached.value, note: null as string | null };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const largest = await connection.getTokenLargestAccounts(new PublicKey(mint), "confirmed");
      const count = largest.value.filter(row => BigInt(row.amount) > BigInt(0)).length;
      const value = { count, exact: count < 20 };
      holderCache.set(mint, { at: Date.now(), value });
      return { holders: value, note: null as string | null };
    } catch (error) {
      const delayed = /429|rate limit/i.test(error instanceof Error ? error.message : "");
      if (delayed && attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        continue;
      }
      return {
        holders: cached?.value ?? null,
        note: delayed ? "Devnet delayed this read. No new holder count is shown." : null,
      };
    }
  }
  return { holders: cached?.value ?? null, note: "Devnet delayed this read. No new holder count is shown." };
}

async function recentActivity(connection: Connection, addresses: PublicKey[]) {
  const lists = await Promise.all(addresses.map(address => connection.getSignaturesForAddress(address, { limit: 8 }).catch(() => [])));
  const bySignature = new Map<string, { signature: string; blockTime: number | null; err: unknown }>();
  for (const list of lists) {
    for (const entry of list) {
      if (!bySignature.has(entry.signature)) bySignature.set(entry.signature, { signature: entry.signature, blockTime: entry.blockTime ?? null, err: entry.err });
    }
  }
  return [...bySignature.values()].sort((left, right) => (right.blockTime ?? 0) - (left.blockTime ?? 0)).slice(0, 8);
}

function vaultAmounts(tx: { transaction: { message: { accountKeys: unknown[] } }; meta?: { loadedAddresses?: { writable?: PublicKey[]; readonly?: PublicKey[] }; preTokenBalances?: Array<{ accountIndex: number; mint: string; uiTokenAmount: { amount: string } }> | null; postTokenBalances?: Array<{ accountIndex: number; mint: string; uiTokenAmount: { amount: string } }> | null; logMessages?: string[] | null } | null } | null, address: PublicKey | null, mint: string) {
  if (!tx || !address) return { before: null as bigint | null, after: null as bigint | null };
  const staticKeys = tx.transaction.message.accountKeys.map(key => (typeof key === "string" ? key : (key as { pubkey?: { toBase58?: () => string } }).pubkey?.toBase58?.() ?? ""));
  const loaded = tx.meta?.loadedAddresses;
  const keys = [...staticKeys, ...(loaded?.writable ?? []).map(key => key.toBase58()), ...(loaded?.readonly ?? []).map(key => key.toBase58())];
  const index = keys.findIndex(item => item === address.toBase58());
  if (index < 0) return { before: null, after: null };
  const before = tx.meta?.preTokenBalances?.find(row => row.accountIndex === index && row.mint === mint);
  const after = tx.meta?.postTokenBalances?.find(row => row.accountIndex === index && row.mint === mint);
  if (!before && !after) return { before: null, after: null };
  return { before: BigInt(before?.uiTokenAmount.amount ?? "0"), after: BigInt(after?.uiTokenAmount.amount ?? "0") };
}

async function readParsedTransaction(connection: Connection, signature: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
    if (tx) return tx;
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return null;
}

async function readPoolActivity(connection: Connection, signatures: string[], vaults: { curveSol: PublicKey; curveToken: PublicKey; cpmmSol: PublicKey | null; cpmmToken: PublicKey | null; tokenMint: string }) {
  const parsed = await Promise.all(signatures.map(signature => readParsedTransaction(connection, signature)));
  const complete = parsed.every(tx => tx != null);
  const wrapped = WRAPPED_SOL.toBase58();
  const moves = signatures.map((signature, index) => {
    const tx = parsed[index];
    if (!tx) return { signature, side: "other" as const, venue: "curve" as const, lamports: null, tokenRaw: null };
    const curveSol = vaultAmounts(tx, vaults.curveSol, wrapped);
    const curveToken = vaultAmounts(tx, vaults.curveToken, vaults.tokenMint);
    const cpmmSol = vaultAmounts(tx, vaults.cpmmSol, wrapped);
    const cpmmToken = vaultAmounts(tx, vaults.cpmmToken, vaults.tokenMint);
    const move = classifyPoolActivity({
      logs: tx.meta?.logMessages ?? [],
      curveSolBefore: curveSol.before, curveSolAfter: curveSol.after,
      curveTokenBefore: curveToken.before, curveTokenAfter: curveToken.after,
      cpmmSolBefore: cpmmSol.before, cpmmSolAfter: cpmmSol.after,
      cpmmTokenBefore: cpmmToken.before, cpmmTokenAfter: cpmmToken.after,
    });
    return { signature, ...move };
  });
  return { moves, complete };
}
