import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, Transaction, VersionedTransaction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction, createSyncNativeInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import BN from "bn.js";
import {
  Curve, DEV_LAUNCHPAD_PROGRAM, LAUNCHPAD_PROGRAM, LaunchpadConfig, LaunchpadPool, PlatformConfig,
  buyExactInInstruction, getCpmmPdaPoolId, getPdaCreatorVault, getPdaLaunchpadAuth, getPdaLaunchpadPoolId, getPdaPlatformVault, sellExactInInstruction,
} from "@raydium-io/raydium-sdk-v2";
import { DEVNET_RPC } from "./launchlab-flow";
import { buildDevnetCpmmTrade, DEVNET_CPMM_PROGRAM, MAINNET_CPMM_PROGRAM, discoverDevnetCpmmPool } from "./devnet-cpmm";
import { assertPriceImpactAllowed, suggestedBuySol } from "./trade-form";
import { tradeVenue } from "./trade-venue";
import { CLUSTER_GENESIS, authorizedPlatformWallets, garmonPlatformId } from "./platform-setup";
import { DevnetBlockhashError, sendExactSignedTransaction } from "./devnet-blockhash";
import { afterDevnetBroadcast } from "./devnet-submission";

const WRAPPED_SOL = new PublicKey("So11111111111111111111111111111111111111112");
const BUY_MIN = 10_000;
const BUY_MAX = 1_000_000_000;
const SELL_MAX = "1000000000000000";

export type TradeSide = "buy" | "sell";

function connection() {
  return new Connection(DEVNET_RPC, { commitment: "confirmed", disableRetryOnRateLimit: true });
}

function bn(value: { toString(): string }) {
  return new BN(value.toString());
}

export function tradeAmount(side: TradeSide, raw: string, buyMin = BUY_MIN) {
  if (!/^[0-9]+$/.test(raw)) throw new Error("Trade amount is invalid");
  const amount = new BN(raw);
  if (amount.lte(new BN(0))) throw new Error("Trade amount is invalid");
  if (side === "buy" && (amount.lt(new BN(buyMin)) || amount.gt(new BN(BUY_MAX)))) throw new Error(`A Devnet buy must be between ${buyMin === BUY_MIN ? "0.00001" : "0.000000001"} and 1 SOL`);
  if (side === "sell" && amount.gt(new BN(SELL_MAX))) throw new Error("Sell amount is too large");
  return amount;
}

/** SOL still on the curve can be smaller than the minimum buy. Ask for the minimum, then keep the curve's capped spend. */
export function curveCompletionAsk(remaining: bigint) {
  if (remaining <= BigInt(0)) return null;
  const doubled = remaining * BigInt(2);
  const ask = doubled < BigInt(BUY_MIN) ? BigInt(BUY_MIN) : doubled;
  if (ask > BigInt(BUY_MAX)) return null;
  return ask;
}

export function slippageBps(value: number) {
  if (!Number.isInteger(value) || value < 10 || value > 1000) throw new Error("Slippage must be from 0.10% to 10%");
  return value;
}

export async function readDevnetPoolState(mint: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw new Error("The mint address is invalid");
  const rpc = connection();
  const genesis = await rpc.getGenesisHash();
  if (genesis !== CLUSTER_GENESIS.devnet) throw new Error("RPC is not Solana devnet");
  const mintKey = new PublicKey(mint);
  const poolId = getPdaLaunchpadPoolId(DEV_LAUNCHPAD_PROGRAM, mintKey, WRAPPED_SOL).publicKey;
  const platformId = garmonPlatformId(authorizedPlatformWallets().admin, "devnet");
  const poolAccount = await rpc.getAccountInfo(poolId, "confirmed");
  if (!poolAccount || !poolAccount.owner.equals(DEV_LAUNCHPAD_PROGRAM)) throw new Error("This Devnet bonding curve is not available");
  const pool = LaunchpadPool.decode(poolAccount.data);
  if (!pool.mintA.equals(mintKey) || !pool.mintB.equals(WRAPPED_SOL) || !pool.platformId.equals(platformId)) throw new Error("This pool is not a GarmonPay Devnet coin");
  const [configAccount, platformAccount, slot, latest] = await Promise.all([
    rpc.getAccountInfo(pool.configId, "confirmed"),
    rpc.getAccountInfo(pool.platformId, "confirmed"),
    rpc.getSlot("confirmed"),
    rpc.getLatestBlockhash("confirmed"),
  ]);
  if (!configAccount || !configAccount.owner.equals(DEV_LAUNCHPAD_PROGRAM)) throw new Error("Devnet curve config is unavailable");
  if (!platformAccount || !platformAccount.owner.equals(DEV_LAUNCHPAD_PROGRAM)) throw new Error("Devnet platform fee account is unavailable");
  const config = LaunchpadConfig.decode(configAccount.data);
  const platform = PlatformConfig.decode(platformAccount.data);
  if (config.curveType !== 0) throw new Error("Only the constant-product Devnet curve can be traded");
  const cpmm = pool.status === 2 ? await discoverDevnetCpmmPool(rpc, mintKey, platform.cpConfigId) : null;
  return { rpc, pool, poolId, config, platform, slot, latest, mintKey, platformId, cpmm, venue: tradeVenue(pool.status, Boolean(cpmm)) };
}

export async function loadDevnetPool(mint: string) {
  const state = await readDevnetPoolState(mint);
  if (state.pool.status !== 0) throw new Error(state.pool.status === 1 ? "This coin is migrating. Trading is paused." : "This coin has left the bonding curve. LaunchLab trading is not available here.");
  return state;
}

async function readTokenRaw(rpc: Connection, account: PublicKey) {
  try {
    const token = await rpc.getTokenAccountBalance(account, "confirmed");
    return { amount: token.value.amount, decimals: token.value.decimals };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/could not find|invalid param|account does not exist/i.test(message)) return { amount: "0", decimals: 6 };
    throw error;
  }
}

function poolTokenProgram(loaded: { mintKey: PublicKey; cpmm: { pool: { mintA: PublicKey; mintProgramA: PublicKey; mintProgramB: PublicKey } } | null }) {
  if (!loaded.cpmm) return TOKEN_PROGRAM_ID;
  return loaded.cpmm.pool.mintA.equals(loaded.mintKey) ? loaded.cpmm.pool.mintProgramA : loaded.cpmm.pool.mintProgramB;
}

export async function readDevnetTradeContext(payer: string, mint: string) {
  const payerKey = new PublicKey(payer);
  const loaded = await readDevnetPoolState(mint);
  const tokenAccount = getAssociatedTokenAddressSync(loaded.mintKey, payerKey, false, poolTokenProgram(loaded));
  const [solLamports, token] = await Promise.all([
    loaded.rpc.getBalance(payerKey, "confirmed"),
    readTokenRaw(loaded.rpc, tokenAccount),
  ]);
  const raised = BigInt(loaded.pool.realB.toString());
  const target = BigInt(loaded.pool.totalFundRaisingB.toString());
  const remaining = target > raised ? target - raised : BigInt(0);
  const progress = target > BigInt(0) ? Number((raised * BigInt(10000)) / target) / 100 : 0;
  return {
    signedIn: true as const,
    tradingOpen: loaded.venue === "curve" || loaded.venue === "cpmm",
    venue: loaded.venue,
    solLamports: String(solLamports),
    tokenRaw: token.amount,
    tokenDecimals: token.decimals,
    remainingLamports: remaining.toString(),
    raisedLamports: raised.toString(),
    targetLamports: target.toString(),
    progress: Math.max(0, Math.min(100, progress)),
    suggestedBuySol: suggestedBuySol(remaining.toString()),
  };
}

function priceImpactPercent(side: TradeSide, pool: { virtualA: { toString(): string }; virtualB: { toString(): string }; realA?: { toString(): string }; realB?: { toString(): string } }, amountIn: string, expectedOut: string, split: { platformFee: { toString(): string }; creatorFee: { toString(): string }; protocolFee: { toString(): string } }) {
  const virtualA = BigInt(pool.virtualA.toString()) - BigInt(pool.realA?.toString() ?? "0");
  const virtualB = BigInt(pool.virtualB.toString()) + BigInt(pool.realB?.toString() ?? "0");
  if (virtualA <= BigInt(0) || virtualB < BigInt(0)) return null;
  const fees = BigInt(split.platformFee.toString()) + BigInt(split.creatorFee.toString()) + BigInt(split.protocolFee.toString());
  const input = BigInt(amountIn);
  const output = BigInt(expectedOut);
  const nextA = side === "buy" ? virtualA - output : virtualA + input;
  const nextB = side === "buy" ? virtualB + input - fees : virtualB - output - fees;
  if (nextA <= BigInt(0) || nextB < BigInt(0)) return null;
  const scale = BigInt("1000000000000000000");
  const before = (virtualB * scale) / virtualA;
  const after = (nextB * scale) / nextA;
  if (before <= BigInt(0)) return null;
  const bps = ((after - before) * BigInt(10000)) / before;
  const negative = bps < BigInt(0);
  const absolute = negative ? -bps : bps;
  return `${negative ? "-" : ""}${(absolute / BigInt(100)).toString()}.${(absolute % BigInt(100)).toString().padStart(2, "0")}%`;
}

export function quoteDevnetTrade(input: {
  side: TradeSide;
  amount: ReturnType<typeof tradeAmount>;
  slippage: number;
  pool: ReturnType<typeof LaunchpadPool.decode>;
  config: ReturnType<typeof LaunchpadConfig.decode>;
  platform: ReturnType<typeof PlatformConfig.decode>;
  slot: number;
}) {
  const shared = {
    poolInfo: input.pool,
    protocolFeeRate: bn(input.config.tradeFeeRate),
    platformFeeRate: bn(input.platform.feeRate),
    curveType: input.config.curveType,
    shareFeeRate: new BN(0),
    creatorFeeRate: bn(input.platform.creatorFeeRate),
    transferFeeConfigA: undefined,
    transferFeeConfigB: undefined,
    slot: input.slot,
  };
  const quoted = input.side === "buy"
    ? Curve.buyExactIn({ ...shared, amountB: input.amount })
    : Curve.sellExactIn({ ...shared, amountA: input.amount });
  const out = input.side === "buy"
    ? bn(quoted.amountA.amount).sub(quoted.amountA.fee ?? new BN(0))
    : bn(quoted.amountB);
  const minimum = out.mul(new BN(10000 - input.slippage)).div(new BN(10000));
  if (minimum.lte(new BN(0))) throw new Error("The quoted amount is too small for this slippage");
  const spent = input.side === "buy" ? bn(quoted.amountB) : input.amount;
  const remainingTokens = bn(input.pool.totalSellA).sub(bn(input.pool.realA));
  const tokenOut = bn(quoted.amountA.amount);
  const curveSol = input.side === "buy"
    ? BigInt(spent.toString()) - BigInt(quoted.splitFee.platformFee.toString()) - BigInt(quoted.splitFee.creatorFee.toString()) - BigInt(quoted.splitFee.protocolFee.toString())
    : BigInt(out.toString()) + BigInt(quoted.splitFee.platformFee.toString()) + BigInt(quoted.splitFee.creatorFee.toString()) + BigInt(quoted.splitFee.protocolFee.toString());
  const graduates = input.side === "buy" && (tokenOut.gte(remainingTokens) || BigInt(input.pool.realB.toString()) + curveSol >= BigInt(input.pool.totalFundRaisingB.toString()));
  return {
    expectedOut: out.toString(),
    minimumOut: minimum.toString(),
    amountIn: spent.toString(),
    requestedAmount: input.amount.toString(),
    graduates,
    priceImpact: priceImpactPercent(input.side, input.pool, spent.toString(), out.toString(), quoted.splitFee),
    venue: "bonding-curve" as const,
    feeNote: "",
    fees: {
      platform: input.platform.feeRate.toString(),
      creator: input.platform.creatorFeeRate.toString(),
      protocol: input.config.tradeFeeRate.toString(),
      denominator: "1000000",
    },
    split: {
      platform: quoted.splitFee.platformFee.toString(),
      creator: quoted.splitFee.creatorFee.toString(),
      protocol: quoted.splitFee.protocolFee.toString(),
    },
  };
}

function resolveBuyAmount(raw: string, loaded: Awaited<ReturnType<typeof readDevnetPoolState>>) {
  if (loaded.venue !== "curve") return tradeAmount("buy", raw, loaded.venue === "cpmm" ? 1 : BUY_MIN);
  if (!/^[0-9]+$/.test(raw)) throw new Error("Trade amount is invalid");
  const requested = new BN(raw);
  if (requested.lte(new BN(0)) || requested.gt(new BN(BUY_MAX))) throw new Error("A Devnet buy must be between 0.00001 and 1 SOL");
  if (requested.gte(new BN(BUY_MIN))) return requested;
  const probe = quoteDevnetTrade({
    side: "buy", amount: new BN(BUY_MIN), slippage: 100, pool: loaded.pool, config: loaded.config, platform: loaded.platform, slot: loaded.slot,
  });
  if (!probe.graduates || probe.amountIn !== requested.toString()) throw new Error("A Devnet buy must be between 0.00001 and 1 SOL");
  return requested;
}

export async function buildDevnetTrade(input: { payer: string; mint: string; side: TradeSide; amount: string; slippage: number; blockhash?: string }) {
  const payer = new PublicKey(input.payer);
  const slippage = slippageBps(input.slippage);
  const loaded = await readDevnetPoolState(input.mint);
  if (loaded.venue === "paused") throw new Error("This coin is migrating. Trading is paused. No order was created.");
  if (loaded.venue === "unavailable") throw new Error("This coin has graduated from the bonding curve. The Raydium CPMM pool is not available yet, so no order was created.");
  const amount = input.side === "buy" ? resolveBuyAmount(input.amount, loaded) : tradeAmount("sell", input.amount);
  if (loaded.venue === "cpmm" && loaded.cpmm) {
    const graduated = await buildDevnetCpmmTrade({
      rpc: loaded.rpc, payer, mintKey: loaded.mintKey, cpmm: loaded.cpmm, side: input.side, amount, slippage, blockhash: input.blockhash ?? loaded.latest.blockhash,
    });
    assertPriceImpactAllowed(graduated.quote.priceImpact);
    return { transaction: graduated.transaction, quote: graduated.quote, loaded: { ...loaded, poolId: loaded.cpmm.poolId }, spend: amount.toString(), minimum: graduated.quote.minimumOut };
  }
  const quote = quoteDevnetTrade({ side: input.side, amount, slippage, pool: loaded.pool, config: loaded.config, platform: loaded.platform, slot: loaded.slot });
  assertPriceImpactAllowed(quote.priceImpact);
  const spend = new BN(quote.amountIn);
  const minimum = new BN(quote.minimumOut);
  const tokenAccount = getAssociatedTokenAddressSync(loaded.mintKey, payer, false, TOKEN_PROGRAM_ID);
  const solAccount = getAssociatedTokenAddressSync(WRAPPED_SOL, payer, false, TOKEN_PROGRAM_ID);
  const auth = getPdaLaunchpadAuth(DEV_LAUNCHPAD_PROGRAM).publicKey;
  const platformVault = getPdaPlatformVault(DEV_LAUNCHPAD_PROGRAM, loaded.pool.platformId, WRAPPED_SOL).publicKey;
  const creatorVault = getPdaCreatorVault(DEV_LAUNCHPAD_PROGRAM, loaded.pool.creator, WRAPPED_SOL).publicKey;
  const swap = input.side === "buy"
    ? buyExactInInstruction(DEV_LAUNCHPAD_PROGRAM, payer, auth, loaded.pool.configId, loaded.pool.platformId, loaded.poolId, tokenAccount, solAccount, loaded.pool.vaultA, loaded.pool.vaultB, loaded.mintKey, WRAPPED_SOL, TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, platformVault, creatorVault, spend, minimum, new BN(0))
    : sellExactInInstruction(DEV_LAUNCHPAD_PROGRAM, payer, auth, loaded.pool.configId, loaded.pool.platformId, loaded.poolId, tokenAccount, solAccount, loaded.pool.vaultA, loaded.pool.vaultB, loaded.mintKey, WRAPPED_SOL, TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, platformVault, creatorVault, spend, minimum, new BN(0));
  if (!swap.programId.equals(DEV_LAUNCHPAD_PROGRAM) || swap.programId.equals(LAUNCHPAD_PROGRAM)) throw new Error("Mainnet LaunchLab program rejected");
  const createToken = createAssociatedTokenAccountIdempotentInstruction(payer, tokenAccount, payer, loaded.mintKey, TOKEN_PROGRAM_ID);
  const createSol = createAssociatedTokenAccountIdempotentInstruction(payer, solAccount, payer, WRAPPED_SOL, TOKEN_PROGRAM_ID);
  const closeSol = createCloseAccountInstruction(solAccount, payer, payer, [], TOKEN_PROGRAM_ID);
  const blockhash = input.blockhash ?? loaded.latest.blockhash;
  const instructions = input.side === "buy"
    ? [createToken, createSol, SystemProgram.transfer({ fromPubkey: payer, toPubkey: solAccount, lamports: BigInt(spend.toString()) }), createSyncNativeInstruction(solAccount), swap, closeSol]
    : [createToken, createSol, swap, closeSol];
  const transaction = new Transaction({ feePayer: payer, recentBlockhash: blockhash }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
    ...instructions,
  );
  return { transaction, quote, loaded, spend: spend.toString(), minimum: minimum.toString() };
}

/** Quotes and simulates the buy that finishes the curve. Nothing is broadcast. */
export async function simulateDevnetGraduation(input: { payer: string; mint: string; slippage?: number }) {
  const loaded = await readDevnetPoolState(input.mint);
  const raised = BigInt(loaded.pool.realB.toString());
  const target = BigInt(loaded.pool.totalFundRaisingB.toString());
  const remaining = target > raised ? target - raised : BigInt(0);
  if (loaded.pool.status !== 0) throw new Error("This pool is not on the bonding curve. No graduation buy was created.");
  const ask = curveCompletionAsk(remaining);
  if (ask == null) throw new Error("The remaining curve amount cannot be quoted.");
  const built = await buildDevnetTrade({ payer: input.payer, mint: input.mint, side: "buy", amount: ask.toString(), slippage: input.slippage ?? 100 });
  const cpmmCandidates = [
    getCpmmPdaPoolId(DEVNET_CPMM_PROGRAM, built.loaded.platform.cpConfigId, built.loaded.mintKey, WRAPPED_SOL).publicKey,
    getCpmmPdaPoolId(DEVNET_CPMM_PROGRAM, built.loaded.platform.cpConfigId, WRAPPED_SOL, built.loaded.mintKey).publicKey,
  ];
  const simulation = await built.loaded.rpc.simulateTransaction(new VersionedTransaction(built.transaction.compileMessage()), {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: "confirmed",
    accounts: { encoding: "base64", addresses: [built.loaded.poolId.toBase58(), ...cpmmCandidates.map(key => key.toBase58())] },
  });
  const accounts = simulation.value.accounts ?? [];
  const poolData = accounts[0]?.data?.[0] ? Buffer.from(accounts[0].data[0], "base64") : null;
  const poolAfter = poolData ? LaunchpadPool.decode(poolData) : null;
  const programs = built.transaction.instructions.map(instruction => instruction.programId.toBase58());
  const balance = await built.loaded.rpc.getBalance(new PublicKey(input.payer), "confirmed").catch(() => null);
  return {
    submitted: false as const,
    confirmed: false as const,
    status: loaded.pool.status,
    migrateType: loaded.pool.migrateType,
    remainingLamports: remaining.toString(),
    migrateFeeLamports: loaded.pool.migrateFee.toString(),
    amountIn: built.quote.amountIn,
    expectedOut: built.quote.expectedOut,
    minimumOut: built.quote.minimumOut,
    graduates: built.quote.graduates,
    priceImpact: built.quote.priceImpact,
    split: built.quote.split,
    programs,
    usesCurve: programs.includes(DEV_LAUNCHPAD_PROGRAM.toBase58()),
    usesCpmm: programs.includes(DEVNET_CPMM_PROGRAM.toBase58()),
    simulationPassed: simulation.value.err == null,
    error: simulation.value.err ? JSON.stringify(simulation.value.err).slice(0, 180) : null,
    logs: simulation.value.logs ?? [],
    units: simulation.value.unitsConsumed ?? null,
    payerLamports: balance === null ? null : String(balance),
    poolStatusAfter: poolAfter ? poolAfter.status : null,
    cpmmCreated: accounts.slice(1).some(account => account != null && (account.lamports ?? 0) > 0),
  };
}

/** One simulated transaction buys, then sells part of that output. Nothing is broadcast. */
export async function simulateDevnetRoundTrip(input: { payer: string; mint: string; amount: string; slippage: number }) {
  const buy = await buildDevnetTrade({ ...input, side: "buy" });
  if (buy.quote.venue !== "bonding-curve") throw new Error("This coin has graduated. A bonding-curve sell was not created.");
  const sellAmount = new BN(buy.quote.expectedOut).div(new BN(2));
  if (sellAmount.lte(new BN(0))) throw new Error("The buy quote is too small to test a sell");
  const payer = new PublicKey(input.payer);
  const loaded = buy.loaded;
  const tokenAccount = getAssociatedTokenAddressSync(loaded.mintKey, payer, false, TOKEN_PROGRAM_ID);
  const solAccount = getAssociatedTokenAddressSync(WRAPPED_SOL, payer, false, TOKEN_PROGRAM_ID);
  const auth = getPdaLaunchpadAuth(DEV_LAUNCHPAD_PROGRAM).publicKey;
  const platformVault = getPdaPlatformVault(DEV_LAUNCHPAD_PROGRAM, loaded.pool.platformId, WRAPPED_SOL).publicKey;
  const creatorVault = getPdaCreatorVault(DEV_LAUNCHPAD_PROGRAM, loaded.pool.creator, WRAPPED_SOL).publicKey;
  const sell = sellExactInInstruction(DEV_LAUNCHPAD_PROGRAM, payer, auth, loaded.pool.configId, loaded.pool.platformId, loaded.poolId, tokenAccount, solAccount, loaded.pool.vaultA, loaded.pool.vaultB, loaded.mintKey, WRAPPED_SOL, TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, platformVault, creatorVault, sellAmount, new BN(1), new BN(0));
  const spend = new BN(buy.quote.amountIn);
  const transaction = new Transaction({ feePayer: payer, recentBlockhash: buy.transaction.recentBlockhash! }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
    createAssociatedTokenAccountIdempotentInstruction(payer, tokenAccount, payer, loaded.mintKey, TOKEN_PROGRAM_ID),
    createAssociatedTokenAccountIdempotentInstruction(payer, solAccount, payer, WRAPPED_SOL, TOKEN_PROGRAM_ID),
    SystemProgram.transfer({ fromPubkey: payer, toPubkey: solAccount, lamports: BigInt(spend.toString()) }),
    createSyncNativeInstruction(solAccount),
    buy.transaction.instructions[buy.transaction.instructions.length - 2],
    sell,
    createCloseAccountInstruction(solAccount, payer, payer, [], TOKEN_PROGRAM_ID),
  );
  const simulation = await loaded.rpc.simulateTransaction(new VersionedTransaction(transaction.compileMessage()), { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
  if (simulation.value.err) throw new Error(`Devnet round-trip simulation failed: ${JSON.stringify(simulation.value.err).slice(0, 180)}`);
  return { simulationPassed: true as const, submitted: false as const, sellAmount: sellAmount.toString() };
}

export async function prepareDevnetTrade(input: { payer: string; mint: string; side: TradeSide; amount: string; slippage: number }) {
  const built = await buildDevnetTrade(input);
  const payer = new PublicKey(input.payer);
  const tokenAccount = getAssociatedTokenAddressSync(built.loaded.mintKey, payer, false, poolTokenProgram(built.loaded));
  const [fee, simulation, solLamports, token] = await Promise.all([
    built.loaded.rpc.getFeeForMessage(built.transaction.compileMessage(), "confirmed"),
    built.loaded.rpc.simulateTransaction(new VersionedTransaction(built.transaction.compileMessage()), { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" }),
    built.loaded.rpc.getBalance(payer, "confirmed"),
    readTokenRaw(built.loaded.rpc, tokenAccount),
  ]);
  if (fee.value === null) throw new Error("Devnet blockhash expired. Prepare the trade again.");
  if (simulation.value.err) {
    const logs = simulation.value.logs?.join(" ") ?? "";
    if (/insufficient/i.test(logs)) throw new Error("The wallet does not have enough Devnet SOL for this trade and its network fee. Nothing was signed.");
    throw new Error(`Devnet simulation failed before wallet signing: ${JSON.stringify(simulation.value.err).slice(0, 180)}`);
  }
  return {
    cluster: "devnet" as const,
    submitted: false as const,
    confirmed: false as const,
    simulationPassed: true as const,
    side: input.side,
    mint: input.mint,
    pool: built.loaded.poolId.toBase58(),
    ...built.quote,
    networkFeeLamports: fee.value,
    priorityFeeLamports: 0,
    solLamports: String(solLamports),
    tokenRaw: token.amount,
    raisedLamports: built.loaded.pool.realB.toString(),
    targetLamports: built.loaded.pool.totalFundRaisingB.toString(),
    progress: (() => {
      const raised = BigInt(built.loaded.pool.realB.toString());
      const target = BigInt(built.loaded.pool.totalFundRaisingB.toString());
      return target > BigInt(0) ? Number((raised * BigInt(10000)) / target) / 100 : 0;
    })(),
    lastValidBlockHeight: built.loaded.latest.lastValidBlockHeight,
    unsignedTransaction: Buffer.from(built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64"),
  };
}

export function assertSignedDevnetTrade(serialized: string, expected: Transaction, payer: PublicKey) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(serialized) || serialized.length > 6000) throw new Error("Signed transaction is invalid");
  const signed = Transaction.from(Buffer.from(serialized, "base64"));
  if (!signed.feePayer?.equals(payer) || !signed.serializeMessage().equals(expected.serializeMessage())) throw new Error("The wallet changed the reviewed trade. Nothing was submitted.");
  const expectedPrograms = expected.instructions.map(instruction => instruction.programId.toBase58());
  const usesCurve = expectedPrograms.includes(DEV_LAUNCHPAD_PROGRAM.toBase58());
  const usesCpmm = expectedPrograms.includes(DEVNET_CPMM_PROGRAM.toBase58());
  if (usesCurve === usesCpmm) throw new Error(usesCurve ? "A trade cannot use the bonding curve and the graduated pool together." : "This trade does not use a supported Devnet pool.");
  const allowedPrograms = new Set([
    (usesCpmm ? DEVNET_CPMM_PROGRAM : DEV_LAUNCHPAD_PROGRAM).toBase58(), TOKEN_PROGRAM_ID.toBase58(), ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
    SystemProgram.programId.toBase58(), ComputeBudgetProgram.programId.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58(),
  ]);
  for (const instruction of signed.instructions) {
    if (instruction.programId.equals(LAUNCHPAD_PROGRAM)) throw new Error("Mainnet LaunchLab program rejected");
    if (instruction.programId.equals(MAINNET_CPMM_PROGRAM)) throw new Error("Mainnet CPMM program rejected");
    if (!allowedPrograms.has(instruction.programId.toBase58())) throw new Error("Unexpected program in the trade");
  }
  if (!signed.verifySignatures()) throw new Error("The wallet signature could not be verified. Nothing was submitted.");
  return signed;
}

export async function submitDevnetTrade(input: { payer: string; mint: string; side: TradeSide; amount: string; slippage: number; transaction: string; lastValidBlockHeight: number }) {
  if (!Number.isSafeInteger(input.lastValidBlockHeight) || input.lastValidBlockHeight < 0) throw new DevnetBlockhashError("Devnet blockhash expiry is missing. Nothing was submitted.", "BLOCKHASH_REJECTED");
  let signed: Transaction;
  try {
    signed = Transaction.from(Buffer.from(input.transaction, "base64"));
    if (!signed.recentBlockhash) throw new Error("Devnet blockhash is required");
    const rebuilt = await buildDevnetTrade({ ...input, blockhash: signed.recentBlockhash });
    assertSignedDevnetTrade(input.transaction, rebuilt.transaction, new PublicKey(input.payer));
  } catch (error) {
    if (error instanceof DevnetBlockhashError) throw error;
    const message = error instanceof Error ? error.message : "Devnet trade did not finish";
    throw Object.assign(new Error(message), { code: "NOT_SUBMITTED" });
  }
  const rpc = connection();
  const gate = await sendExactSignedTransaction(rpc, input.transaction, input.lastValidBlockHeight);
  return afterDevnetBroadcast(gate.signature, async () => {
    const confirmation = await rpc.confirmTransaction({ signature: gate.signature, blockhash: gate.blockhash, lastValidBlockHeight: gate.lastValidBlockHeight }, "finalized");
    if (confirmation.value.err) throw new Error("Devnet rejected the trade");
    const status = await rpc.getSignatureStatuses([gate.signature], { searchTransactionHistory: true });
    const chain = status.value[0];
    if (!chain || chain.err || chain.confirmationStatus !== "finalized") throw new Error("Devnet did not finalize the trade");
    return { submitted: true as const, confirmed: true as const, cluster: "devnet" as const, signature: gate.signature, mint: input.mint, side: input.side, confirmationStatus: "finalized" as const };
  });
}
