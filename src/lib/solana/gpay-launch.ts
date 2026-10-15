import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { SealedMintKeypair, guardLaunchSubmission } from "./vanity-mint";

export function signMintMessage(sealed: SealedMintKeypair, message: Uint8Array) {
  const signature = sealed.sign(message);
  const publicKey = new PublicKey(sealed.publicKey).toBytes();
  if (!nacl.sign.detached.verify(message, signature, publicKey)) throw new Error("Mint signature failed");
  return signature;
}

/** Builds a transaction the mint must sign, then verifies that signature. Nothing is broadcast. */
export function constructMintSignedTransaction(sealed: SealedMintKeypair, payer: PublicKey, blockhash: string) {
  const mint = new PublicKey(sealed.publicKey);
  const transaction = new Transaction({ feePayer: payer, recentBlockhash: blockhash }).add(
    SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: mint, lamports: 1_000_000, space: 0, programId: SystemProgram.programId }),
  );
  const message = transaction.serializeMessage();
  const signature = signMintMessage(sealed, message);
  transaction.addSignature(mint, Buffer.from(signature));
  return { transaction, mint: sealed.publicKey, mintSigned: true, submitted: false as const };
}

export async function submitGpayLaunch(mint: string, cluster: string, send: (raw: Uint8Array) => Promise<string>) {
  guardLaunchSubmission(mint, cluster);
  return send(new Uint8Array());
}

export async function confirmLaunchedMint(reader: {
  getSignatureStatus: (signature: string) => Promise<{ confirmationStatus: string | null; err: unknown } | null>;
  accountExists: (mint: string) => Promise<boolean>;
}, signature: string, mint: string) {
  try { new PublicKey(mint); } catch { return { confirmed: false as const, mint, reason: "mint address invalid" }; }
  const status = await reader.getSignatureStatus(signature);
  if (!status || status.err || status.confirmationStatus !== "finalized") return { confirmed: false as const, mint, reason: "transaction not finalized" };
  const exists = await reader.accountExists(mint);
  return { confirmed: exists, mint, reason: exists ? "mint account found" : "mint account missing" };
}
