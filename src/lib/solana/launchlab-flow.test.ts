import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { LAUNCHPAD_PROGRAM } from "@raydium-io/raydium-sdk-v2";
import { describe, expect, it } from "vitest";
import { describeTradingFees, feeSplitFitsCaps, formatFeePercent, launchMetadataUri, nextLaunchAction } from "./launch-fees";
import { assertLaunchInstructions, devnetLaunchAllowed, interpretChainResult } from "./launchlab-flow";
import { claimReadyMint } from "./vanity-jobs";

describe("LaunchLab fee and launch guards", () => {
  it("accepts only documented splits where the platform fee is larger", () => {
    const fees = describeTradingFees();
    expect(fees.largerSplitFitsDocumentedCaps).toBe(true);
    expect(fees.priorSplitFitsDocumentedCaps).toBe(true);
    expect(fees.largerAllInRate).toBe("17500");
    expect(fees.priorAllInRate).toBe("12500");
    expect(fees.holderRewards).toBe("unsupported");
    expect(fees.postGraduationCreatorScale).toBe("0");
    expect(fees.garmonPayLaunchFeeCharged).toBe(false);
    expect(formatFeePercent(fees.largerPlatformFee)).toBe("1.20%");
    expect(formatFeePercent(fees.largerCreatorFee)).toBe("0.30%");
    expect(formatFeePercent(fees.protocolTradeFeeRate)).toBe("0.25%");
    expect(formatFeePercent(fees.largerAllInRate)).toBe("1.75%");
    expect(fees.productionLaunchEnabled).toBe(false);
    expect(feeSplitFitsCaps({ platform: "60000", creator: "3000" }).supported).toBe(false);
    expect(feeSplitFitsCaps({ platform: "3000", creator: "3000" }).supported).toBe(false);
    expect(JSON.stringify(fees)).not.toMatch(/secret|privateKey|seed/i);
  });

  it("keeps devnet execution off unless every guard matches", () => {
    const env = { NODE_ENV: "test", GARMONPAY_DEVNET_LAUNCH: "1", SOLANA_CLUSTER: "devnet" } as NodeJS.ProcessEnv;
    expect(devnetLaunchAllowed(env, "https://api.devnet.solana.com")).toBe(true);
    expect(devnetLaunchAllowed({ ...env, NODE_ENV: "production" }, "https://api.devnet.solana.com")).toBe(false);
    expect(devnetLaunchAllowed({ ...env, SOLANA_CLUSTER: "mainnet-beta" }, "https://api.devnet.solana.com")).toBe(false);
    expect(devnetLaunchAllowed(env, "https://api.mainnet-beta.solana.com")).toBe(false);
    expect(devnetLaunchAllowed({ ...env, GARMONPAY_DEVNET_LAUNCH: undefined }, "https://api.devnet.solana.com")).toBe(false);
  });

  it("rejects a second initialization and a failed confirmation", () => {
    expect(nextLaunchAction({ mintExists: false, poolExists: false, sellConfirmed: false, memory: "none" })).toBe("create");
    expect(nextLaunchAction({ mintExists: true, poolExists: true, sellConfirmed: false, memory: "none" })).toBe("sell-only");
    expect(nextLaunchAction({ mintExists: true, poolExists: false, sellConfirmed: false, memory: "none" })).toBe("incomplete-stop");
    expect(nextLaunchAction({ mintExists: true, poolExists: true, sellConfirmed: true, memory: "none" })).toBe("stop");
    expect(nextLaunchAction({ mintExists: false, poolExists: false, sellConfirmed: false, memory: "confirmed" })).toBe("stop");
    expect(interpretChainResult(null, true).successful).toBe(false);
    expect(interpretChainResult({ err: { InstructionError: [0, "Custom"] }, confirmationStatus: "finalized" }, true).successful).toBe(false);
    expect(interpretChainResult({ err: null, confirmationStatus: "processed" }, true).successful).toBe(false);
    expect(interpretChainResult({ err: null, confirmationStatus: "finalized" }, false).successful).toBe(false);
    expect(interpretChainResult({ err: null, confirmationStatus: "finalized" }, true).successful).toBe(true);
    expect(() => claimReadyMint("missing-job")).toThrow(/ready/);
    const metadata = launchMetadataUri({ name: "Garmon Check", symbol: "GPAYDEV", description: "Disposable devnet check", keywords: "gpay" });
    expect(metadata.uri.length).toBeLessThanOrEqual(200);
    expect(metadata.artworkStored).toBe(false);
    expect(() => launchMetadataUri({ name: "", symbol: "!!!", description: "", keywords: "" })).toThrow(/required/);
  });

  it("rejects the mainnet LaunchLab program before submission", () => {
    const payer = Keypair.generate();
    const blocked = new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: payer.publicKey, lamports: 1 }));
    blocked.instructions[0].programId = LAUNCHPAD_PROGRAM;
    expect(() => assertLaunchInstructions(blocked)).toThrow(/Mainnet/);
    const empty = new Transaction();
    expect(() => assertLaunchInstructions(empty)).toThrow(/empty/);
    payer.secretKey.fill(0);
  });
});
