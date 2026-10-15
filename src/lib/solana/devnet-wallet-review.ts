import { ComputeBudgetProgram, PublicKey, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { DEV_LAUNCHPAD_PROGRAM } from "@raydium-io/raydium-sdk-v2";

/** Only the fixed Devnet LaunchLab envelope can reach the wallet prompt. */
export function reviewWalletLaunch(transaction: Transaction, payer: string, mint?: string) {
  if (!transaction.recentBlockhash || transaction.instructions.length !== 3 || transaction.feePayer?.toBase58() !== payer) throw new Error("Devnet transaction is incomplete. Nothing was signed.");
  const [limit, price, launch] = transaction.instructions;
  const wantedLimit = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
  const wantedPrice = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 });
  for (const [actual, expected] of [[limit, wantedLimit], [price, wantedPrice]]) {
    if (!actual.programId.equals(expected.programId) || actual.keys.length || !actual.data.equals(expected.data)) throw new Error("The reviewed zero-price compute budget is required.");
  }
  if (!launch.programId.equals(DEV_LAUNCHPAD_PROGRAM)) throw new Error("Only the Devnet LaunchLab program can be signed.");
  if (mint) new PublicKey(mint);
  const message = transaction.compileMessage();
  const signers = message.accountKeys.slice(0, message.header.numRequiredSignatures).map(key => key.toBase58()).sort();
  const expected = (mint ? [payer, mint] : [payer]).sort();
  if (JSON.stringify(signers) !== JSON.stringify(expected)) throw new Error("Unexpected signer in the Devnet transaction.");
  return Buffer.from(transaction.serializeMessage()).toString("base64");
}

export function reviewWalletResult(signed: Transaction, reviewedMessage: string) {
  if (Buffer.from(signed.serializeMessage()).toString("base64") !== reviewedMessage) throw new Error("The wallet changed the reviewed transaction or its costs. Nothing was submitted. Prepare a new transaction.");
  if (!signed.verifySignatures()) throw new Error("The wallet signature could not be verified. Nothing was submitted.");
}
