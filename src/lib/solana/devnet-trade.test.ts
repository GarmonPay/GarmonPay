import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { DEV_LAUNCHPAD_PROGRAM } from "@raydium-io/raydium-sdk-v2";
import { describe, expect, it } from "vitest";
import { priceImpactDecision, toRawUnits } from "./trade-form";
import { AUTHORIZED_PLATFORM_ADDRESSES } from "./platform-setup";
import { DEVNET_RPC } from "./launchlab-flow";
import { DEVNET_CPMM_PROGRAM, cpmmBuyWindow, quoteCpmmExactIn } from "./devnet-cpmm";
import { readDevnetMarket } from "./devnet-market";
import { buildDevnetTrade, curveCompletionAsk, prepareDevnetTrade, readDevnetPoolState, simulateDevnetGraduation, simulateDevnetRoundTrip, slippageBps, tradeAmount } from "./devnet-trade";

const FOX = "9myr1ZKYAAxvyXf8UmWwyeGmotXEakbVpAWEAZh4Be2e";
const FOX_SIGNATURE = "53fEomSkuEzbiMXPJhS3ijcMLzUtwc9dZnGVn8ZnXrsVVRDbm9FjhoD1Ntd7fgAgkktHNtsqcMqsJLnDzstsoB7N";

async function retryDevnet<T>(run: () => Promise<T>) {
  let last: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { return await run(); }
    catch (error) {
      last = error;
      const message = error instanceof Error ? error.message : "";
      if (attempt === 4 || !/429|rate limit/i.test(message)) throw error;
      await new Promise(resolve => setTimeout(resolve, 5000 * (attempt + 1)));
    }
  }
  throw last;
}

describe("Devnet trade guards", () => {
  it("rejects unsafe amounts and slippage before any network call", () => {
    expect(() => tradeAmount("buy", "999")).toThrow(/between/);
    expect(() => tradeAmount("buy", "2000000000")).toThrow(/between/);
    expect(() => slippageBps(9)).toThrow(/Slippage/);
    expect(slippageBps(100)).toBe(100);
    expect(curveCompletionAsk(BigInt(310))?.toString()).toBe("10000");
    expect(curveCompletionAsk(BigInt(17688))?.toString()).toBe("35376");
    expect(curveCompletionAsk(BigInt(0))).toBeNull();
    expect(() => tradeAmount("buy", "5000")).toThrow(/between/);
    expect(tradeAmount("buy", "5000", 1).toString()).toBe("5000");
    expect(toRawUnits("0.000009936", 9)).toBe("9936");
  });

  it("keeps the FOXNEW pool inside the 5.00% limit without lowering the limit", () => {
    const reserves = {
      solReserve: BigInt(209293),
      tokenReserve: BigInt("10000000000000"),
      tradeFeeRate: BigInt(2500),
      creatorFeeRate: BigInt(2500),
      protocolFeeRate: BigInt(120000),
      fundFeeRate: BigInt(40000),
      creatorOnInput: false,
    };
    const window = cpmmBuyWindow(reserves);
    expect(window.tradable).toBe(true);
    expect(window.minimumLamports).toBe("22");
    expect(window.maximumLamports).toBe("9936");
    expect(window.presetLamports).toBe("5000");
    const quote = (amount: bigint) => quoteCpmmExactIn({ ...reserves, inputReserve: reserves.solReserve, outputReserve: reserves.tokenReserve, amount, slippageBps: 100 });
    expect(quote(BigInt(1)).output).toBe(BigInt(0));
    expect(priceImpactDecision(quote(BigInt(21)).priceImpact).blocked).toBe(true);
    expect(priceImpactDecision(quote(BigInt(22)).priceImpact).blocked).toBe(false);
    expect(quote(BigInt(5000)).priceImpact).toBe("2.82%");
    expect(quote(BigInt(9936)).priceImpact).toBe("4.99%");
    expect(priceImpactDecision(quote(BigInt(9937)).priceImpact).blocked).toBe(true);
    expect(quote(BigInt(10000)).priceImpact).toBe("5.02%");
    expect(priceImpactDecision("5.02%").blocked).toBe(true);
    expect(quote(BigInt(5000)).output.toString()).toBe("232151040693");
    expect(quote(BigInt(5000)).minimum.toString()).toBe("229829530286");
  });
});

describe.runIf(process.env.RUN_DEVNET_READ_TESTS === "1")("FOXNEW Devnet verification", () => {
  it("reads the graduated pool and simulates a CPMM buy and sell without sending either", async () => {
    const loaded = await retryDevnet(() => readDevnetPoolState(FOX));
    expect(loaded.pool.creator.toBase58()).toBe(AUTHORIZED_PLATFORM_ADDRESSES.admin);
    expect(loaded.pool.status).toBe(2);
    expect(loaded.cpmm?.poolId.toBase58()).toBe("rKDtk4T7gA1HBQfuoPetifrFUUtv4rVHGaUtJSXi97h");
    expect(loaded.venue).toBe("cpmm");
    const connection = new Connection(DEVNET_RPC, { commitment: "finalized", disableRetryOnRateLimit: true });
    const recorded = await retryDevnet(() => connection.getTransaction(FOX_SIGNATURE, { commitment: "finalized", maxSupportedTransactionVersion: 0 }));
    expect(recorded?.blockTime).toBe(Math.floor(Date.parse("2026-10-14T21:17:19.000Z") / 1000));
    let market: Awaited<ReturnType<typeof readDevnetMarket>> = null;
    market = await retryDevnet(() => readDevnetMarket(FOX));
    expect(market?.status).toBe("Graduated");
    expect(market?.venue).toBe("cpmm");
    expect(market?.cpmmPool).toBe("rKDtk4T7gA1HBQfuoPetifrFUUtv4rVHGaUtJSXi97h");
    expect(market?.priceSource).toBe("cpmm-reserves");
    expect(market?.liquidityPlace).toBe("cpmm");
    expect(market?.chartKind).toBe("cpmm-trades");
    expect(market?.points).toEqual([]);
    expect(market?.cpmmFees).toMatchObject({ trade: "2500", creator: "2500", denominator: "1000000" });
    const migration = market?.trades.find(trade => trade.signature.startsWith("4AV8ihSg"));
    expect(migration?.side).toBe("migration");
    expect(migration?.venue).toBe("migration");
    expect(market?.trades.some(trade => trade.signature.startsWith("5ywEKvwu") && trade.side === "sell")).toBe(true);
    await expect(retryDevnet(() => prepareDevnetTrade({ payer: AUTHORIZED_PLATFORM_ADDRESSES.admin, mint: FOX, side: "buy", amount: "10000", slippage: 100 }))).rejects.toThrow(/5\.00% Devnet limit/);
    const prepared = await retryDevnet(() => prepareDevnetTrade({ payer: AUTHORIZED_PLATFORM_ADDRESSES.admin, mint: FOX, side: "buy", amount: "5000", slippage: 100 }));
    expect(prepared.simulationPassed).toBe(true);
    expect(prepared.submitted).toBe(false);
    expect(prepared.amountIn).toBe("5000");
    expect(priceImpactDecision(prepared.priceImpact).blocked).toBe(false);
    expect(BigInt(prepared.expectedOut) > BigInt(prepared.minimumOut)).toBe(true);
    expect(prepared.networkFeeLamports).toBeGreaterThan(0);
    expect(prepared.unsignedTransaction.length).toBeGreaterThan(0);
    expect(market?.cpmmBuy?.tradable).toBe(true);
    expect(market?.cpmmBuy?.presetLamports).toBe("5000");
    const sell = await retryDevnet(() => buildDevnetTrade({ payer: AUTHORIZED_PLATFORM_ADDRESSES.admin, mint: FOX, side: "sell", amount: "100000000", slippage: 100 }));
    expect(sell.quote.venue).toBe("cpmm");
    expect(BigInt(sell.quote.expectedOut) > BigInt(sell.quote.minimumOut)).toBe(true);
    expect(priceImpactDecision(sell.quote.priceImpact).blocked).toBe(false);
    const unsignedSell = sell.transaction;
    expect(unsignedSell.instructions.some(instruction => instruction.programId.equals(DEVNET_CPMM_PROGRAM))).toBe(true);
    expect(unsignedSell.instructions.some(instruction => instruction.programId.equals(DEV_LAUNCHPAD_PROGRAM))).toBe(false);
    const forbidden = ["CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C", "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj"];
    const wsol = getAssociatedTokenAddressSync(NATIVE_MINT, new PublicKey(AUTHORIZED_PLATFORM_ADDRESSES.admin));
    for (const unsigned of [unsignedSell]) {
      expect(unsigned.instructions.some(instruction => forbidden.includes(instruction.programId.toBase58()))).toBe(false);
      expect(unsigned.instructions.every(instruction => ["ComputeBudget111111111111111111111111111111", "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", SystemProgram.programId.toBase58(), TOKEN_PROGRAM_ID.toBase58(), DEVNET_CPMM_PROGRAM.toBase58()].includes(instruction.programId.toBase58()))).toBe(true);
      expect([...new Set(unsigned.instructions.flatMap(instruction => instruction.keys.filter(key => key.isSigner).map(key => key.pubkey.toBase58())))]).toEqual([AUTHORIZED_PLATFORM_ADDRESSES.admin]);
      for (const instruction of unsigned.instructions) {
        if (instruction.programId.equals(SystemProgram.programId)) expect(instruction.keys[1]?.pubkey.equals(wsol)).toBe(true);
        if (instruction.programId.equals(TOKEN_PROGRAM_ID) && instruction.data[0] === 9) expect(instruction.keys[1]?.pubkey.toBase58()).toBe(AUTHORIZED_PLATFORM_ADDRESSES.admin);
        if (instruction.programId.equals(TOKEN_PROGRAM_ID)) expect([4, 6]).not.toContain(instruction.data[0]);
      }
    }
    await expect(retryDevnet(() => simulateDevnetGraduation({ payer: AUTHORIZED_PLATFORM_ADDRESSES.admin, mint: FOX }))).rejects.toThrow(/not on the bonding curve/);
    await expect(retryDevnet(() => prepareDevnetTrade({ payer: AUTHORIZED_PLATFORM_ADDRESSES.admin, mint: FOX, side: "sell", amount: "1000000000000", slippage: 100 }))).rejects.toThrow(/5\.00% Devnet limit|too small|could not be calculated|No order was created/);
    await expect(retryDevnet(() => prepareDevnetTrade({ payer: AUTHORIZED_PLATFORM_ADDRESSES.admin, mint: FOX, side: "buy", amount: "50000", slippage: 100 }))).rejects.toThrow(/5\.00% Devnet limit/);
  }, 180000);
});
