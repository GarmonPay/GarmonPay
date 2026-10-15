import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction,
  createSyncNativeInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import BN from "bn.js";
import {
  CREATE_CPMM_POOL_PROGRAM, CpmmConfigInfoLayout, CpmmPoolInfoLayout, CurveCalculator, DEVNET_PROGRAM_ID,
  DEV_LAUNCHPAD_PROGRAM, LAUNCHPAD_PROGRAM, getCpmmPdaPoolId, getPdaPoolAuthority, makeSwapCpmmBaseInInstruction,
} from "@raydium-io/raydium-sdk-v2";
import { DEVNET_CPMM_CONFIG } from "./launchlab-flow";
import { formatFeePercent } from "./launch-fees";
import { priceImpactBps } from "./trade-form";

const WRAPPED_SOL = new PublicKey("So11111111111111111111111111111111111111112");

export const DEVNET_CPMM_PROGRAM = DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM;
export const MAINNET_CPMM_PROGRAM = CREATE_CPMM_POOL_PROGRAM;

export async function discoverDevnetCpmmPool(rpc: Connection, mint: PublicKey, configId: PublicKey) {
  if (!configId.equals(DEVNET_CPMM_CONFIG) || DEVNET_CPMM_PROGRAM.equals(MAINNET_CPMM_PROGRAM)) return null;
  const candidates = [
    getCpmmPdaPoolId(DEVNET_CPMM_PROGRAM, configId, mint, WRAPPED_SOL).publicKey,
    getCpmmPdaPoolId(DEVNET_CPMM_PROGRAM, configId, WRAPPED_SOL, mint).publicKey,
  ];
  for (const poolId of candidates) {
    const account = await rpc.getAccountInfo(poolId, "confirmed");
    if (!account || !account.owner.equals(DEVNET_CPMM_PROGRAM)) continue;
    const pool = CpmmPoolInfoLayout.decode(account.data);
    const actual = [pool.mintA.toBase58(), pool.mintB.toBase58()].sort();
    const expected = [mint.toBase58(), WRAPPED_SOL.toBase58()].sort();
    if (actual[0] !== expected[0] || actual[1] !== expected[1] || !pool.configId.equals(configId)) continue;
    return { poolId, pool };
  }
  return null;
}

export function cpmmCreatorFeeOnInput(feeOn: number, inputIsA: boolean) {
  return feeOn === 0 || feeOn === (inputIsA ? 2 : 1);
}

export function quoteCpmmExactIn(input: {
  amount: bigint;
  inputReserve: bigint;
  outputReserve: bigint;
  tradeFeeRate: bigint;
  creatorFeeRate: bigint;
  protocolFeeRate: bigint;
  fundFeeRate: bigint;
  creatorOnInput: boolean;
  slippageBps: number;
}) {
  const quoted = CurveCalculator.swapBaseInput(
    new BN(input.amount.toString()), new BN(input.inputReserve.toString()), new BN(input.outputReserve.toString()),
    new BN(input.tradeFeeRate.toString()), new BN(input.creatorFeeRate.toString()),
    new BN(input.protocolFeeRate.toString()), new BN(input.fundFeeRate.toString()), input.creatorOnInput,
  );
  const output = BigInt(quoted.outputAmount.toString());
  const minimum = input.slippageBps >= 0 && input.slippageBps <= 10000
    ? (output * BigInt(10000 - input.slippageBps)) / BigInt(10000)
    : BigInt(0);
  return {
    output,
    minimum,
    tradeFee: BigInt(quoted.tradeFee.toString()),
    creatorFee: BigInt(quoted.creatorFee.toString()),
    protocolFee: BigInt(quoted.protocolFee.toString()),
    fundFee: BigInt(quoted.fundFee.toString()),
    priceImpact: impactPercent(input.inputReserve, input.outputReserve, input.amount, output),
  };
}

export type CpmmBuyWindow = {
  tradable: boolean;
  solReserve: string;
  minimumLamports: string | null;
  maximumLamports: string | null;
  presetLamports: string | null;
  preset: { expectedOut: string; minimumOut: string; priceImpact: string | null; tradeFee: string; creatorFee: string } | null;
};

/** Smallest and largest CPMM buys that stay under the 5.00% impact block at 1% slippage. */
export function cpmmBuyWindow(input: {
  solReserve: bigint;
  tokenReserve: bigint;
  tradeFeeRate: bigint;
  creatorFeeRate: bigint;
  protocolFeeRate: bigint;
  fundFeeRate: bigint;
  creatorOnInput: boolean;
}): CpmmBuyWindow {
  const absoluteMax = BigInt("1000000000");
  const rates = {
    inputReserve: input.solReserve, outputReserve: input.tokenReserve,
    tradeFeeRate: input.tradeFeeRate, creatorFeeRate: input.creatorFeeRate,
    protocolFeeRate: input.protocolFeeRate, fundFeeRate: input.fundFeeRate, creatorOnInput: input.creatorOnInput, slippageBps: 100,
  };
  const allowed = (amount: bigint) => {
    if (amount <= BigInt(0) || amount > absoluteMax) return false;
    const quote = quoteCpmmExactIn({ ...rates, amount });
    const bps = priceImpactBps(quote.priceImpact);
    return quote.output > BigInt(0) && quote.minimum > BigInt(0) && bps !== null && bps >= 0 && bps < 500;
  };
  const scanCap = input.solReserve > BigInt(0) && input.solReserve < BigInt(200000) ? input.solReserve : BigInt(200000);
  let minimum: bigint | null = null;
  for (let amount = BigInt(1); amount <= scanCap; amount += BigInt(1)) {
    if (allowed(amount)) { minimum = amount; break; }
  }
  const empty: CpmmBuyWindow = { tradable: false, solReserve: input.solReserve.toString(), minimumLamports: null, maximumLamports: null, presetLamports: null, preset: null };
  if (minimum === null) return empty;
  let low = minimum;
  let high = input.solReserve > BigInt(0) && input.solReserve < absoluteMax ? input.solReserve : absoluteMax;
  let maximum = minimum;
  while (low <= high) {
    const mid = (low + high) / BigInt(2);
    if (allowed(mid)) { maximum = mid; low = mid + BigInt(1); }
    else high = mid - BigInt(1);
  }
  const presets = [BigInt(5000), BigInt(10000), BigInt(50000)];
  const presetAmount = presets.find(amount => amount >= minimum && amount <= maximum) ?? maximum;
  const preset = quoteCpmmExactIn({ ...rates, amount: presetAmount });
  return {
    tradable: true,
    solReserve: input.solReserve.toString(),
    minimumLamports: minimum.toString(),
    maximumLamports: maximum.toString(),
    presetLamports: presetAmount.toString(),
    preset: {
      expectedOut: preset.output.toString(),
      minimumOut: preset.minimum.toString(),
      priceImpact: preset.priceImpact,
      tradeFee: preset.tradeFee.toString(),
      creatorFee: preset.creatorFee.toString(),
    },
  };
}

function impactPercent(inputReserve: bigint, outputReserve: bigint, input: bigint, output: bigint) {
  if (inputReserve <= BigInt(0) || outputReserve <= BigInt(0) || input <= BigInt(0) || output <= BigInt(0)) return null;
  const scale = BigInt("1000000000000000000");
  const spot = (outputReserve * scale) / inputReserve;
  const execution = (output * scale) / input;
  if (spot <= BigInt(0)) return null;
  const bps = ((spot - execution) * BigInt(10000)) / spot;
  const negative = bps < BigInt(0);
  const absolute = negative ? -bps : bps;
  return `${negative ? "-" : ""}${(absolute / BigInt(100)).toString()}.${(absolute % BigInt(100)).toString().padStart(2, "0")}%`;
}

export async function buildDevnetCpmmTrade(input: {
  rpc: Connection;
  payer: PublicKey;
  mintKey: PublicKey;
  cpmm: NonNullable<Awaited<ReturnType<typeof discoverDevnetCpmmPool>>>;
  side: "buy" | "sell";
  amount: { toString(): string };
  slippage: number;
  blockhash: string;
}) {
  if (input.cpmm.pool.status !== 0) throw new Error("The graduated Raydium pool is not open. No order was created.");
  const configAccount = await input.rpc.getAccountInfo(input.cpmm.pool.configId, "confirmed");
  if (!configAccount || !configAccount.owner.equals(DEVNET_CPMM_PROGRAM)) throw new Error("The graduated pool config is not on Devnet. No order was created.");
  const config = CpmmConfigInfoLayout.decode(configAccount.data);
  const [vaultA, vaultB] = await Promise.all([
    input.rpc.getTokenAccountBalance(input.cpmm.pool.vaultA, "confirmed"),
    input.rpc.getTokenAccountBalance(input.cpmm.pool.vaultB, "confirmed"),
  ]);
  const buying = input.side === "buy";
  const inputMint = buying ? WRAPPED_SOL : input.mintKey;
  const outputMint = buying ? input.mintKey : WRAPPED_SOL;
  const inputIsA = input.cpmm.pool.mintA.equals(inputMint);
  const inputVault = inputIsA ? input.cpmm.pool.vaultA : input.cpmm.pool.vaultB;
  const outputVault = inputIsA ? input.cpmm.pool.vaultB : input.cpmm.pool.vaultA;
  const inputProgram = inputIsA ? input.cpmm.pool.mintProgramA : input.cpmm.pool.mintProgramB;
  const outputProgram = inputIsA ? input.cpmm.pool.mintProgramB : input.cpmm.pool.mintProgramA;
  const inputReserve = new BN(inputIsA ? vaultA.value.amount : vaultB.value.amount);
  const outputReserve = new BN(inputIsA ? vaultB.value.amount : vaultA.value.amount);
  const creatorOnInput = cpmmCreatorFeeOnInput(input.cpmm.pool.feeOn, inputIsA);
  const amount = new BN(input.amount.toString());
  const exact = quoteCpmmExactIn({
    amount: BigInt(amount.toString()),
    inputReserve: BigInt(inputReserve.toString()),
    outputReserve: BigInt(outputReserve.toString()),
    tradeFeeRate: BigInt(config.tradeFeeRate.toString()),
    creatorFeeRate: BigInt(config.creatorFeeRate.toString()),
    protocolFeeRate: BigInt(config.protocolFeeRate.toString()),
    fundFeeRate: BigInt(config.fundFeeRate.toString()),
    creatorOnInput,
    slippageBps: input.slippage,
  });
  if (exact.minimum <= BigInt(0)) throw new Error("The quoted amount is too small for this slippage");
  const minimum = new BN(exact.minimum.toString());
  const tokenProgram = input.cpmm.pool.mintA.equals(input.mintKey) ? input.cpmm.pool.mintProgramA : input.cpmm.pool.mintProgramB;
  const tokenAccount = getAssociatedTokenAddressSync(input.mintKey, input.payer, false, tokenProgram);
  const solAccount = getAssociatedTokenAddressSync(WRAPPED_SOL, input.payer, false, TOKEN_PROGRAM_ID);
  const authority = getPdaPoolAuthority(DEVNET_CPMM_PROGRAM).publicKey;
  const swap = makeSwapCpmmBaseInInstruction(
    DEVNET_CPMM_PROGRAM, input.payer, authority, input.cpmm.pool.configId, input.cpmm.poolId,
    buying ? solAccount : tokenAccount, buying ? tokenAccount : solAccount,
    inputVault, outputVault, inputProgram, outputProgram, inputMint, outputMint, input.cpmm.pool.observationId,
    amount, minimum,
  );
  if (!swap.programId.equals(DEVNET_CPMM_PROGRAM) || swap.programId.equals(MAINNET_CPMM_PROGRAM)) throw new Error("Mainnet CPMM program rejected");
  const instructions = [
    createAssociatedTokenAccountIdempotentInstruction(input.payer, tokenAccount, input.payer, input.mintKey, tokenProgram),
    createAssociatedTokenAccountIdempotentInstruction(input.payer, solAccount, input.payer, WRAPPED_SOL, TOKEN_PROGRAM_ID),
    ...(buying ? [SystemProgram.transfer({ fromPubkey: input.payer, toPubkey: solAccount, lamports: BigInt(amount.toString()) }), createSyncNativeInstruction(solAccount)] : []),
    swap,
    createCloseAccountInstruction(solAccount, input.payer, input.payer, [], TOKEN_PROGRAM_ID),
  ];
  const transaction = new Transaction({ feePayer: input.payer, recentBlockhash: input.blockhash }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
    ...instructions,
  );
  const tradeRate = config.tradeFeeRate.toString();
  const creatorRate = config.creatorFeeRate.toString();
  const protocolRate = config.protocolFeeRate.toString();
  const fundRate = config.fundFeeRate.toString();
  const tradeUnit = buying ? "lamports" : "raw tokens";
  const creatorUnit = creatorOnInput === buying ? "lamports" : "raw tokens";
  const creatorSide = creatorOnInput ? "the tokens paid in" : "the tokens received";
  if (transaction.instructions.some(instruction => instruction.programId.equals(LAUNCHPAD_PROGRAM) || instruction.programId.equals(DEV_LAUNCHPAD_PROGRAM))) {
    throw new Error("A graduated trade cannot use the bonding curve. No order was created.");
  }
  return {
    transaction,
    quote: {
      venue: "cpmm" as const,
      expectedOut: exact.output.toString(),
      minimumOut: minimum.toString(),
      amountIn: amount.toString(),
      requestedAmount: amount.toString(),
      graduates: false,
      priceImpact: exact.priceImpact,
      fees: { platform: "0", creator: creatorRate, protocol: tradeRate, denominator: "1000000" },
      split: { platform: exact.fundFee.toString(), creator: exact.creatorFee.toString(), protocol: exact.tradeFee.toString() },
      feeNote: `Raydium CPMM trade fee ${formatFeePercent(tradeRate)} (${exact.tradeFee.toString()} ${tradeUnit}). Creator fee ${formatFeePercent(creatorRate)} (${exact.creatorFee.toString()} ${creatorUnit}) is taken from ${creatorSide}. Protocol takes ${formatFeePercent(protocolRate)} of the trade fee and the fund fee takes ${formatFeePercent(fundRate)} of the trade fee. This order does not use the LaunchLab bonding curve.`,
    },
  };
}
