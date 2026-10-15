import { ComputeBudgetProgram, Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { LAUNCHPAD_PROGRAM } from "@raydium-io/raydium-sdk-v2";
import { describe, expect, it } from "vitest";
import { buildPlatformConfigTransaction, assertSignedPlatformTransaction } from "./platform-transaction";
import { reviewWalletLaunch, reviewWalletResult } from "./devnet-wallet-review";
import { afterDevnetBroadcast, DevnetSubmissionError } from "./devnet-submission";

function fixture() {
  const admin = Keypair.generate();
  const wallets = { admin: admin.publicKey, fee: Keypair.generate().publicKey, nft: Keypair.generate().publicKey, vesting: Keypair.generate().publicKey };
  const transaction = Transaction.from(Buffer.from(buildPlatformConfigTransaction(wallets, Keypair.generate().publicKey.toBase58(), "5445760").unsignedTransaction, "base64"));
  return { admin, wallets, transaction };
}
describe("wallet-reviewed Devnet LaunchLab envelope", () => {
  it("accepts the explicit zero-price budget, exact platform accounts and admin signature", () => {
    const { admin, wallets, transaction } = fixture();
    const reviewed = reviewWalletLaunch(transaction, admin.publicKey.toBase58());
    transaction.sign(admin);
    expect(() => reviewWalletResult(transaction, reviewed)).not.toThrow();
    expect(assertSignedPlatformTransaction(transaction.serialize().toString("base64"), wallets).verifySignatures()).toBe(true);
  });
  it("reproduces the old one-instruction rejection when a wallet adds priority instructions", () => {
    const { transaction } = fixture();
    const legacy = new Transaction({ feePayer: transaction.feePayer, recentBlockhash: transaction.recentBlockhash }).add(transaction.instructions[2]);
    expect(legacy.instructions.length).toBe(1);
    legacy.instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }));
    expect(legacy.instructions.length !== 1).toBe(true);
    expect(() => reviewWalletLaunch(legacy, legacy.feePayer!.toBase58())).toThrow(/incomplete/);
  });
  it.each(["fee", "transfer", "program", "account", "blockhash", "budget"])("rejects a signed %s mutation before broadcast", change => {
    const { admin, wallets, transaction } = fixture();
    const reviewed = reviewWalletLaunch(transaction, admin.publicKey.toBase58());
    if (change === "fee") transaction.instructions[1] = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 });
    if (change === "transfer") transaction.add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: wallets.fee, lamports: 1 }));
    if (change === "program") transaction.instructions[2].programId = LAUNCHPAD_PROGRAM;
    if (change === "account") transaction.instructions[2].keys[1].isWritable = !transaction.instructions[2].keys[1].isWritable;
    if (change === "blockhash") transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
    if (change === "budget") transaction.instructions[0] = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
    transaction.sign(admin);
    expect(() => reviewWalletResult(transaction, reviewed)).toThrow(/changed/);
    if (change !== "blockhash") expect(() => assertSignedPlatformTransaction(transaction.serialize().toString("base64"), wallets)).toThrow();
  });
  it("rejects Mainnet instructions and unexpected fee payer before requesting signatures", () => {
    const { admin, transaction } = fixture();
    expect(() => reviewWalletLaunch(transaction, Keypair.generate().publicKey.toBase58())).toThrow(/incomplete/);
    transaction.instructions[2].programId = LAUNCHPAD_PROGRAM;
    expect(() => reviewWalletLaunch(transaction, admin.publicKey.toBase58())).toThrow(/Devnet LaunchLab/);
  });
  it("retains the submitted chain ID when later verification fails", async () => {
    try { await afterDevnetBroadcast("public-chain-id", async () => { throw new Error("timeout"); }); }
    catch (error) { expect(error).toBeInstanceOf(DevnetSubmissionError); expect((error as DevnetSubmissionError).signature).toBe("public-chain-id"); }
    await expect(afterDevnetBroadcast("public-chain-id", async () => ({ confirmed: true }))).resolves.toEqual({ confirmed: true });
  });
});
